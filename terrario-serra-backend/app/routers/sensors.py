from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import os
import logging

from app.database import get_db
from app.models.sensor import Sensor, Reading
from app.models.zone import Zone
from app.providers.nous_provider import NousE6Provider
from app.schemas.sensor import SensorResponse, ReadingResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/sensors", tags=["sensors"])

def get_nous_provider() -> NousE6Provider:
    """Get configured Nous E6 provider instance"""
    access_id = os.getenv("TUYA_ACCESS_KEY")  # Nous E6 uses same Tuya credentials
    access_secret = os.getenv("TUYA_SECRET_KEY")
    region = os.getenv("TUYA_REGION", "eu")
    
    if not access_id or not access_secret:
        raise HTTPException(status_code=500, detail="Tuya credentials not configured")
    
    return NousE6Provider(access_id, access_secret, region)

@router.get("/", response_model=List[SensorResponse])
async def list_sensors(db: Session = Depends(get_db)):
    """Get all sensors"""
    sensors = db.query(Sensor).all()
    return sensors

@router.get("/{sensor_id}", response_model=SensorResponse)
async def get_sensor(sensor_id: int, db: Session = Depends(get_db)):
    """Get sensor by ID"""
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return sensor

@router.get("/{sensor_id}/reading")
async def get_sensor_reading(sensor_id: int, db: Session = Depends(get_db)):
    """Get real-time reading from sensor"""
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    if sensor.provider != "nous_e6":
        raise HTTPException(status_code=400, detail="Sensor is not a Nous E6 sensor")
    
    try:
        nous = get_nous_provider()
        reading = await nous.get_sensor_reading(sensor.provider_sensor_id)
        
        if not reading.get("success"):
            raise HTTPException(status_code=500, detail=f"Failed to get sensor reading: {reading.get('error')}")
        
        readings_data = reading.get("readings", {})
        
        if "temperature" in readings_data:
            temp_reading = Reading(
                sensor_id=sensor_id,
                value=readings_data["temperature"],
                unit="°C"
            )
            db.add(temp_reading)
        
        if "humidity" in readings_data:
            humidity_reading = Reading(
                sensor_id=sensor_id,
                value=readings_data["humidity"],
                unit="%"
            )
            db.add(humidity_reading)
        
        db.commit()
        
        return reading
        
    except Exception as e:
        logger.error(f"Error getting sensor reading: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/zone/{zone_id}/readings")
async def get_zone_sensor_readings(zone_id: int, db: Session = Depends(get_db)):
    """Get readings from all sensors in a zone"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    sensors = db.query(Sensor).filter(Sensor.zone_id == zone_id).all()
    
    if not sensors:
        return {
            "success": True,
            "zone_id": zone_id,
            "sensors": [],
            "message": "No sensors found in zone"
        }
    
    try:
        nous = get_nous_provider()
        readings = []
        
        for sensor in sensors:
            if sensor.provider == "nous_e6":
                reading = await nous.get_sensor_reading(sensor.provider_sensor_id)
                if reading.get("success"):
                    reading["sensor_name"] = sensor.name
                    reading["sensor_id"] = sensor.id
                    readings.append(reading)
                    
                    readings_data = reading.get("readings", {})
                    
                    if "temperature" in readings_data:
                        temp_reading = Reading(
                            sensor_id=sensor.id,
                            value=readings_data["temperature"],
                            unit="°C"
                        )
                        db.add(temp_reading)
                    
                    if "humidity" in readings_data:
                        humidity_reading = Reading(
                            sensor_id=sensor.id,
                            value=readings_data["humidity"],
                            unit="%"
                        )
                        db.add(humidity_reading)
        
        db.commit()
        
        return {
            "success": True,
            "zone_id": zone_id,
            "zone_name": zone.name,
            "readings": readings
        }
        
    except Exception as e:
        logger.error(f"Error getting zone sensor readings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/zone/{zone_id}/latest")
async def get_zone_latest_readings(zone_id: int, db: Session = Depends(get_db)):
    """Get latest stored readings for a zone"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    sensors = db.query(Sensor).filter(Sensor.zone_id == zone_id).all()
    
    zone_readings = []
    for sensor in sensors:
        latest_temp = db.query(Reading).filter(
            Reading.sensor_id == sensor.id,
            Reading.unit == "°C"
        ).order_by(Reading.observed_at.desc()).first()
        
        latest_humidity = db.query(Reading).filter(
            Reading.sensor_id == sensor.id,
            Reading.unit == "%"
        ).order_by(Reading.observed_at.desc()).first()
        
        sensor_data = {
            "sensor_id": sensor.id,
            "sensor_name": sensor.name,
            "provider_sensor_id": sensor.provider_sensor_id,
            "temperature": {
                "value": latest_temp.value if latest_temp else None,
                "unit": latest_temp.unit if latest_temp else None,
                "timestamp": latest_temp.observed_at.isoformat() if latest_temp else None
            },
            "humidity": {
                "value": latest_humidity.value if latest_humidity else None,
                "unit": latest_humidity.unit if latest_humidity else None,
                "timestamp": latest_humidity.observed_at.isoformat() if latest_humidity else None
            }
        }
        zone_readings.append(sensor_data)
    
    return {
        "success": True,
        "zone_id": zone_id,
        "zone_name": zone.name,
        "sensors": zone_readings
    }

@router.get("/all/readings")
async def get_all_sensor_readings(db: Session = Depends(get_db)):
    """Get readings from all sensors"""
    try:
        nous = get_nous_provider()
        readings = await nous.get_all_sensors()
        
        for reading in readings:
            if reading.get("success"):
                sensor = db.query(Sensor).filter(
                    Sensor.provider_sensor_id == reading.get("sensor_id")
                ).first()
                
                if sensor:
                    readings_data = reading.get("readings", {})
                    
                    if "temperature" in readings_data:
                        temp_reading = Reading(
                            sensor_id=sensor.id,
                            value=readings_data["temperature"],
                            unit="°C"
                        )
                        db.add(temp_reading)
                    
                    if "humidity" in readings_data:
                        humidity_reading = Reading(
                            sensor_id=sensor.id,
                            value=readings_data["humidity"],
                            unit="%"
                        )
                        db.add(humidity_reading)
        
        db.commit()
        
        return {
            "success": True,
            "readings": readings
        }
        
    except Exception as e:
        logger.error(f"Error getting all sensor readings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cache/clear")
async def clear_sensor_cache():
    """Clear the sensor reading cache"""
    try:
        nous = get_nous_provider()
        nous.clear_cache()
        
        return {
            "success": True,
            "message": "Sensor cache cleared"
        }
        
    except Exception as e:
        logger.error(f"Error clearing sensor cache: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def sensor_health_check():
    """Check sensor provider health"""
    try:
        nous = get_nous_provider()
        health = await nous.health_check()
        
        return health
        
    except Exception as e:
        logger.error(f"Error checking sensor health: {str(e)}")
        return {
            "success": False,
            "provider": "NousE6Provider",
            "error": str(e)
        }
