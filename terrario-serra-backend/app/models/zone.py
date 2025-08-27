from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Zone(Base):
    __tablename__ = "zones"
    
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)  # "serra", "terrario"
    name = Column(String, nullable=False)  # "Serra 🌱", "Terrario 🐢"
    mode = Column(String, default="manual")  # "manual", "automatic"
    active = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    devices = relationship("Device", back_populates="zone")
    sensors = relationship("Sensor", back_populates="zone")
    scenes = relationship("Scene", back_populates="zone")
    overrides = relationship("Override", back_populates="zone")
    automation_sessions = relationship("AutomationSession", back_populates="zone")
