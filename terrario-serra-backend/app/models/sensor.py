from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Sensor(Base):
    __tablename__ = "sensors"
    
    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False)  # "nous_e6"
    provider_sensor_id = Column(String, nullable=False)  # Nous E6 sensor ID
    kind = Column(String, nullable=False)  # "temperature", "humidity"
    zone_id = Column(Integer, ForeignKey("zones.id"))
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    zone = relationship("Zone", back_populates="sensors")
    readings = relationship("Reading", back_populates="sensor")

class Reading(Base):
    __tablename__ = "readings"
    
    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"))
    value = Column(Float, nullable=False)
    unit = Column(String, nullable=False)  # "°C", "%"
    observed_at = Column(DateTime(timezone=True), server_default=func.now())
    
    sensor = relationship("Sensor", back_populates="readings")
