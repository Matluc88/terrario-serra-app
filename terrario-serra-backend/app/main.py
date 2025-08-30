# app/main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, SessionLocal
from app.models import Base
from app.init_db import init_database
from app.services.scheduler import start_scheduler

# Routers
from app.routers import devices, sensors, scenes, automation
from app.routers import events as events_router
from app.routers import kill_switch_router, zones_router, health_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Terrario-Serra Control API",
        description="API for controlling greenhouse and terrarium automation systems",
        version="1.0.0",
    )

    # CORS per sviluppo (frontend Vite su :5173)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    # Kill-switch: blocca solo le richieste che mutano stato
    @app.middleware("http")
    async def kill_switch_middleware(request: Request, call_next):
        path = request.url.path
        # whitelist: docs, health, kill, SSE
        if path.startswith((
            "/docs", "/redoc", "/openapi.json",
            "/healthz", "/api/v1/health",
            "/api/v1/kill",
            "/api/v1/events",
        )):
            return await call_next(request)

        if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
            from app.models.kill_switch import KillSwitch
            db = SessionLocal()
            try:
                ks = db.query(KillSwitch).order_by(KillSwitch.id.desc()).first()
                if ks and ks.is_active:
                    raise HTTPException(
                        status_code=423,
                        detail="System is locked due to active kill switch. All operations are disabled.",
                    )
            finally:
                db.close()

        return await call_next(request)

    # Mount router
    app.include_router(health_router)            # /api/v1/health
    app.include_router(kill_switch_router)       # /api/v1/kill/...
    app.include_router(zones_router)             # /api/v1/zones/...
    app.include_router(events_router.router)     # /api/v1/events/sse
    app.include_router(devices.router)           # /api/v1/devices/...
    app.include_router(sensors.router)           # /api/v1/sensors/ingest ...
    app.include_router(scenes.router)            # /api/v1/scenes/...
    app.include_router(automation.router)        # /api/v1/automation/...

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "service": "terrario-serra-api"}

    # Startup: DB + init + scheduler (idempotenti)
    @app.on_event("startup")
    async def _startup():
        Base.metadata.create_all(bind=engine)
        init_database()
        start_scheduler()

    return app


app = create_app()
