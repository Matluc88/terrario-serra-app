from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class AutomationSessionResponse(BaseModel):
    id: int
    zone_id: int
    scene_id: int
    scene_name: str
    is_active: bool
    started_at: datetime
    duration_minutes: int
    last_evaluation_at: Optional[datetime]
    status: str
    time_remaining_seconds: Optional[int]
    
    class Config:
        from_attributes = True

class AutomationSessionCreate(BaseModel):
    scene_id: int
    duration_minutes: int = 15

class AutomationStatusResponse(BaseModel):
    zone_id: int
    has_active_session: bool
    active_session: Optional[AutomationSessionResponse] = None
