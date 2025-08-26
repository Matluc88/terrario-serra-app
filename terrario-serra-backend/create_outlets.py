#!/usr/bin/env python3

from app.database import SessionLocal
from app.models.device import Device, Outlet

def create_outlets():
    db = SessionLocal()
    try:
        devices = db.query(Device).all()
        print(f"Found {len(devices)} devices")
        
        for device in devices:
            print(f"Creating outlets for device {device.id}: {device.name}")
            
            existing_outlets = db.query(Outlet).filter(Outlet.device_id == device.id).all()
            if existing_outlets:
                print(f"  Device {device.id} already has {len(existing_outlets)} outlets, skipping")
                continue
            
            outlets_to_create = [
                {"channel": "switch_1", "role": "outlet", "custom_name": "Presa 1"},
                {"channel": "switch_2", "role": "outlet", "custom_name": "Presa 2"},
                {"channel": "switch_3", "role": "outlet", "custom_name": "Presa 3"},
                {"channel": "switch_4", "role": "outlet", "custom_name": "Presa 4"},
                {"channel": "switch_5", "role": "usb", "custom_name": "USB (2A+1C)"},
            ]
            
            for outlet_data in outlets_to_create:
                outlet = Outlet(
                    device_id=device.id,
                    channel=outlet_data["channel"],
                    role=outlet_data["role"],
                    custom_name=outlet_data["custom_name"],
                    enabled=True,
                    last_state=False
                )
                db.add(outlet)
                print(f"  Created outlet: {outlet_data['custom_name']} ({outlet_data['channel']})")
        
        db.commit()
        print("Successfully created all outlets!")
        
        total_outlets = db.query(Outlet).count()
        print(f"Total outlets in database: {total_outlets}")
        
    except Exception as e:
        print(f"Error creating outlets: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_outlets()
