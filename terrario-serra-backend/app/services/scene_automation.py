"""
Scene automation service for processing environmental conditions
"""
from sqlalchemy.orm import Session
from typing import Dict, List, Any, Optional
import logging
import asyncio
import os
from datetime import datetime, timedelta
from copy import deepcopy

from app.models.scene import Scene, SceneRule
from app.models.sensor import Sensor, Reading
from app.models.device import Device, Outlet
from app.providers.tuya_provider import TuyaProvider
from app.database import get_db

logger = logging.getLogger(__name__)

def get_tuya_provider() -> Optional[TuyaProvider]:
    """Get configured Tuya provider instance, returns None if not configured"""
    access_id = os.getenv("TUYA_ACCESS_KEY")
    access_secret = os.getenv("TUYA_SECRET_KEY")
    region = os.getenv("TUYA_REGION", "eu")
    
    if not access_id or not access_secret:
        logger.info("Tuya credentials not configured - running in simulation mode")
        return None
    
    return TuyaProvider(access_id, access_secret, region)

def normalize_scene_settings(scene: Scene, db: Session) -> Scene:
    """
    HOTFIX: Corregge scene con valori 0 nelle regole usando i range come fallback.
    Funziona sia con scene.settings JSON che con SceneRule nel database.
    """
    try:
        # Correggi le regole JSON se esistono in scene.settings
        if hasattr(scene, 'settings') and scene.settings:
            settings = scene.settings if isinstance(scene.settings, dict) else {}
            tr = settings.get("temperature_range", {}) or {}
            hr = settings.get("humidity_range", {}) or {}
            rules = settings.get("rules", {}) or {}

            # Validazione range
            tr_valid = ("min" in tr and "max" in tr and float(tr["min"]) < float(tr["max"]))
            hr_valid = ("min" in hr and "max" in hr and float(hr["min"]) < float(hr["max"]))
            
            if tr_valid and hr_valid:
                def fix_rule_json(key: str, cond: str, op: str, fallback_val: float):
                    r = rules.get(key)
                    if not r:
                        rules[key] = {"condition": cond, "operator": op, "value": fallback_val, "actions": {"on": {}, "off": {}}}
                        return
                    try:
                        v = float(r.get("value", 0))
                    except Exception:
                        v = 0.0
                    if v == 0.0:
                        r["value"] = fallback_val
                        logger.info(f"Corrected rule {key} value from 0 to {fallback_val}")

                # Correggi le regole JSON usando i range validi
                fix_rule_json("tempLow",  "temperature", "<=", float(tr["min"]))
                fix_rule_json("tempHigh", "temperature", ">=", float(tr["max"]))
                fix_rule_json("humidityLow",  "humidity", "<=", float(hr["min"]))
                fix_rule_json("humidityHigh", "humidity", ">=", float(hr["max"]))
                
                settings["rules"] = rules
                scene.settings = settings

        # Correggi anche le SceneRule nel database
        scene_rules = db.query(SceneRule).filter(SceneRule.scene_id == scene.id).all()
        
        # Ottieni i range dalla scene.settings per i fallback
        settings = scene.settings if hasattr(scene, 'settings') and scene.settings else {}
        tr = settings.get("temperature_range", {}) or {}
        hr = settings.get("humidity_range", {}) or {}
        
        # Fallback ai valori standard se i range non sono validi
        temp_min = float(tr.get("min", 20)) if tr.get("min") else 20
        temp_max = float(tr.get("max", 26)) if tr.get("max") else 26
        hum_min = float(hr.get("min", 55)) if hr.get("min") else 55
        hum_max = float(hr.get("max", 70)) if hr.get("max") else 70

        for rule in scene_rules:
            try:
                if rule.condition and isinstance(rule.condition, dict):
                    condition = rule.condition
                    condition_type = condition.get('condition')
                    operator = condition.get('operator')
                    current_value = condition.get('value', 0)
                    
                    # Correggi valori 0 con fallback appropriati
                    if float(current_value) == 0.0:
                        if condition_type == 'temperature':
                            if operator == '<=':
                                new_value = temp_min
                            elif operator == '>=':
                                new_value = temp_max
                            else:
                                new_value = temp_max
                        elif condition_type == 'humidity':
                            if operator == '<=':
                                new_value = hum_min
                            elif operator == '>=':
                                new_value = hum_max
                            else:
                                new_value = hum_max
                        else:
                            continue
                        
                        # Aggiorna la condizione
                        condition['value'] = new_value
                        rule.condition = condition
                        logger.info(f"Corrected SceneRule {rule.id} {condition_type} value from 0 to {new_value}")
                        
            except Exception as e:
                logger.warning(f"Error normalizing SceneRule {rule.id}: {str(e)}")
                continue
        
        # Salva le modifiche alle SceneRule
        db.commit()
        
    except Exception as e:
        logger.error(f"Error normalizing scene {scene.id}: {str(e)}")
    
    return scene

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
    """Evaluate a single scene rule condition against sensor data"""
    condition_type = condition.get('condition')  # 'temperature' or 'humidity'
    operator = condition.get('operator')  # '<=', '>=', '<', '>', '=='
    threshold_value = condition.get('value')
    
    if not all([condition_type, operator, threshold_value is not None]):
        logger.warning(f"Invalid condition format: {condition}")
        return False
    
    # HOTFIX: Salta condizioni con valore 0 (significa regola disabilitata)
    try:
        threshold_value = float(threshold_value)
        if threshold_value == 0.0:
            logger.debug(f"Skipping condition with value 0: {condition}")
            return False
    except Exception:
        logger.warning(f"Invalid threshold value: {threshold_value}")
        return False
        
    sensor_value = sensor_data.get(condition_type)
    if sensor_value is None:
        logger.warning(f"No sensor data available for {condition_type}")
        return False
    
    # Verifica che i dati del sensore non siano troppo vecchi (max 2 minuti)
    timestamp_key = f"{condition_type}_timestamp"
    if timestamp_key in sensor_data:
        sensor_timestamp = sensor_data[timestamp_key]
        if isinstance(sensor_timestamp, datetime):
            age = datetime.now() - sensor_timestamp
            if age.total_seconds() > 120:  # 2 minuti
                logger.warning(f"Sensor data too old for {condition_type}: {age.total_seconds()}s")
                return False
    
    if operator == '<=':
        result = sensor_value <= threshold_value
    elif operator == '>=':
        result = sensor_value >= threshold_value
    elif operator == '<':
        result = sensor_value < threshold_value
    elif operator == '>':
        result = sensor_value > threshold_value
    elif operator == '==':
        result = sensor_value == threshold_value
    else:
        logger.warning(f"Unknown operator: {operator}")
        return False
    
    logger.debug(f"Condition eval: {sensor_value} {operator} {threshold_value} = {result}")
    return result

async def execute_rule_action(action: Dict[str, Any], zone_id: int, db: Session) -> Dict[str, Any]:
    """Execute a rule action (outlet switching)"""
    try:
        outlets = db.query(Outlet).join(Device).filter(Device.zone_id == zone_id).all()
        outlet_map = {outlet.id: outlet for outlet in outlets}
        
        executed_switches = []
        tuya = get_tuya_provider()
        
        on_actions = action.get('on', {})
        for outlet_id_str, should_turn_on in on_actions.items():
            outlet_id = int(outlet_id_str)
            if outlet_id in outlet_map and should_turn_on:
                outlet = outlet_map[outlet_id]
                device = outlet.device
                
                # Verifica se è già nello stato desiderato (idempotenza)
                if outlet.last_state is True:
                    logger.debug(f"Outlet {outlet.custom_name} already ON - skipping")
                    continue
                
                if tuya and device.provider == "tuya":
                    try:
                        result = await tuya.switch_outlet(device.provider_device_id, outlet.channel, True)
                        if result.get("success"):
                            outlet.last_state = True
                            logger.info(f"Successfully turned ON outlet {outlet.custom_name} (ID: {outlet_id})")
                            success = True
                        else:
                            logger.error(f"Failed to turn ON outlet {outlet.custom_name}: {result.get('error')}")
                            success = False
                    except Exception as e:
                        logger.error(f"Error turning ON outlet {outlet.custom_name}: {str(e)}")
                        success = False
                else:
                    logger.info(f"SIMULATION: Would turn ON outlet {outlet.custom_name} (ID: {outlet_id})")
                    outlet.last_state = True
                    success = True
                
                executed_switches.append({
                    "outlet_id": outlet_id,
                    "outlet_name": outlet.custom_name,
                    "action": "on",
                    "success": success
                })
        
        off_actions = action.get('off', {})
        for outlet_id_str, should_turn_off in off_actions.items():
            outlet_id = int(outlet_id_str)
            if outlet_id in outlet_map and should_turn_off:
                outlet = outlet_map[outlet_id]
                device = outlet.device
                
                # Verifica se è già nello stato desiderato (idempotenza)
                if outlet.last_state is False:
                    logger.debug(f"Outlet {outlet.custom_name} already OFF - skipping")
                    continue
                
                if tuya and device.provider == "tuya":
                    try:
                        result = await tuya.switch_outlet(device.provider_device_id, outlet.channel, False)
                        if result.get("success"):
                            outlet.last_state = False
                            logger.info(f"Successfully turned OFF outlet {outlet.custom_name} (ID: {outlet_id})")
                            success = True
                        else:
                            logger.error(f"Failed to turn OFF outlet {outlet.custom_name}: {result.get('error')}")
                            success = False
                    except Exception as e:
                        logger.error(f"Error turning OFF outlet {outlet.custom_name}: {str(e)}")
                        success = False
                else:
                    logger.info(f"SIMULATION: Would turn OFF outlet {outlet.custom_name} (ID: {outlet_id})")
                    outlet.last_state = False
                    success = True
                
                executed_switches.append({
                    "outlet_id": outlet_id,
                    "outlet_name": outlet.custom_name,
                    "action": "off",
                    "success": success
                })
        
        db.commit()
        
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
    
    # HOTFIX: Normalizza la scena prima di processare le regole
    scene = normalize_scene_settings(scene, db)
    
    sensor_data = get_zone_sensor_data(scene.zone_id, db)
    if not sensor_data:
        return {"success": False, "message": "No sensor data available"}
    
    logger.info(f"Processing scene {scene.id} with sensor data: temp={sensor_data.get('temperature')}°C, hum={sensor_data.get('humidity')}%")
    
    rules = db.query(SceneRule).filter(
        SceneRule.scene_id == scene_id
    ).order_by(SceneRule.priority.desc()).all()
    
    if not rules:
        logger.warning(f"No rules found for scene {scene_id}")
        return {"success": False, "message": "No rules configured for scene"}
    
    executed_actions = []
    
    for rule in rules:
        try:
            condition_met = evaluate_scene_condition(rule.condition, sensor_data)
            
            logger.info(f"Rule {rule.name} (ID: {rule.id}) condition met: {condition_met}")
            
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
        "executed_actions": executed_actions
    }
