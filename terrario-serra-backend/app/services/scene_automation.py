"""
Scene automation service for processing environmental conditions
"""
from sqlalchemy.orm import Session, joinedload
from typing import Dict, List, Any, Optional
import logging
import os
from datetime import datetime

from app.models.scene import Scene, SceneRule
from app.models.sensor import Sensor, Reading
from app.models.device import Device, Outlet
from app.providers.tuya_provider import TuyaProvider

logger = logging.getLogger(__name__)

def get_tuya_provider() -> Optional[TuyaProvider]:
    """Get configured Tuya provider instance, returns None if not configured"""
    access_id = os.getenv("TUYA_ACCESS_KEY") or os.getenv("TUYA_ACCESS_ID") or os.getenv("TUYA_CLIENT_ID")
    access_secret = os.getenv("TUYA_SECRET_KEY") or os.getenv("TUYA_ACCESS_SECRET") or os.getenv("TUYA_CLIENT_SECRET")
    region = os.getenv("TUYA_REGION", "eu")

    if not access_id or not access_secret:
        logger.info("Tuya credentials not configured - running in SIMULATION mode")
        return None

    return TuyaProvider(access_id, access_secret, region)

def get_zone_sensor_data(zone_id: int, db: Session) -> Dict[str, Any]:
    """Get latest sensor readings for a zone (aggregated)"""
    sensors = db.query(Sensor).filter(Sensor.zone_id == zone_id).all()

    sensor_data: Dict[str, Any] = {}
    for sensor in sensors:
        latest_temp = (
            db.query(Reading)
            .filter(Reading.sensor_id == sensor.id, Reading.unit == "°C")
            .order_by(Reading.observed_at.desc())
            .first()
        )
        latest_humidity = (
            db.query(Reading)
            .filter(Reading.sensor_id == sensor.id, Reading.unit == "%")
            .order_by(Reading.observed_at.desc())
            .first()
        )

        if latest_temp and ("temperature" not in sensor_data or latest_temp.observed_at > sensor_data.get("temperature_timestamp", datetime.min)):
            sensor_data["temperature"] = latest_temp.value
            sensor_data["temperature_timestamp"] = latest_temp.observed_at

        if latest_humidity and ("humidity" not in sensor_data or latest_humidity.observed_at > sensor_data.get("humidity_timestamp", datetime.min)):
            sensor_data["humidity"] = latest_humidity.value
            sensor_data["humidity_timestamp"] = latest_humidity.observed_at

    return sensor_data

def evaluate_scene_condition(condition: Dict[str, Any], sensor_data: Dict[str, Any]) -> bool:
    """Evaluate a single scene rule condition against sensor data"""
    cond = condition.get("condition")  # 'temperature' or 'humidity'
    op = condition.get("operator")     # '<=', '>=', '<', '>', '=='
    threshold = condition.get("value")

    if cond not in ("temperature", "humidity") or op is None or threshold is None:
        logger.warning(f"Invalid condition format: {condition}")
        return False

    value = sensor_data.get(cond)
    if value is None:
        logger.warning(f"No sensor data available for {cond}")
        return False

    if op == "<=":
        return value <= threshold
    if op == ">=":
        return value >= threshold
    if op == "<":
        return value < threshold
    if op == ">":
        return value > threshold
    if op == "==":
        return value == threshold

    logger.warning(f"Unknown operator: {op}")
    return False

async def apply_desired_states(desired: Dict[int, bool], zone_id: int, db: Session) -> Dict[str, Any]:
    """
    Apply desired on/off states to outlets in the zone.
    Only sends commands when desired != current last_state.
    """
    outlets: List[Outlet] = (
        db.query(Outlet)
        .join(Device)
        .options(joinedload(Outlet.device))
        .filter(Device.zone_id == zone_id)
        .all()
    )
    outlet_map = {o.id: o for o in outlets}

    tuya = get_tuya_provider()
    executed: List[Dict[str, Any]] = []

    for outlet_id, want_on in desired.items():
        outlet = outlet_map.get(outlet_id)
        if not outlet:
            logger.warning(f"Desired state for unknown outlet id={outlet_id} (ignored)")
            continue

        if outlet.last_state == want_on:
            executed.append({
                "outlet_id": outlet_id,
                "outlet_name": outlet.custom_name,
                "action": "noop",
                "success": True,
                "reason": "already_in_desired_state"
            })
            continue

        device = outlet.device
        ok = True

        if tuya and device and device.provider == "tuya":
            try:
                res = await tuya.switch_outlet(device.provider_device_id, outlet.channel, bool(want_on))
                ok = bool(res.get("success"))
                if ok:
                    logger.info(f"AUTOMATION: set {outlet.custom_name} (#{outlet.id}) -> {want_on}")
                    outlet.last_state = bool(want_on)
                else:
                    logger.error(f"Tuya error switching {outlet.custom_name}: {res.get('error')}")
            except Exception as e:
                ok = False
                logger.exception(f"Exception switching {outlet.custom_name}: {e}")
        else:
            logger.info(f"SIMULATION: would set {outlet.custom_name} (#{outlet.id}) -> {want_on}")
            outlet.last_state = bool(want_on)

        executed.append({
            "outlet_id": outlet_id,
            "outlet_name": outlet.custom_name,
            "action": "on" if want_on else "off",
            "success": ok
        })

    db.commit()

    return {"success": True, "executed_switches": executed}

async def process_scene_rules(scene_id: int, db: Session) -> Dict[str, Any]:
    """
    Process all rules for a scene and execute actions.
    Priority crescente: l’ultima che tocca la stessa presa vince.
    """
    scene: Optional[Scene] = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene or not scene.is_active:
        return {"success": False, "message": "Scene not found or not active"}

    sensors = get_zone_sensor_data(scene.zone_id, db)
    if not sensors:
        return {"success": False, "message": "No sensor data available"}

    rules: List[SceneRule] = (
        db.query(SceneRule)
        .filter(SceneRule.scene_id == scene_id)
        .order_by(SceneRule.priority.asc())
        .all()
    )

    desired: Dict[int, bool] = {}
    trace: List[Dict[str, Any]] = []

    for r in rules:
        met = False
        try:
            met = evaluate_scene_condition(r.condition, sensors)
        except Exception as e:
            logger.exception(f"Error evaluating rule {r.id}: {e}")

        if met:
            for bucket, want in (("on", True), ("off", False)):
                part = (r.action or {}).get(bucket, {}) or {}
                for k, flag in part.items():
                    if not flag:
                        continue
                    try:
                        oid = int(k)
                    except Exception:
                        logger.warning(f"Ignoring non-integer outlet key: {k}")
                        continue
                    desired[oid] = want
        trace.append({
            "rule_id": r.id,
            "rule_name": r.name,
            "priority": r.priority,
            "condition_met": bool(met)
        })

    applied = await apply_desired_states(desired, scene.zone_id, db)

    return {
        "success": True,
        "scene_id": scene_id,
        "sensor_data": sensors,
        "trace": trace,
        "applied": applied
    }
