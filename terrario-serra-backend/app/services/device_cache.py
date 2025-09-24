"""
Device state caching service to reduce Tuya API calls
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import os

logger = logging.getLogger(__name__)

class DeviceStateCache:
    """Cache for device states to reduce API calls"""
    
    def __init__(self, cache_ttl_seconds: int = 300, storage_path: str = "/tmp/device_cache.json"):
        self.cache_ttl = timedelta(seconds=cache_ttl_seconds)
        self.storage_path = storage_path
        self._cache = {}
        self._lock = asyncio.Lock()
        self._load_cache()
    
    def _load_cache(self):
        """Load cache from storage"""
        try:
            if os.path.exists(self.storage_path):
                with open(self.storage_path, 'r') as f:
                    data = json.load(f)
                    for device_id, cache_entry in data.items():
                        if 'timestamp' in cache_entry:
                            cache_entry['timestamp'] = datetime.fromisoformat(cache_entry['timestamp'])
                    self._cache = data
                    logger.info(f"Loaded device cache from {self.storage_path}")
            else:
                self._cache = {}
                logger.info("No existing device cache found, starting fresh")
        except Exception as e:
            logger.error(f"Error loading device cache: {str(e)}")
            self._cache = {}
    
    def _save_cache(self):
        """Save cache to storage"""
        try:
            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            serializable_cache = {}
            for device_id, cache_entry in self._cache.items():
                serializable_entry = cache_entry.copy()
                if 'timestamp' in serializable_entry and isinstance(serializable_entry['timestamp'], datetime):
                    serializable_entry['timestamp'] = serializable_entry['timestamp'].isoformat()
                serializable_cache[device_id] = serializable_entry
            
            with open(self.storage_path, 'w') as f:
                json.dump(serializable_cache, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving device cache: {str(e)}")
    
    async def get_cached_status(self, device_id: str) -> Optional[Dict[str, Any]]:
        """Get cached device status if still valid"""
        async with self._lock:
            if device_id not in self._cache:
                return None
            
            cache_entry = self._cache[device_id]
            timestamp = cache_entry.get('timestamp')
            
            if not timestamp or not isinstance(timestamp, datetime):
                del self._cache[device_id]
                return None
            
            if datetime.now() - timestamp > self.cache_ttl:
                logger.debug(f"Cache expired for device {device_id}")
                del self._cache[device_id]
                self._save_cache()
                return None
            
            logger.debug(f"Cache hit for device {device_id}")
            return cache_entry.get('status')
    
    async def cache_device_status(self, device_id: str, status: Dict[str, Any]):
        """Cache device status"""
        async with self._lock:
            self._cache[device_id] = {
                'status': status,
                'timestamp': datetime.now()
            }
            self._save_cache()
            logger.debug(f"Cached status for device {device_id}")
    
    async def invalidate_device(self, device_id: str):
        """Invalidate cache for a specific device"""
        async with self._lock:
            if device_id in self._cache:
                del self._cache[device_id]
                self._save_cache()
                logger.debug(f"Invalidated cache for device {device_id}")
    
    async def invalidate_all(self):
        """Invalidate all cached data"""
        async with self._lock:
            self._cache = {}
            self._save_cache()
            logger.info("Invalidated all device cache")
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        async with self._lock:
            now = datetime.now()
            valid_entries = 0
            expired_entries = 0
            
            for device_id, cache_entry in self._cache.items():
                timestamp = cache_entry.get('timestamp')
                if timestamp and isinstance(timestamp, datetime):
                    if now - timestamp <= self.cache_ttl:
                        valid_entries += 1
                    else:
                        expired_entries += 1
                else:
                    expired_entries += 1
            
            return {
                'total_entries': len(self._cache),
                'valid_entries': valid_entries,
                'expired_entries': expired_entries,
                'cache_ttl_seconds': self.cache_ttl.total_seconds(),
                'hit_rate_estimate': valid_entries / max(len(self._cache), 1) * 100
            }
    
    async def cleanup_expired(self):
        """Remove expired entries from cache"""
        async with self._lock:
            now = datetime.now()
            expired_devices = []
            
            for device_id, cache_entry in self._cache.items():
                timestamp = cache_entry.get('timestamp')
                if not timestamp or not isinstance(timestamp, datetime) or now - timestamp > self.cache_ttl:
                    expired_devices.append(device_id)
            
            for device_id in expired_devices:
                del self._cache[device_id]
            
            if expired_devices:
                self._save_cache()
                logger.info(f"Cleaned up {len(expired_devices)} expired cache entries")
    
    def set_ttl(self, ttl_seconds: int):
        """Update cache TTL"""
        self.cache_ttl = timedelta(seconds=ttl_seconds)
        logger.info(f"Updated cache TTL to {ttl_seconds} seconds")

_device_cache = None

def get_device_cache() -> DeviceStateCache:
    """Get global device cache instance"""
    global _device_cache
    if _device_cache is None:
        _device_cache = DeviceStateCache()
    return _device_cache
