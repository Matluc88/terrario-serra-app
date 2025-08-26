from .kill_switch import router as kill_switch_router
from .zones import router as zones_router
from .health import router as health_router

__all__ = [
    "kill_switch_router",
    "zones_router", 
    "health_router"
]
