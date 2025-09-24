import asyncio
import json
import logging
from typing import Dict, Any, Optional, List
import tinytuya
from datetime import datetime
from app.database import get_utc_datetime
from app.services.rate_limiter import get_rate_limiter
from app.services.device_cache import get_device_cache

logger = logging.getLogger(__name__)

class TuyaProvider:
    """Provider for Tuya Smart Power Strips using tinytuya library"""
    
    def __init__(self, access_id: str, access_secret: str, region: str = "eu"):
        self.access_id = access_id
        self.access_secret = access_secret
        self.region = region
        self._cloud = None
    
    @property
    def cloud(self) -> tinytuya.Cloud:
        """Get or create tinytuya Cloud instance"""
        if self._cloud is None:
            self._cloud = tinytuya.Cloud(
                apiRegion=self.region,
                apiKey=self.access_id,
                apiSecret=self.access_secret
            )
        return self._cloud
    
    async def get_device_status(self, device_id: str, use_cache: bool = True) -> Dict[str, Any]:
        """Get current status of a Tuya device with caching and rate limiting"""
        try:
            cache = get_device_cache()
            rate_limiter = get_rate_limiter()
            
            if use_cache:
                cached_status = await cache.get_cached_status(device_id)
                if cached_status is not None:
                    logger.debug(f"Using cached status for device {device_id}")
                    return {
                        "success": True,
                        "device_id": device_id,
                        "status": cached_status,
                        "timestamp": get_utc_datetime().isoformat(),
                        "from_cache": True
                    }
            
            rate_check = await rate_limiter.can_make_call(device_id, "status")
            if not rate_check["allowed"]:
                logger.warning(f"Rate limit exceeded for device {device_id}: {rate_check['reason']}")
                
                cached_status = await cache.get_cached_status(device_id)
                if cached_status is not None:
                    logger.info(f"Returning expired cache due to rate limit for device {device_id}")
                    return {
                        "success": True,
                        "device_id": device_id,
                        "status": cached_status,
                        "timestamp": get_utc_datetime().isoformat(),
                        "from_cache": True,
                        "rate_limited": True
                    }
                
                return {
                    "success": False,
                    "error": f"Rate limit exceeded: {rate_check['reason']}",
                    "rate_limit_info": rate_check
                }
            
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, self.cloud.getstatus, device_id
            )
            
            await rate_limiter.record_call(device_id, "status", True)
            
            if isinstance(response, str):
                response = json.loads(response)
            
            if not response.get("success"):
                logger.error(f"Failed to get device status for {device_id}: {response}")
                await rate_limiter.record_call(device_id, "status", False)
                return {"success": False, "error": response.get("msg", "Unknown error")}
            
            status_map = {}
            for item in response.get("result", []):
                if isinstance(item, dict) and "code" in item and "value" in item:
                    status_map[item["code"]] = item["value"]
            
            if use_cache:
                await cache.cache_device_status(device_id, status_map)
            
            return {
                "success": True,
                "device_id": device_id,
                "status": status_map,
                "timestamp": get_utc_datetime().isoformat(),
                "from_cache": False
            }
            
        except Exception as e:
            logger.error(f"Error getting device status for {device_id}: {str(e)}")
            rate_limiter = get_rate_limiter()
            await rate_limiter.record_call(device_id, "status", False)
            return {"success": False, "error": str(e)}
    
    async def switch_outlet(self, device_id: str, channel: str, state: bool) -> Dict[str, Any]:
        """Switch a specific outlet on/off with rate limiting"""
        try:
            rate_limiter = get_rate_limiter()
            
            rate_check = await rate_limiter.can_make_call(device_id, "switch")
            if not rate_check["allowed"]:
                logger.warning(f"Rate limit exceeded for device {device_id}: {rate_check['reason']}")
                return {
                    "success": False,
                    "error": f"Rate limit exceeded: {rate_check['reason']}",
                    "rate_limit_info": rate_check
                }
            
            commands = [{"code": channel, "value": state}]
            result = await self._send_commands(device_id, commands)
            
            await rate_limiter.record_call(device_id, "switch", result.get("success", False))
            
            if result.get("success"):
                cache = get_device_cache()
                await cache.invalidate_device(device_id)
            
            return result
            
        except Exception as e:
            logger.error(f"Error switching outlet {channel} on device {device_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def switch_all_outlets(self, device_id: str, state: bool) -> Dict[str, Any]:
        """Switch all outlets on a device on/off"""
        try:
            commands = [
                {"code": "switch_1", "value": state},
                {"code": "switch_2", "value": state},
                {"code": "switch_3", "value": state},
                {"code": "switch_4", "value": state},
                {"code": "switch_5", "value": state}  # USB ports
            ]
            return await self._send_commands(device_id, commands)
            
        except Exception as e:
            logger.error(f"Error switching all outlets on device {device_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def switch_zone_outlets(self, zone_outlets: List[Dict[str, Any]], state: bool) -> Dict[str, Any]:
        """Switch multiple outlets across potentially multiple devices with batching optimization"""
        results = []
        rate_limiter = get_rate_limiter()
        
        device_groups = {}
        for outlet_info in zone_outlets:
            device_id = outlet_info.get("device_id")
            channel = outlet_info.get("channel")
            
            if not device_id or not channel:
                results.append({
                    "success": False,
                    "error": "Missing device_id or channel",
                    "outlet": outlet_info
                })
                continue
            
            if device_id not in device_groups:
                device_groups[device_id] = []
            device_groups[device_id].append(outlet_info)
        
        for device_id, outlets in device_groups.items():
            try:
                rate_check = await rate_limiter.can_make_call(device_id, "batch_switch")
                if not rate_check["allowed"]:
                    logger.warning(f"Rate limit exceeded for device {device_id}: {rate_check['reason']}")
                    for outlet_info in outlets:
                        results.append({
                            "success": False,
                            "error": f"Rate limit exceeded: {rate_check['reason']}",
                            "outlet": outlet_info,
                            "rate_limit_info": rate_check
                        })
                    continue
                
                if len(outlets) > 1:
                    commands = []
                    for outlet_info in outlets:
                        commands.append({"code": outlet_info["channel"], "value": state})
                    
                    batch_result = await self._send_commands(device_id, commands)
                    await rate_limiter.record_call(device_id, "batch_switch", batch_result.get("success", False))
                    
                    if batch_result.get("success"):
                        cache = get_device_cache()
                        await cache.invalidate_device(device_id)
                    
                    for outlet_info in outlets:
                        result = {
                            "success": batch_result.get("success", False),
                            "outlet": outlet_info,
                            "batch_operation": True
                        }
                        if not batch_result.get("success"):
                            result["error"] = batch_result.get("error", "Batch operation failed")
                        results.append(result)
                    
                    logger.info(f"Batched {len(outlets)} outlets on device {device_id}")
                else:
                    outlet_info = outlets[0]
                    result = await self.switch_outlet(device_id, outlet_info["channel"], state)
                    result["outlet"] = outlet_info
                    results.append(result)
                    
            except Exception as e:
                logger.error(f"Error processing device {device_id}: {str(e)}")
                for outlet_info in outlets:
                    results.append({
                        "success": False,
                        "error": str(e),
                        "outlet": outlet_info
                    })
        
        all_success = all(r.get("success", False) for r in results)
        
        return {
            "success": all_success,
            "results": results,
            "timestamp": get_utc_datetime().isoformat(),
            "batched_devices": len(device_groups)
        }
    
    async def set_countdown(self, device_id: str, channel: str, seconds: int) -> Dict[str, Any]:
        """Set countdown timer for an outlet"""
        try:
            countdown_map = {
                "switch_1": "countdown_1",
                "switch_2": "countdown_2", 
                "switch_3": "countdown_3",
                "switch_4": "countdown_4",
                "switch_5": "countdown_5"
            }
            
            countdown_channel = countdown_map.get(channel)
            if not countdown_channel:
                return {"success": False, "error": f"Invalid channel for countdown: {channel}"}
            
            if seconds < 0 or seconds > 86400:  # Max 24 hours
                return {"success": False, "error": "Countdown must be between 0 and 86400 seconds"}
            
            commands = [{"code": countdown_channel, "value": seconds}]
            return await self._send_commands(device_id, commands)
            
        except Exception as e:
            logger.error(f"Error setting countdown for {channel} on device {device_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def _send_commands(self, device_id: str, commands: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Send commands to device using tinytuya"""
        try:
            loop = asyncio.get_event_loop()
            
            command_data = {"commands": commands}
            response = await loop.run_in_executor(
                None, self.cloud.sendcommand, device_id, command_data
            )
            
            if isinstance(response, str):
                response = json.loads(response)
            
            if not response.get("success"):
                logger.error(f"Command failed for device {device_id}: {response}")
                return {"success": False, "error": response.get("msg", "Command failed")}
            
            return {
                "success": True,
                "device_id": device_id,
                "commands": commands,
                "response": response,
                "timestamp": get_utc_datetime().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error sending commands to device {device_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def get_power_readings(self, device_id: str) -> Dict[str, Any]:
        """Get power consumption readings from device"""
        try:
            status_result = await self.get_device_status(device_id)
            
            if not status_result.get("success"):
                return status_result
            
            status = status_result.get("status", {})
            
            readings = {}
            
            if "cur_voltage" in status:
                voltage = status["cur_voltage"]
                readings["voltage"] = voltage / 10.0 if voltage > 1000 else voltage
                readings["voltage_unit"] = "V"
            
            if "cur_current" in status:
                current = status["cur_current"]
                readings["current"] = current / 1000.0 if current > 100 else current
                readings["current_unit"] = "A"
            
            if "cur_power" in status:
                readings["power"] = status["cur_power"]
                readings["power_unit"] = "W"
            
            if "add_ele" in status:
                readings["energy_accumulated"] = status["add_ele"]
                readings["energy_unit"] = "device_units"
            
            return {
                "success": True,
                "device_id": device_id,
                "readings": readings,
                "timestamp": get_utc_datetime().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error getting power readings for device {device_id}: {str(e)}")
            return {"success": False, "error": str(e)}
