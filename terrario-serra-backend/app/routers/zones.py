from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.zone import Zone
from app.schemas.zone import ZoneResponse, ZoneCreate
from typing import List

router = APIRouter(prefix="/api/v1/zones", tags=["zones"])

@router.get("/", response_model=List[ZoneResponse])
async def get_zones(db: Session = Depends(get_db)):
    """Get all zones"""
    zones = db.query(Zone).all()
    return zones

@router.get("/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: int, db: Session = Depends(get_db)):
    """Get zone by ID"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return zone

@router.post("/", response_model=ZoneResponse)
async def create_zone(zone: ZoneCreate, db: Session = Depends(get_db)):
    """Create new zone"""
    db_zone = Zone(**zone.dict())
    db.add(db_zone)
    db.commit()
    db.refresh(db_zone)
    return db_zone
