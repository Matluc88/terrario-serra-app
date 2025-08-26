from fastapi import APIRouter

router = APIRouter(tags=["health"])

@router.get("/healthz")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "terrario-serra-api"}

@router.get("/api/v1/health")
async def api_health_check():
    """API health check endpoint"""
    return {"status": "ok", "api_version": "v1"}
