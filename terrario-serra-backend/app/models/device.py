from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False)  # "tuya"
    provider_device_id = Column(String, nullable=False)  # Tuya device ID
    name = Column(String, nullable=False)
    zone_id = Column(Integer, ForeignKey("zones.id"))
    meta = Column(JSON, default=dict)  # Additional device metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    zone = relationship("Zone", back_populates="devices")
    outlets = relationship("Outlet", back_populates="device")

class Outlet(Base):
    __tablename__ = "outlets"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    channel = Column(String, nullable=False)  # "switch_1", "switch_2", etc.
    role = Column(String)  # "heating", "lighting", "ventilation", etc.
    custom_name = Column(String)  # User-defined name
    enabled = Column(Boolean, default=True)
    last_state = Column(Boolean, default=False)
    manual_override = Column(Boolean, default=False)
    manual_override_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    device = relationship("Device", back_populates="outlets")
    overrides = relationship("Override", back_populates="outlet")
