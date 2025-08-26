from sqlalchemy import Column, Integer, Boolean, String, DateTime
from sqlalchemy.sql import func
from app.database import Base

class KillSwitch(Base):
    __tablename__ = "kill_switch"
    
    id = Column(Integer, primary_key=True, index=True)
    is_active = Column(Boolean, default=False, nullable=False)
    reason = Column(String)
    activated_at = Column(DateTime(timezone=True))
    deactivated_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
