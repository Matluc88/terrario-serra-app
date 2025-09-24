"""
Rate limiter service for managing Tuya API calls within free tier limits
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from pathlib import Path
import os

logger = logging.getLogger(__name__)

class TuyaRateLimiter:
    """Rate limiter for Tuya API calls to stay within free tier limits"""
    
    DAILY_LIMIT_PER_DEVICE = 1000  # Conservative limit per device per day
    HOURLY_LIMIT_PER_DEVICE = 100  # Conservative limit per device per hour
    BURST_LIMIT = 10  # Max calls in short burst
    BURST_WINDOW = 60  # Burst window in seconds
    
    def __init__(self, storage_path: str = "/tmp/tuya_rate_limits.json"):
        self.storage_path = storage_path
        self._limits = {}
        self._lock = asyncio.Lock()
        self._load_limits()
    
    def _load_limits(self):
        """Load rate limit data from storage"""
        try:
            if os.path.exists(self.storage_path):
                with open(self.storage_path, 'r') as f:
                    data = json.load(f)
                    self._limits = data
                    logger.info(f"Loaded rate limits from {self.storage_path}")
            else:
                self._limits = {}
                logger.info("No existing rate limit data found, starting fresh")
        except Exception as e:
            logger.error(f"Error loading rate limits: {str(e)}")
            self._limits = {}
    
    def _save_limits(self):
        """Save rate limit data to storage"""
        try:
            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            with open(self.storage_path, 'w') as f:
                json.dump(self._limits, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving rate limits: {str(e)}")
    
    def _get_device_limits(self, device_id: str) -> Dict[str, Any]:
        """Get or create rate limit data for a device"""
        if device_id not in self._limits:
            self._limits[device_id] = {
                "daily_calls": 0,
                "daily_reset": datetime.now().strftime("%Y-%m-%d"),
                "hourly_calls": 0,
                "hourly_reset": datetime.now().strftime("%Y-%m-%d %H:00:00"),
                "burst_calls": [],
                "total_calls": 0,
                "last_call": None
            }
        return self._limits[device_id]
    
    def _reset_counters_if_needed(self, device_limits: Dict[str, Any]):
        """Reset counters if time windows have passed"""
        now = datetime.now()
        
        daily_reset = datetime.strptime(device_limits["daily_reset"], "%Y-%m-%d")
        if now.date() > daily_reset.date():
            device_limits["daily_calls"] = 0
            device_limits["daily_reset"] = now.strftime("%Y-%m-%d")
            logger.info(f"Reset daily counter for device")
        
        hourly_reset = datetime.strptime(device_limits["hourly_reset"], "%Y-%m-%d %H:00:00")
        if now.hour != hourly_reset.hour or now.date() != hourly_reset.date():
            device_limits["hourly_calls"] = 0
            device_limits["hourly_reset"] = now.strftime("%Y-%m-%d %H:00:00")
            logger.debug(f"Reset hourly counter for device")
        
        burst_cutoff = now - timedelta(seconds=self.BURST_WINDOW)
        device_limits["burst_calls"] = [
            call_time for call_time in device_limits["burst_calls"]
            if datetime.fromisoformat(call_time) > burst_cutoff
        ]
    
    async def can_make_call(self, device_id: str, call_type: str = "status") -> Dict[str, Any]:
        """Check if we can make an API call for this device"""
        async with self._lock:
            device_limits = self._get_device_limits(device_id)
            self._reset_counters_if_needed(device_limits)
            
            if device_limits["daily_calls"] >= self.DAILY_LIMIT_PER_DEVICE:
                return {
                    "allowed": False,
                    "reason": "daily_limit_exceeded",
                    "daily_calls": device_limits["daily_calls"],
                    "daily_limit": self.DAILY_LIMIT_PER_DEVICE,
                    "reset_time": device_limits["daily_reset"]
                }
            
            if device_limits["hourly_calls"] >= self.HOURLY_LIMIT_PER_DEVICE:
                return {
                    "allowed": False,
                    "reason": "hourly_limit_exceeded",
                    "hourly_calls": device_limits["hourly_calls"],
                    "hourly_limit": self.HOURLY_LIMIT_PER_DEVICE,
                    "reset_time": device_limits["hourly_reset"]
                }
            
            if len(device_limits["burst_calls"]) >= self.BURST_LIMIT:
                return {
                    "allowed": False,
                    "reason": "burst_limit_exceeded",
                    "burst_calls": len(device_limits["burst_calls"]),
                    "burst_limit": self.BURST_LIMIT,
                    "burst_window": self.BURST_WINDOW
                }
            
            return {
                "allowed": True,
                "daily_calls": device_limits["daily_calls"],
                "hourly_calls": device_limits["hourly_calls"],
                "burst_calls": len(device_limits["burst_calls"])
            }
    
    async def record_call(self, device_id: str, call_type: str = "status", success: bool = True):
        """Record an API call for rate limiting"""
        async with self._lock:
            device_limits = self._get_device_limits(device_id)
            now = datetime.now()
            
            device_limits["daily_calls"] += 1
            device_limits["hourly_calls"] += 1
            device_limits["total_calls"] += 1
            device_limits["burst_calls"].append(now.isoformat())
            device_limits["last_call"] = now.isoformat()
            
            self._save_limits()
            
            logger.debug(f"Recorded {call_type} call for device {device_id}: "
                        f"daily={device_limits['daily_calls']}, "
                        f"hourly={device_limits['hourly_calls']}, "
                        f"success={success}")
    
    async def get_usage_stats(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Get usage statistics for monitoring"""
        async with self._lock:
            if device_id:
                if device_id not in self._limits:
                    return {"device_id": device_id, "no_data": True}
                
                device_limits = self._get_device_limits(device_id)
                self._reset_counters_if_needed(device_limits)
                
                return {
                    "device_id": device_id,
                    "daily_calls": device_limits["daily_calls"],
                    "daily_limit": self.DAILY_LIMIT_PER_DEVICE,
                    "daily_usage_percent": (device_limits["daily_calls"] / self.DAILY_LIMIT_PER_DEVICE) * 100,
                    "hourly_calls": device_limits["hourly_calls"],
                    "hourly_limit": self.HOURLY_LIMIT_PER_DEVICE,
                    "total_calls": device_limits["total_calls"],
                    "last_call": device_limits["last_call"]
                }
            else:
                stats = {}
                total_daily_calls = 0
                total_devices = len(self._limits)
                
                for dev_id in self._limits:
                    device_limits = self._get_device_limits(dev_id)
                    self._reset_counters_if_needed(device_limits)
                    total_daily_calls += device_limits["daily_calls"]
                    
                    stats[dev_id] = {
                        "daily_calls": device_limits["daily_calls"],
                        "daily_usage_percent": (device_limits["daily_calls"] / self.DAILY_LIMIT_PER_DEVICE) * 100,
                        "hourly_calls": device_limits["hourly_calls"],
                        "total_calls": device_limits["total_calls"]
                    }
                
                return {
                    "total_devices": total_devices,
                    "total_daily_calls": total_daily_calls,
                    "average_daily_calls": total_daily_calls / max(total_devices, 1),
                    "devices": stats
                }
    
    async def reset_device_limits(self, device_id: str):
        """Reset limits for a specific device (admin function)"""
        async with self._lock:
            if device_id in self._limits:
                del self._limits[device_id]
                self._save_limits()
                logger.info(f"Reset rate limits for device {device_id}")
    
    def get_recommended_delay(self, device_id: str) -> int:
        """Get recommended delay before next call in seconds"""
        if device_id not in self._limits:
            return 0
        
        device_limits = self._limits[device_id]
        burst_calls = len(device_limits.get("burst_calls", []))
        
        if burst_calls >= self.BURST_LIMIT * 0.8:  # 80% of burst limit
            return 30  # Wait 30 seconds
        elif device_limits.get("hourly_calls", 0) >= self.HOURLY_LIMIT_PER_DEVICE * 0.8:
            return 60  # Wait 1 minute
        elif device_limits.get("daily_calls", 0) >= self.DAILY_LIMIT_PER_DEVICE * 0.8:
            return 300  # Wait 5 minutes
        
        return 0

_rate_limiter = None

def get_rate_limiter() -> TuyaRateLimiter:
    """Get global rate limiter instance"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = TuyaRateLimiter()
    return _rate_limiter
