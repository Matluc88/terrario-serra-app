"""
Database initialization script
Creates initial zones and device records
"""
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import Base
from app.models.zone import Zone
from app.models.device import Device, Outlet
from app.models.sensor import Sensor

def init_database():
    """Initialize database with default zones and devices"""
    
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        existing_zones = db.query(Zone).count()
        if existing_zones > 0:
            print("Database already initialized")
            return
        
        serra_zone = Zone(
            slug="serra",
            name="Serra 🌱",
            mode="manual",
            active=True,
            settings={}
        )
        db.add(serra_zone)
        db.flush()  # Get the ID
        
        terrario_zone = Zone(
            slug="terrario", 
            name="Terrario 🐢",
            mode="manual",
            active=True,
            settings={}
        )
        db.add(terrario_zone)
        db.flush()  # Get the ID
        
        serra_device = Device(
            provider="tuya",
            provider_device_id="bfac84583c14518dedjatx",
            name="Alimentazione Serra",
            zone_id=serra_zone.id,
            meta={"type": "power_strip", "model": "ANTELA"}
        )
        db.add(serra_device)
        db.flush()
        
        serra_outlets = [
            Outlet(device_id=serra_device.id, channel="switch_1", role="heating", custom_name="Presa 1", enabled=True),
            Outlet(device_id=serra_device.id, channel="switch_2", role="lighting", custom_name="Presa 2", enabled=True),
            Outlet(device_id=serra_device.id, channel="switch_3", role="ventilation", custom_name="Presa 3", enabled=True),
            Outlet(device_id=serra_device.id, channel="switch_4", role="irrigation", custom_name="Presa 4", enabled=True),
            Outlet(device_id=serra_device.id, channel="switch_5", role="usb", custom_name="USB (2A+1C)", enabled=True),
        ]
        for outlet in serra_outlets:
            db.add(outlet)
        
        terrario_device = Device(
            provider="tuya",
            provider_device_id="bf706e173c8fca8ec2evnv",
            name="Alimentazione Terrario",
            zone_id=terrario_zone.id,
            meta={"type": "power_strip", "model": "ANTELA"}
        )
        db.add(terrario_device)
        db.flush()
        
        terrario_outlets = [
            Outlet(device_id=terrario_device.id, channel="switch_1", role="uvb", custom_name="UVB", enabled=True),
            Outlet(device_id=terrario_device.id, channel="switch_2", role="heating", custom_name="Spot Riscaldamento", enabled=True),
            Outlet(device_id=terrario_device.id, channel="switch_3", role="ceramic", custom_name="Ceramica Notte", enabled=True),
            Outlet(device_id=terrario_device.id, channel="switch_4", role="humidity", custom_name="Umidificatore", enabled=True),
            Outlet(device_id=terrario_device.id, channel="switch_5", role="usb", custom_name="USB (2A+1C)", enabled=True),
        ]
        for outlet in terrario_outlets:
            db.add(outlet)
        
        serra_sensor = Sensor(
            provider="nous_e6",
            provider_sensor_id="bffca357e3c45a16783rsa",
            kind="temperature_humidity",
            zone_id=serra_zone.id,
            name="Sensore Serra"
        )
        db.add(serra_sensor)
        
        terrario_sensor = Sensor(
            provider="nous_e6",
            provider_sensor_id="bfcd3d17b88bd88cc0qeie",
            kind="temperature_humidity",
            zone_id=terrario_zone.id,
            name="Sensore Terrario"
        )
        db.add(terrario_sensor)
        
        db.commit()
        print("Database initialized successfully!")
        print(f"Created zones: {serra_zone.name}, {terrario_zone.name}")
        print(f"Created devices: {serra_device.name}, {terrario_device.name}")
        print(f"Created sensors: {serra_sensor.name}, {terrario_sensor.name}")
        
    except Exception as e:
        db.rollback()
        print(f"Error initializing database: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    init_database()
