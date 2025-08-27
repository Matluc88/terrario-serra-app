"""
Scene automation service for processing environmental conditions
"""
from sqlalchemy.orm import Session
from typing import Dict, List, Any, Optional
import logging
import os
from datetime import datetime, timedelta

from app.models.scene import Scene, SceneRule
from app.models.sensor import Sensor, Reading
from app.models.device import Device, Outlet
from app.providers.tuya_provider import TuyaProvider
from app.database import get_db

logger = logging.getLogger(__name__)

def get_zone_sensor_data(zone_id: int, db: Session) -> Dict[str, Any]:
    """Get latest sensor readings for a zone"""
    sensors = db.query(Sensor).filter(Sensor.zone_id == zone_id).all()
    
    sensor_data = {}
    for sensor in sensors:
        latest_temp = db.query(Reading).filter(
            Reading.sensor_id == sensor.id,
            Reading.unit == "°C"
        ).order_by(Reading.observed_at.desc()).first()
        
        latest_humidity = db.query(Reading).filter(
            Reading.sensor_id == sensor.id,
            Reading.unit == "%"
        ).order_by(Reading.observed_at.desc()).first()
        
        if latest_temp:
            sensor_data['temperature'] = latest_temp.value
            sensor_data['temperature_timestamp'] = latest_temp.observed_at
            
        if latest_humidity:
            sensor_data['humidity'] = latest_humidity.value
            sensor_data['humidity_timestamp'] = latest_humidity.observed_at
    
    return sensor_data

def evaluate_scene_condition(condition: Dict[str, Any], sensor_data: Dict[str, Any]) -> bool:
    """Evaluate a single scene rule condition against sensor data with hysteresis"""
    condition_type = condition.get('condition')  # 'temperature' or 'humidity'
    operator = condition.get('operator')  # '<=', '>=', '<', '>', '=='
    threshold_value = condition.get('value')
    
    if not all([condition_type, operator, threshold_value is not None]):
        logger.warning(f"Invalid condition format: {condition}")
        return False
    
    if not isinstance(condition_type, str):
        logger.warning(f"Invalid condition type: {condition_type}")
        return False
    
    if not isinstance(threshold_value, (int, float)):
        logger.warning(f"Invalid threshold value: {threshold_value}")
        return False
        
    sensor_value = sensor_data.get(condition_type)
    if sensor_value is None:
        logger.warning(f"No sensor data available for {condition_type}")
        return False
    
    hysteresis = 0.5
    
    if operator == '<=':
        return sensor_value <= (threshold_value + hysteresis)
    elif operator == '>=':
        return sensor_value >= (threshold_value - hysteresis)
    elif operator == '<':
        return sensor_value < (threshold_value + hysteresis)
    elif operator == '>':
        return sensor_value > (threshold_value - hysteresis)
    elif operator == '==':
        return abs(sensor_value - threshold_value) <= hysteresis
    else:
        logger.warning(f"Unknown operator: {operator}")
        return False

async def execute_rule_action(action: Dict[str, Any], zone_id: int, db: Session) -> Dict[str, Any]:
    """Execute a rule action (outlet switching) with real Tuya commands"""
    try:
        access_id = os.getenv("TUYA_ACCESS_KEY")
        access_secret = os.getenv("TUYA_SECRET_KEY")
        region = os.getenv("TUYA_REGION", "eu")
        
        simulation_mode = not access_id or not access_secret
        
        if simulation_mode:
            logger.info("Running in simulation mode - Tuya credentials not configured")
            tuya = None
        else:
            tuya = TuyaProvider(str(access_id), str(access_secret), region)
        
        outlets = db.query(Outlet).join(Device).filter(Device.zone_id == zone_id).all()
        outlet_map = {outlet.id: outlet for outlet in outlets}
        
        executed_switches = []
        
        on_actions = action.get('on', {})
        for outlet_id_str, should_turn_on in on_actions.items():
            outlet_id = int(outlet_id_str)
            if outlet_id in outlet_map and should_turn_on:
                outlet = outlet_map[outlet_id]
                
                if (hasattr(outlet, 'manual_override') and outlet.manual_override and 
                    hasattr(outlet, 'manual_override_until') and outlet.manual_override_until and 
                    outlet.manual_override_until > datetime.utcnow()):
                    logger.info(f"Skipping {outlet.custom_name} - manual override active until {outlet.manual_override_until}")
                    continue
                
                device = outlet.device
                
                if simulation_mode:
                    logger.info(f"SIMULATION: Successfully switched {outlet.custom_name} ON")
                    result = {"success": True, "message": "Simulated switch operation"}
                    outlet.last_state = True
                    db.commit()
                else:
                    if tuya is not None:
                        result = await tuya.switch_outlet(device.provider_device_id, outlet.channel, True)
                    else:
                        result = {"success": False, "error": "TuyaProvider not initialized"}
                    
                    if result.get("success"):
                        logger.info(f"Successfully switched {outlet.custom_name} ON")
                        outlet.last_state = True
                        db.commit()
                    else:
                        logger.error(f"Failed to switch {outlet.custom_name} ON: {result.get('error')}")
                
                executed_switches.append({
                    "outlet_id": outlet_id,
                    "outlet_name": outlet.custom_name,
                    "action": "on",
                    "success": result.get("success", False),
                    "result": result,
                    "simulation": simulation_mode
                })
        
        off_actions = action.get('off', {})
        for outlet_id_str, should_turn_off in off_actions.items():
            outlet_id = int(outlet_id_str)
            if outlet_id in outlet_map and should_turn_off:
                outlet = outlet_map[outlet_id]
                
                if (hasattr(outlet, 'manual_override') and outlet.manual_override and 
                    hasattr(outlet, 'manual_override_until') and outlet.manual_override_until and 
                    outlet.manual_override_until > datetime.utcnow()):
                    logger.info(f"Skipping {outlet.custom_name} - manual override active until {outlet.manual_override_until}")
                    continue
                
                device = outlet.device
                
                if simulation_mode:
                    logger.info(f"SIMULATION: Successfully switched {outlet.custom_name} OFF")
                    result = {"success": True, "message": "Simulated switch operation"}
                    outlet.last_state = False
                    db.commit()
                else:
                    if tuya is not None:
                        result = await tuya.switch_outlet(device.provider_device_id, outlet.channel, False)
                    else:
                        result = {"success": False, "error": "TuyaProvider not initialized"}
                    
                    if result.get("success"):
                        logger.info(f"Successfully switched {outlet.custom_name} OFF")
                        outlet.last_state = False
                        db.commit()
                    else:
                        logger.error(f"Failed to switch {outlet.custom_name} OFF: {result.get('error')}")
                
                executed_switches.append({
                    "outlet_id": outlet_id,
                    "outlet_name": outlet.custom_name,
                    "action": "off",
                    "success": result.get("success", False),
                    "result": result,
                    "simulation": simulation_mode
                })
        
        return {
            "success": True,
            "executed_switches": executed_switches
        }
        
    except Exception as e:
        logger.error(f"Error executing rule action: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

async def process_scene_rules(scene_id: int, db: Session) -> Dict[str, Any]:
    """Process all rules for a scene and execute actions"""
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene or not scene.is_active:
        return {"success": False, "message": "Scene not found or not active"}
    
    sensor_data = get_zone_sensor_data(scene.zone_id, db)
    if not sensor_data:
        return {"success": False, "message": "No sensor data available"}
    
    rules = db.query(SceneRule).filter(
        SceneRule.scene_id == scene_id
    ).order_by(SceneRule.priority.desc()).all()
    
    executed_actions = []
    
    for rule in rules:
        try:
            condition_met = evaluate_scene_condition(rule.condition, sensor_data)
            
            if condition_met:
                action_result = await execute_rule_action(rule.action, scene.zone_id, db)
                executed_actions.append({
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "condition_met": True,
                    "action_result": action_result
                })
            else:
                executed_actions.append({
                    "rule_id": rule.id, 
                    "rule_name": rule.name,
                    "condition_met": False
                })
                
        except Exception as e:
            logger.error(f"Error processing rule {rule.id}: {str(e)}")
            executed_actions.append({
                "rule_id": rule.id,
                "rule_name": rule.name,
                "error": str(e)
            })
    
    return {
        "success": True,
        "scene_id": scene_id,
        "sensor_data": sensor_data,
        "executed_actions": executed_actions,
        "timestamp": datetime.utcnow().isoformat()
    }
