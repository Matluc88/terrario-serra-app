from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class AutomationSession(Base):
    __tablename__ = "automation_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=False)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    duration_minutes = Column(Integer, default=15)
    last_evaluation_at = Column(DateTime(timezone=True))
    status = Column(String, default="running")  # running, completed, stopped, error
    notes = Column(Text)
    
    zone = relationship("Zone")
    scene = relationship("Scene")
