from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from datetime import datetime

class TemperatureRange(BaseModel):
    min: float
    max: float

class HumidityRange(BaseModel):
    min: float
    max: float

class SceneBase(BaseModel):
    name: str
    slug: str
    settings: Dict[str, Any] = {}
    is_active: bool = False

class SceneCreate(SceneBase):
    zone_id: int
    plants_animals: List[str] = []
    habitat_type: Optional[str] = None
    temperature_range: Optional[TemperatureRange] = None
    humidity_range: Optional[HumidityRange] = None

class SceneResponse(SceneBase):
    id: int
    zone_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class SceneRuleBase(BaseModel):
    name: str
    condition: Dict[str, Any]
    action: Dict[str, Any]
    priority: int = 0

class SceneRuleCreate(SceneRuleBase):
    pass

class SceneRuleResponse(SceneRuleBase):
    id: int
    scene_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
