from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import logging

from app.database import get_db
from app.models.scene import Scene, SceneRule
from app.models.zone import Zone
from app.schemas.scene import SceneResponse, SceneCreate, SceneRuleResponse, SceneRuleCreate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/scenes", tags=["scenes"])

@router.get("/zone/{zone_id}", response_model=List[SceneResponse])
async def get_zone_scenes(zone_id: int, db: Session = Depends(get_db)):
    """Get all scenes for a specific zone"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    scenes = db.query(Scene).filter(Scene.zone_id == zone_id).all()
    return scenes

@router.post("/zone/{zone_id}", response_model=SceneResponse)
async def create_scene(zone_id: int, scene: SceneCreate, db: Session = Depends(get_db)):
    """Create a new scene for a zone"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    settings = scene.settings.copy()
    
    if scene.temperature_range:
        settings['temperature_range'] = {
            'min': scene.temperature_range.min,
            'max': scene.temperature_range.max
        }
    
    if scene.humidity_range:
        settings['humidity_range'] = {
            'min': scene.humidity_range.min,
            'max': scene.humidity_range.max
        }
    
    if scene.plants_animals:
        settings['plants_animals'] = scene.plants_animals
    
    if scene.habitat_type:
        settings['habitat_type'] = scene.habitat_type
    
    db_scene = Scene(
        zone_id=zone_id,
        name=scene.name,
        slug=scene.slug,
        settings=settings,
        is_active=scene.is_active
    )
    db.add(db_scene)
    db.commit()
    db.refresh(db_scene)
    return db_scene

@router.get("/{scene_id}", response_model=SceneResponse)
async def get_scene(scene_id: int, db: Session = Depends(get_db)):
    """Get scene by ID"""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return scene

@router.put("/{scene_id}", response_model=SceneResponse)
async def update_scene(scene_id: int, scene_update: SceneCreate, db: Session = Depends(get_db)):
    """Update an existing scene"""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    settings = scene_update.settings.copy()
    
    if scene_update.temperature_range:
        settings['temperature_range'] = {
            'min': scene_update.temperature_range.min,
            'max': scene_update.temperature_range.max
        }
    
    if scene_update.humidity_range:
        settings['humidity_range'] = {
            'min': scene_update.humidity_range.min,
            'max': scene_update.humidity_range.max
        }
    
    if scene_update.plants_animals:
        settings['plants_animals'] = scene_update.plants_animals
    
    if scene_update.habitat_type:
        settings['habitat_type'] = scene_update.habitat_type
    
    scene.name = scene_update.name
    scene.slug = scene_update.slug
    scene.settings = settings
    scene.is_active = scene_update.is_active
    
    db.commit()
    db.refresh(scene)
    return scene

@router.delete("/{scene_id}")
async def delete_scene(scene_id: int, db: Session = Depends(get_db)):
    """Delete a scene"""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    db.delete(scene)
    db.commit()
    return {"success": True, "message": "Scene deleted successfully"}

@router.get("/{scene_id}/rules", response_model=List[SceneRuleResponse])
async def get_scene_rules(scene_id: int, db: Session = Depends(get_db)):
    """Get all rules for a scene"""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    rules = db.query(SceneRule).filter(SceneRule.scene_id == scene_id).all()
    return rules

@router.post("/{scene_id}/rules", response_model=SceneRuleResponse)
async def create_scene_rule(scene_id: int, rule: SceneRuleCreate, db: Session = Depends(get_db)):
    """Create a new rule for a scene"""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    db_rule = SceneRule(
        scene_id=scene_id,
        name=rule.name,
        condition=rule.condition,
        action=rule.action,
        priority=rule.priority
    )
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule

@router.put("/rules/{rule_id}", response_model=SceneRuleResponse)
async def update_scene_rule(rule_id: int, rule_update: SceneRuleCreate, db: Session = Depends(get_db)):
    """Update an existing scene rule"""
    rule = db.query(SceneRule).filter(SceneRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Scene rule not found")
    
    rule.name = rule_update.name
    rule.condition = rule_update.condition
    rule.action = rule_update.action
    rule.priority = rule_update.priority
    
    db.commit()
    db.refresh(rule)
    return rule

@router.delete("/rules/{rule_id}")
async def delete_scene_rule(rule_id: int, db: Session = Depends(get_db)):
    """Delete a scene rule"""
    rule = db.query(SceneRule).filter(SceneRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Scene rule not found")
    
    db.delete(rule)
    db.commit()
    return {"success": True, "message": "Scene rule deleted successfully"}

@router.post("/{scene_id}/activate")
async def activate_scene(scene_id: int, db: Session = Depends(get_db)):
    """Activate a scene (deactivate others in the same zone)"""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    db.query(Scene).filter(
        Scene.zone_id == scene.zone_id,
        Scene.id != scene_id
    ).update({"is_active": False})
    
    scene.is_active = True
    db.commit()
    
    return {"success": True, "message": f"Scene '{scene.name}' activated"}

@router.post("/{scene_id}/evaluate")
async def evaluate_scene_rules(scene_id: int, db: Session = Depends(get_db)):
    """Evaluate scene rules and execute actions"""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    if not scene.is_active:
        return {"success": False, "message": "Scene is not active"}
    
    rules = db.query(SceneRule).filter(SceneRule.scene_id == scene_id).order_by(SceneRule.priority.desc()).all()
    
    executed_actions = []
    for rule in rules:
        executed_actions.append({
            "rule_id": rule.id,
            "rule_name": rule.name,
            "condition": rule.condition,
            "action": rule.action,
            "executed": True  # Placeholder - actual execution logic would go here
        })
    
    return {
        "success": True,
        "scene_id": scene_id,
        "scene_name": scene.name,
        "executed_actions": executed_actions
    }
