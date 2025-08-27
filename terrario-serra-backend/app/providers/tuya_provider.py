import asyncio
import json
import logging
from typing import Dict, Any, Optional, List
import tinytuya
from datetime import datetime
from app.database import get_utc_datetime

logger = logging.getLogger(__name__)

class TuyaProvider:
    """Provider for Tuya Smart Power Strips using tinytuya library"""
    
    def __init__(self, access_id: str, access_secret: str, region: str = "eu"):
        self.access_id = access_id
        self.access_secret = access_secret
        self.region = region
        self._cloud = None
        
        self.mock_mode = not access_id or not access_secret
        
        if self.mock_mode:
            logger.warning("Tuya provider running in MOCK MODE - credentials not configured")
        else:
            logger.info("Tuya provider running in PRODUCTION MODE")
    
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
    
    async def get_device_status(self, device_id: str) -> Dict[str, Any]:
        """Get current status of a Tuya device"""
        if self.mock_mode:
            logger.info(f"MOCK: Getting device status for {device_id}")
            return {
                "success": True,
                "device_id": device_id,
                "status": {
                    "switch_1": False,
                    "switch_2": False,
                    "switch_3": False,
                    "switch_4": False,
                    "switch_5": False,
                    "cur_voltage": 2300,
                    "cur_current": 0,
                    "cur_power": 0,
                    "add_ele": 0
                },
                "timestamp": get_utc_datetime().isoformat()
            }
        
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, self.cloud.getstatus, device_id
            )
            
            if isinstance(response, str):
                response = json.loads(response)
            
            if not response.get("success"):
                logger.error(f"Failed to get device status for {device_id}: {response}")
                return {"success": False, "error": response.get("msg", "Unknown error")}
            
            status_map = {}
            for item in response.get("result", []):
                if isinstance(item, dict) and "code" in item and "value" in item:
                    status_map[item["code"]] = item["value"]
            
            return {
                "success": True,
                "device_id": device_id,
                "status": status_map,
                "timestamp": get_utc_datetime().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error getting device status for {device_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def switch_outlet(self, device_id: str, channel: str, state: bool) -> Dict[str, Any]:
        """Switch a specific outlet on/off"""
        if self.mock_mode:
            logger.info(f"MOCK: Switching outlet {channel} on device {device_id} to {state}")
            return {
                "success": True,
                "device_id": device_id,
                "commands": [{"code": channel, "value": state}],
                "response": {"success": True, "result": True},
                "timestamp": get_utc_datetime().isoformat()
            }
        
        try:
            commands = [{"code": channel, "value": state}]
            return await self._send_commands(device_id, commands)
            
        except Exception as e:
            logger.error(f"Error switching outlet {channel} on device {device_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def switch_all_outlets(self, device_id: str, state: bool) -> Dict[str, Any]:
        """Switch all outlets on a device on/off"""
        if self.mock_mode:
            logger.info(f"MOCK: Switching all outlets on device {device_id} to {state}")
            commands = [
                {"code": "switch_1", "value": state},
                {"code": "switch_2", "value": state},
                {"code": "switch_3", "value": state},
                {"code": "switch_4", "value": state},
                {"code": "switch_5", "value": state}
            ]
            return {
                "success": True,
                "device_id": device_id,
                "commands": commands,
                "response": {"success": True, "result": True},
                "timestamp": get_utc_datetime().isoformat()
            }
        
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
        """Switch multiple outlets across potentially multiple devices"""
        results = []
        
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
            
            result = await self.switch_outlet(device_id, channel, state)
            result["outlet"] = outlet_info
            results.append(result)
        
        all_success = all(r.get("success", False) for r in results)
        
        return {
            "success": all_success,
            "results": results,
            "timestamp": get_utc_datetime().isoformat()
        }
    
    async def set_countdown(self, device_id: str, channel: str, seconds: int) -> Dict[str, Any]:
        """Set countdown timer for an outlet"""
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
        
        if seconds < 0 or seconds > 86400:
            return {"success": False, "error": "Countdown must be between 0 and 86400 seconds"}
        
        if self.mock_mode:
            logger.info(f"MOCK: Setting countdown for {channel} on device {device_id} to {seconds} seconds")
            commands = [{"code": countdown_channel, "value": seconds}]
            return {
                "success": True,
                "device_id": device_id,
                "commands": commands,
                "response": {"success": True, "result": True},
                "timestamp": get_utc_datetime().isoformat()
            }
        
        try:
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
        if self.mock_mode:
            logger.info(f"MOCK: Getting power readings for {device_id}")
            return {
                "success": True,
                "device_id": device_id,
                "readings": {
                    "voltage": 230.0,
                    "voltage_unit": "V",
                    "current": 0.0,
                    "current_unit": "A",
                    "power": 0,
                    "power_unit": "W",
                    "energy_accumulated": 0,
                    "energy_unit": "device_units"
                },
                "timestamp": get_utc_datetime().isoformat()
            }
        
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
