from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import psycopg

from app.database import engine, get_db
from app.models import Base
from app.routers import kill_switch_router, zones_router, health_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Terrario-Serra Control API",
    description="API for controlling greenhouse and terrarium automation systems",
    version="1.0.0"
)

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.middleware("http")
async def kill_switch_middleware(request, call_next):
    if request.url.path in ["/healthz", "/api/v1/health"] or request.url.path.startswith("/api/v1/kill"):
        response = await call_next(request)
        return response
    
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        from app.models.kill_switch import KillSwitch
        from app.database import SessionLocal
        
        db = SessionLocal()
        try:
            kill_switch = db.query(KillSwitch).order_by(KillSwitch.id.desc()).first()
            if kill_switch and kill_switch.is_active:
                raise HTTPException(
                    status_code=423, 
                    detail="System is locked due to active kill switch. All operations are disabled."
                )
        finally:
            db.close()
    
    response = await call_next(request)
    return response

app.include_router(health_router)
app.include_router(kill_switch_router)
app.include_router(zones_router)

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
