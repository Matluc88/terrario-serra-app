"""
API monitoring and rate limiting endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
import logging

from app.database import get_db
from app.services.rate_limiter import get_rate_limiter
from app.services.device_cache import get_device_cache
from app.models.device import Device

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/monitoring", tags=["monitoring"])

@router.get("/api-usage")
async def get_api_usage(device_id: Optional[str] = None):
    """Get API usage statistics"""
    try:
        rate_limiter = get_rate_limiter()
        usage_stats = await rate_limiter.get_usage_stats(device_id)
        return {
            "success": True,
            "usage_stats": usage_stats
        }
    except Exception as e:
        logger.error(f"Error getting API usage stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cache-stats")
async def get_cache_stats():
    """Get device cache statistics"""
    try:
        cache = get_device_cache()
        cache_stats = await cache.get_cache_stats()
        return {
            "success": True,
            "cache_stats": cache_stats
        }
    except Exception as e:
        logger.error(f"Error getting cache stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cache/cleanup")
async def cleanup_cache():
    """Clean up expired cache entries"""
    try:
        cache = get_device_cache()
        await cache.cleanup_expired()
        return {
            "success": True,
            "message": "Cache cleanup completed"
        }
    except Exception as e:
        logger.error(f"Error cleaning up cache: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cache/invalidate")
async def invalidate_cache(device_id: Optional[str] = None):
    """Invalidate cache for specific device or all devices"""
    try:
        cache = get_device_cache()
        if device_id:
            await cache.invalidate_device(device_id)
            message = f"Cache invalidated for device {device_id}"
        else:
            await cache.invalidate_all()
            message = "All cache invalidated"
        
        return {
            "success": True,
            "message": message
        }
    except Exception as e:
        logger.error(f"Error invalidating cache: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rate-limits/reset")
async def reset_rate_limits(device_id: str):
    """Reset rate limits for a specific device (admin function)"""
    try:
        rate_limiter = get_rate_limiter()
        await rate_limiter.reset_device_limits(device_id)
        return {
            "success": True,
            "message": f"Rate limits reset for device {device_id}"
        }
    except Exception as e:
        logger.error(f"Error resetting rate limits: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/devices/{device_id}/recommended-delay")
async def get_recommended_delay(device_id: str):
    """Get recommended delay before next API call for a device"""
    try:
        rate_limiter = get_rate_limiter()
        delay = rate_limiter.get_recommended_delay(device_id)
        return {
            "success": True,
            "device_id": device_id,
            "recommended_delay_seconds": delay
        }
    except Exception as e:
        logger.error(f"Error getting recommended delay: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def monitoring_health():
    """Health check for monitoring services"""
    try:
        rate_limiter = get_rate_limiter()
        cache = get_device_cache()
        
        cache_stats = await cache.get_cache_stats()
        usage_stats = await rate_limiter.get_usage_stats()
        
        return {
            "success": True,
            "services": {
                "rate_limiter": "healthy",
                "device_cache": "healthy"
            },
            "summary": {
                "total_cached_devices": cache_stats.get("total_entries", 0),
                "total_monitored_devices": usage_stats.get("total_devices", 0)
            }
        }
    except Exception as e:
        logger.error(f"Error in monitoring health check: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
