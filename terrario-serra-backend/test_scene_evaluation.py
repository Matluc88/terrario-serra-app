#!/usr/bin/env python3
"""
Test script to verify scene automation works with mock sensor data
"""
import sys
import os
import asyncio
from datetime import datetime

backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

os.environ.setdefault('DATABASE_URL', 'sqlite:///./terrario_serra.db')

from app.database import SessionLocal
from app.services.scene_automation import process_scene_rules, get_zone_sensor_data
from app.models.sensor import Sensor, Reading
from app.models.device import Device, Outlet

async def test_scene_evaluation():
    """Test scene evaluation with mock sensor data"""
    db = SessionLocal()
    try:
        print("=== Testing Scene Automation ===")
        
        print("\n1. Testing scene evaluation without sensor data:")
        result = await process_scene_rules(1, db)
        print(f"Result: {result}")
        
        print("\n2. Current outlet states:")
        outlets = db.query(Outlet).join(Device).filter(Device.zone_id == 1).all()
        for outlet in outlets:
            print(f"  {outlet.custom_name}: {outlet.last_state}")
        
        print("\n3. Adding mock sensor data (T=29.5°C, UR=50%)...")
        
        temp_sensor = db.query(Sensor).filter(
            Sensor.zone_id == 1, 
            Sensor.kind == "temperature"
        ).first()
        if not temp_sensor:
            temp_sensor = Sensor(
                provider="mock",
                provider_sensor_id="temp_001",
                kind="temperature",
                zone_id=1,
                name="Mock Temperature Sensor"
            )
            db.add(temp_sensor)
            db.commit()
            db.refresh(temp_sensor)
        
        humidity_sensor = db.query(Sensor).filter(
            Sensor.zone_id == 1,
            Sensor.kind == "humidity"
        ).first()
        if not humidity_sensor:
            humidity_sensor = Sensor(
                provider="mock",
                provider_sensor_id="humidity_001", 
                kind="humidity",
                zone_id=1,
                name="Mock Humidity Sensor"
            )
            db.add(humidity_sensor)
            db.commit()
            db.refresh(humidity_sensor)
        
        temp_reading = Reading(
            sensor_id=temp_sensor.id,
            value=29.5,
            unit="°C",
            observed_at=datetime.utcnow()
        )
        humidity_reading = Reading(
            sensor_id=humidity_sensor.id,
            value=50.0,
            unit="%",
            observed_at=datetime.utcnow()
        )
        
        db.add(temp_reading)
        db.add(humidity_reading)
        db.commit()
        
        print("Mock sensor data added successfully")
        
        print("\n4. Testing scene evaluation with mock sensor data:")
        result = await process_scene_rules(1, db)
        print(f"Result: {result}")
        
        print("\n5. Outlet states after automation:")
        db.refresh_all()
        outlets = db.query(Outlet).join(Device).filter(Device.zone_id == 1).all()
        for outlet in outlets:
            print(f"  {outlet.custom_name}: {outlet.last_state}")
        
        print("\n=== Test Complete ===")
        
    except Exception as e:
        print(f"Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_scene_evaluation())
