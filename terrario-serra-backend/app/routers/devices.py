from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import os
import logging

from app.database import get_db
from app.models.device import Device, Outlet
from app.models.zone import Zone
from app.providers.tuya_provider import TuyaProvider
from app.schemas.device import DeviceResponse, OutletResponse, OutletConfigUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/devices", tags=["devices"])

def get_tuya_provider() -> TuyaProvider:
    """Get configured Tuya provider instance"""
    access_id = os.getenv("TUYA_ACCESS_KEY")
    access_secret = os.getenv("TUYA_SECRET_KEY")
    region = os.getenv("TUYA_REGION", "eu")
    
    if not access_id or not access_secret:
        raise HTTPException(status_code=500, detail="Tuya credentials not configured")
    
    return TuyaProvider(access_id, access_secret, region)

@router.get("/", response_model=List[DeviceResponse])
async def list_devices(db: Session = Depends(get_db)):
    """Get all devices"""
    devices = db.query(Device).all()
    return devices

@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(device_id: int, db: Session = Depends(get_db)):
    """Get device by ID"""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

@router.get("/{device_id}/outlets")
async def get_device_outlets(device_id: int, db: Session = Depends(get_db)):
    """Get all outlets for a device"""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    outlets = db.query(Outlet).filter(Outlet.device_id == device_id).all()
    return {
        "device_id": device_id,
        "device_name": device.name,
        "outlets": [
            {
                "id": outlet.id,
                "device_id": outlet.device_id,
                "channel": outlet.channel,
                "role": outlet.role,
                "custom_name": outlet.custom_name,
                "enabled": outlet.enabled,
                "last_state": outlet.last_state
            }
            for outlet in outlets
        ]
    }

@router.get("/{device_id}/status")
async def get_device_status(device_id: int, db: Session = Depends(get_db)):
    """Get real-time status from Tuya device"""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if device.provider != "tuya":
        raise HTTPException(status_code=400, detail="Device is not a Tuya device")
    
    try:
        tuya = get_tuya_provider()
        status = await tuya.get_device_status(device.provider_device_id)
        
        if not status.get("success"):
            raise HTTPException(status_code=500, detail=f"Failed to get device status: {status.get('error')}")
        
        return status
        
    except Exception as e:
        logger.error(f"Error getting device status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{device_id}/outlets/{outlet_id}/switch")
async def switch_outlet(
    device_id: int, 
    outlet_id: int, 
    state: bool,
    db: Session = Depends(get_db)
):
    """Switch an outlet on/off"""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    outlet = db.query(Outlet).filter(
        Outlet.id == outlet_id, 
        Outlet.device_id == device_id
    ).first()
    if not outlet:
        raise HTTPException(status_code=404, detail="Outlet not found")
    
    if not outlet.enabled:
        raise HTTPException(status_code=400, detail="Outlet is disabled")
    
    try:
        tuya = get_tuya_provider()
        result = await tuya.switch_outlet(device.provider_device_id, outlet.channel, state)
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=f"Failed to switch outlet: {result.get('error')}")
        
        outlet.last_state = state
        db.commit()
        
        return {
            "success": True,
            "device_id": device_id,
            "outlet_id": outlet_id,
            "channel": outlet.channel,
            "state": state,
            "result": result
        }
        
    except Exception as e:
        logger.error(f"Error switching outlet: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{device_id}/switch-all")
async def switch_all_outlets(
    device_id: int,
    state: bool,
    db: Session = Depends(get_db)
):
    """Switch all outlets on a device on/off"""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    try:
        tuya = get_tuya_provider()
        result = await tuya.switch_all_outlets(device.provider_device_id, state)
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=f"Failed to switch all outlets: {result.get('error')}")
        
        outlets = db.query(Outlet).filter(Outlet.device_id == device_id).all()
        for outlet in outlets:
            if outlet.enabled:
                outlet.last_state = state
        db.commit()
        
        return {
            "success": True,
            "device_id": device_id,
            "state": state,
            "outlets_updated": len([o for o in outlets if o.enabled]),
            "result": result
        }
        
    except Exception as e:
        logger.error(f"Error switching all outlets: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/zone/{zone_id}/switch-all")
async def switch_zone_outlets(
    zone_id: int,
    state: bool,
    db: Session = Depends(get_db)
):
    """Switch all outlets in a zone on/off"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    outlets = db.query(Outlet).join(Device).filter(
        Device.zone_id == zone_id,
        Outlet.enabled == True
    ).all()
    
    if not outlets:
        return {
            "success": True,
            "zone_id": zone_id,
            "state": state,
            "message": "No enabled outlets found in zone"
        }
    
    try:
        device_outlets = {}
        for outlet in outlets:
            device_id = outlet.device.provider_device_id
            if device_id not in device_outlets:
                device_outlets[device_id] = []
            device_outlets[device_id].append({
                "device_id": device_id,
                "channel": outlet.channel,
                "outlet_id": outlet.id
            })
        
        tuya = get_tuya_provider()
        results = []
        
        for device_id, device_outlet_list in device_outlets.items():
            result = await tuya.switch_zone_outlets(device_outlet_list, state)
            results.append(result)
        
        for outlet in outlets:
            outlet.last_state = state
        db.commit()
        
        all_success = all(r.get("success", False) for r in results)
        
        return {
            "success": all_success,
            "zone_id": zone_id,
            "state": state,
            "outlets_updated": len(outlets),
            "results": results
        }
        
    except Exception as e:
        logger.error(f"Error switching zone outlets: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{device_id}/power")
async def get_power_readings(device_id: int, db: Session = Depends(get_db)):
    """Get power consumption readings from device"""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if device.provider != "tuya":
        raise HTTPException(status_code=400, detail="Device is not a Tuya device")
    
    try:
        tuya = get_tuya_provider()
        readings = await tuya.get_power_readings(device.provider_device_id)
        
        if not readings.get("success"):
            raise HTTPException(status_code=500, detail=f"Failed to get power readings: {readings.get('error')}")
        
        return readings
        
    except Exception as e:
        logger.error(f"Error getting power readings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{device_id}/outlets/{outlet_id}/countdown")
async def set_outlet_countdown(
    device_id: int,
    outlet_id: int,
    seconds: int,
    db: Session = Depends(get_db)
):
    """Set countdown timer for an outlet"""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    outlet = db.query(Outlet).filter(
        Outlet.id == outlet_id,
        Outlet.device_id == device_id
    ).first()
    if not outlet:
        raise HTTPException(status_code=404, detail="Outlet not found")
    
    if seconds < 0 or seconds > 86400:
        raise HTTPException(status_code=400, detail="Countdown must be between 0 and 86400 seconds")
    
    try:
        tuya = get_tuya_provider()
        result = await tuya.set_countdown(device.provider_device_id, outlet.channel, seconds)
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=f"Failed to set countdown: {result.get('error')}")
        
        return {
            "success": True,
            "device_id": device_id,
            "outlet_id": outlet_id,
            "channel": outlet.channel,
            "countdown_seconds": seconds,
            "result": result
        }
        
    except Exception as e:
        logger.error(f"Error setting countdown: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{device_id}/outlets/{outlet_id}/config")
async def update_outlet_config(
    device_id: int,
    outlet_id: int,
    config: OutletConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update outlet configuration (name and role)"""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    outlet = db.query(Outlet).filter(
        Outlet.id == outlet_id,
        Outlet.device_id == device_id
    ).first()
    if not outlet:
        raise HTTPException(status_code=404, detail="Outlet not found")
    
    try:
        outlet.custom_name = config.custom_name
        outlet.role = config.role
        db.commit()
        
        return {
            "success": True,
            "device_id": device_id,
            "outlet_id": outlet_id,
            "custom_name": config.custom_name,
            "role": config.role
        }
        
    except Exception as e:
        logger.error(f"Error updating outlet config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/outlet-types")
async def get_outlet_types():
    """Get available outlet types for dropdowns"""
    return {
        "serra": [
            {"value": "riscaldatore", "label": "Riscaldatore"},
            {"value": "ventilatore", "label": "Ventilatore"},
            {"value": "umidificatore", "label": "Umidificatore"},
            {"value": "deumidificatore", "label": "Deumidificatore"},
            {"value": "lampada-led", "label": "Lampada LED"},
            {"value": "pompa-nutrienti", "label": "Pompa Nutrienti"}
        ],
        "terrario": [
            {"value": "lampada-uvb", "label": "Lampada UVB"},
            {"value": "spot-calore", "label": "Spot Calore"},
            {"value": "ceramica-notturna", "label": "Ceramica Notturna"},
            {"value": "nebulizzatore", "label": "Nebulizzatore"}
        ]
    }
