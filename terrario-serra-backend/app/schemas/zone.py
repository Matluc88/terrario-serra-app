from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class ZoneBase(BaseModel):
    slug: str
    name: str
    mode: str = "manual"
    active: bool = True
    settings: Optional[Dict[str, Any]] = {}

class ZoneCreate(ZoneBase):
    pass

class ZoneResponse(ZoneBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
