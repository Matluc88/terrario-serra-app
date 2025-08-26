from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class KillSwitchResponse(BaseModel):
    is_active: bool
    reason: Optional[str] = None
    activated_at: Optional[datetime] = None
    deactivated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class KillSwitchActivate(BaseModel):
    reason: Optional[str] = "Emergency stop activated"
