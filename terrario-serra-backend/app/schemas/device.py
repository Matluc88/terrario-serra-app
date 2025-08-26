from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class DeviceResponse(BaseModel):
    id: int
    provider: str
    provider_device_id: str
    name: str
    zone_id: int
    meta: Optional[Dict[str, Any]] = {}
    created_at: datetime
    
    class Config:
        from_attributes = True

class OutletResponse(BaseModel):
    id: int
    device_id: int
    channel: str
    role: Optional[str] = None
    custom_name: Optional[str] = None
    enabled: bool = True
    last_state: bool = False
    
    class Config:
        from_attributes = True
