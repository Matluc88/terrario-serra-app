from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic_settings import BaseSettings
import os
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./terrario_serra.db")
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-key")
    api_key_admin: str = os.getenv("API_KEY_ADMIN", "dev-admin-key")
    
    tuya_access_key: str = os.getenv("TUYA_ACCESS_KEY", "")
    tuya_secret_key: str = os.getenv("TUYA_SECRET_KEY", "")
    tuya_client_id: str = os.getenv("TUYA_CLIENT_ID", "")
    tuya_api_base: str = os.getenv("TUYA_API_BASE", "https://openapi.tuyaeu.com")
    tuya_region: str = os.getenv("TUYA_REGION", "eu")
    
    serra_power_strip_id: str = os.getenv("SERRA_POWER_STRIP_ID", "")
    terrario_power_strip_id: str = os.getenv("TERRARIO_POWER_STRIP_ID", "")
    serra_sensor_id: str = os.getenv("SERRA_SENSOR_ID", "")
    terrario_sensor_id: str = os.getenv("TERRARIO_SENSOR_ID", "")
    
    rule_tick_seconds: int = int(os.getenv("RULE_TICK_SECONDS", "30"))
    sensor_stale_seconds: int = int(os.getenv("SENSOR_STALE_SECONDS", "600"))
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

settings = Settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
