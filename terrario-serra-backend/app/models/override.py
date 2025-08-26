from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Override(Base):
    __tablename__ = "overrides"
    
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("zones.id"))
    outlet_id = Column(Integer, ForeignKey("outlets.id"))
    desired_state = Column(Boolean, nullable=False)
    ttl_seconds = Column(Integer)  # Time to live in seconds
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    zone = relationship("Zone", back_populates="overrides")
    outlet = relationship("Outlet", back_populates="overrides")
