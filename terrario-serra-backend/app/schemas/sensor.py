from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class SensorResponse(BaseModel):
    id: int
    provider: str
    provider_sensor_id: str
    kind: str
    zone_id: int
    name: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ReadingResponse(BaseModel):
    id: int
    sensor_id: int
    value: float
    unit: str
    observed_at: datetime
    
    class Config:
        from_attributes = True
