import asyncio
import json
import logging
from typing import Dict, Any, Optional, List, Tuple
import httpx
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class NousE6Provider:
    """Provider for Nous E6 Temperature/Humidity Sensors"""
    
    def __init__(self, access_id: str, access_secret: str, region: str = "eu"):
        self.access_id = access_id
        self.access_secret = access_secret
        self.region = region
        self.base_url = "https://openapi.tuyaeu.com"  # EU region
        self._cache = {}
        self._cache_ttl = 60  # Cache readings for 60 seconds
    
    async def get_sensor_reading(self, sensor_id: str) -> Dict[str, Any]:
        """Get latest temperature and humidity reading from sensor"""
        try:
            cache_key = f"sensor_{sensor_id}"
            if cache_key in self._cache:
                cached_data, timestamp = self._cache[cache_key]
                if datetime.utcnow() - timestamp < timedelta(seconds=self._cache_ttl):
                    logger.debug(f"Returning cached reading for sensor {sensor_id}")
                    return cached_data
            
            import tinytuya
            cloud = tinytuya.Cloud(
                apiRegion=self.region,
                apiKey=self.access_id,
                apiSecret=self.access_secret
            )
            
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, cloud.getstatus, sensor_id
            )
            
            if isinstance(response, str):
                response = json.loads(response)
            
            if not response.get("success"):
                logger.error(f"Failed to get sensor reading for {sensor_id}: {response}")
                return {"success": False, "error": response.get("msg", "Unknown error")}
            
            readings = {}
            for item in response.get("result", []):
                if isinstance(item, dict) and "code" in item and "value" in item:
                    code = item["code"]
                    value = item["value"]
                    
                    if code == "va_temperature":
                        readings["temperature"] = value / 10.0 if isinstance(value, (int, float)) else value
                        readings["temperature_unit"] = "°C"
                    elif code == "va_humidity":
                        readings["humidity"] = value
                        readings["humidity_unit"] = "%"
                    elif code == "battery_percentage":
                        readings["battery"] = value
                        readings["battery_unit"] = "%"
            
            result = {
                "success": True,
                "sensor_id": sensor_id,
                "readings": readings,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            self._cache[cache_key] = (result, datetime.utcnow())
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting sensor reading for {sensor_id}: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def get_zone_sensors(self, zone_id: int) -> List[Dict[str, Any]]:
        """Get all sensor readings for a specific zone"""
        try:
            sensor_mappings = {
                1: "bffca357e3c45a16783rsa",  # Serra sensor
                2: "bfcd3d17b88bd88cc0qeie"   # Terrario sensor
            }
            
            sensor_id = sensor_mappings.get(zone_id)
            if not sensor_id:
                return []
            
            reading = await self.get_sensor_reading(sensor_id)
            if reading.get("success"):
                return [reading]
            else:
                return []
                
        except Exception as e:
            logger.error(f"Error getting zone sensors for zone {zone_id}: {str(e)}")
            return []
    
    async def get_all_sensors(self) -> List[Dict[str, Any]]:
        """Get readings from all configured sensors"""
        try:
            sensor_ids = [
                "bffca357e3c45a16783rsa",  # Serra
                "bfcd3d17b88bd88cc0qeie"   # Terrario
            ]
            
            readings = []
            for sensor_id in sensor_ids:
                reading = await self.get_sensor_reading(sensor_id)
                if reading.get("success"):
                    readings.append(reading)
            
            return readings
            
        except Exception as e:
            logger.error(f"Error getting all sensor readings: {str(e)}")
            return []
    
    async def get_latest_reading(self, sensor_id: str) -> Tuple[Optional[float], Optional[float], Optional[datetime]]:
        """Get latest temperature and humidity as tuple (temp, humidity, timestamp)"""
        try:
            reading = await self.get_sensor_reading(sensor_id)
            
            if not reading.get("success"):
                return None, None, None
            
            readings_data = reading.get("readings", {})
            temperature = readings_data.get("temperature")
            humidity = readings_data.get("humidity")
            timestamp_str = reading.get("timestamp")
            
            timestamp = None
            if timestamp_str:
                try:
                    timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                except:
                    timestamp = datetime.utcnow()
            
            return temperature, humidity, timestamp
            
        except Exception as e:
            logger.error(f"Error getting latest reading for sensor {sensor_id}: {str(e)}")
            return None, None, None
    
    def clear_cache(self):
        """Clear the sensor reading cache"""
        self._cache.clear()
        logger.info("Sensor reading cache cleared")
    
    async def health_check(self) -> Dict[str, Any]:
        """Check if the sensor provider is working correctly"""
        try:
            test_sensor = "bffca357e3c45a16783rsa"  # Serra sensor
            reading = await self.get_sensor_reading(test_sensor)
            
            return {
                "success": reading.get("success", False),
                "provider": "NousE6Provider",
                "test_sensor": test_sensor,
                "cache_size": len(self._cache),
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "provider": "NousE6Provider", 
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
