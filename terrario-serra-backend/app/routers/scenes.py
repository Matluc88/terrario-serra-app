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
    from app.models.device import Device, Outlet
    from app.providers.tuya_provider import TuyaProvider
    import os
    
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    if not scene.is_active:
        return {"success": False, "message": "Scene is not active"}
    
    access_id = os.getenv("TUYA_ACCESS_KEY")
    access_secret = os.getenv("TUYA_SECRET_KEY")
    region = os.getenv("TUYA_REGION", "eu")
    
    simulation_mode = not access_id or not access_secret
    
    if simulation_mode:
        logger.info("Running in simulation mode - Tuya credentials not configured")
        tuya = None
    else:
        tuya = TuyaProvider(access_id, access_secret, region)
    
    scene_rules = scene.settings.get("rules", {})
    outlet_configs = scene.settings.get("outlet_configs", {})
    
    executed_actions = []
    
    for rule_name, rule_data in scene_rules.items():
        try:
            actions_on = rule_data.get("actions", {}).get("on", {})
            
            for outlet_id, should_activate in actions_on.items():
                if not should_activate:
                    continue
                    
                outlet_config = outlet_configs.get(outlet_id)
                if not outlet_config:
                    logger.error(f"Outlet config not found for outlet {outlet_id}")
                    executed_actions.append({
                        "rule_name": rule_name,
                        "outlet_id": outlet_id,
                        "executed": False,
                        "error": f"Outlet config not found for outlet {outlet_id}"
                    })
                    continue
                
                outlet_name = outlet_config.get("name")
                if not outlet_name:
                    logger.error(f"Outlet name not found in config for outlet {outlet_id}")
                    executed_actions.append({
                        "rule_name": rule_name,
                        "outlet_id": outlet_id,
                        "executed": False,
                        "error": f"Outlet name not found in config for outlet {outlet_id}"
                    })
                    continue
                
                outlet = db.query(Outlet).join(Device).filter(
                    Device.zone_id == scene.zone_id,
                    Outlet.custom_name == outlet_name
                ).first()
                
                if not outlet:
                    logger.error(f"Outlet {outlet_name} not found in zone {scene.zone_id}")
                    executed_actions.append({
                        "rule_name": rule_name,
                        "outlet_id": outlet_id,
                        "outlet_name": outlet_name,
                        "executed": False,
                        "error": f"Outlet {outlet_name} not found"
                    })
                    continue
                
                device = outlet.device
                
                if simulation_mode:
                    logger.info(f"SIMULATION: Successfully switched {outlet_name} ON for rule {rule_name}")
                    result = {"success": True, "message": "Simulated switch operation"}
                    executed_actions.append({
                        "rule_name": rule_name,
                        "outlet_id": outlet_id,
                        "outlet_name": outlet_name,
                        "executed": True,
                        "state": True,
                        "result": result,
                        "simulation": True
                    })
                    
                    outlet.last_state = True
                    db.commit()
                else:
                    result = await tuya.switch_outlet(device.provider_device_id, outlet.channel, True)
                    
                    if result.get("success"):
                        logger.info(f"Successfully switched {outlet_name} ON for rule {rule_name}")
                        executed_actions.append({
                            "rule_name": rule_name,
                            "outlet_id": outlet_id,
                            "outlet_name": outlet_name,
                            "executed": True,
                            "state": True,
                            "result": result
                        })
                        
                        outlet.last_state = True
                        db.commit()
                    else:
                        logger.error(f"Failed to switch {outlet_name}: {result.get('error')}")
                        executed_actions.append({
                            "rule_name": rule_name,
                            "outlet_id": outlet_id,
                            "outlet_name": outlet_name,
                            "executed": False,
                            "error": f"Switch command failed: {result.get('error')}",
                            "state": True
                        })
                    
        except Exception as e:
            logger.error(f"Error executing rule {rule_name}: {str(e)}")
            executed_actions.append({
                "rule_name": rule_name,
                "executed": False,
                "error": str(e)
            })
    
    return {
        "success": True,
        "scene_id": scene_id,
        "scene_name": scene.name,
        "executed_actions": executed_actions
    }
