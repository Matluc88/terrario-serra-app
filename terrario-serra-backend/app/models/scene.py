from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Scene(Base):
    __tablename__ = "scenes"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("zones.id"))
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    settings = Column(JSON, default=dict)  # Temperature/humidity targets, etc.
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    zone = relationship("Zone", back_populates="scenes")
    rules = relationship("SceneRule", back_populates="scene")

class SceneRule(Base):
    __tablename__ = "scene_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"))
    name = Column(String, nullable=False)
    condition = Column(JSON, nullable=False)  # Condition logic
    action = Column(JSON, nullable=False)  # Action to take
    priority = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scene = relationship("Scene", back_populates="rules")
