from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import logging

from app.database import get_db
from app.models.automation_session import AutomationSession
from app.models.scene import Scene
from app.models.zone import Zone
from app.schemas.automation import AutomationSessionResponse, AutomationSessionCreate, AutomationStatusResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/automation", tags=["automation"])

@router.get("/zone/{zone_id}/status", response_model=AutomationStatusResponse)
async def get_zone_automation_status(zone_id: int, db: Session = Depends(get_db)):
    """Get current automation status for a zone"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    active_session = db.query(AutomationSession).filter(
        AutomationSession.zone_id == zone_id,
        AutomationSession.is_active == True,
        AutomationSession.status == "running"
    ).first()
    
    if active_session:
        scene = db.query(Scene).filter(Scene.id == active_session.scene_id).first()
        
        elapsed_time = datetime.utcnow() - active_session.started_at.replace(tzinfo=None)
        total_duration = timedelta(minutes=active_session.duration_minutes)
        time_remaining = total_duration - elapsed_time
        
        if time_remaining.total_seconds() <= 0:
            active_session.is_active = False
            active_session.status = "completed"
            zone.mode = "manual"
            db.commit()
            
            return AutomationStatusResponse(
                zone_id=zone_id,
                has_active_session=False,
                active_session=None
            )
        
        session_response = AutomationSessionResponse(
            id=active_session.id,
            zone_id=active_session.zone_id,
            scene_id=active_session.scene_id,
            scene_name=scene.name if scene else "Unknown Scene",
            is_active=active_session.is_active,
            started_at=active_session.started_at,
            duration_minutes=active_session.duration_minutes,
            last_evaluation_at=active_session.last_evaluation_at,
            status=active_session.status,
            time_remaining_seconds=int(time_remaining.total_seconds())
        )
        
        return AutomationStatusResponse(
            zone_id=zone_id,
            has_active_session=True,
            active_session=session_response
        )
    
    return AutomationStatusResponse(
        zone_id=zone_id,
        has_active_session=False,
        active_session=None
    )

@router.post("/zone/{zone_id}/start", response_model=AutomationSessionResponse)
async def start_automation_session(
    zone_id: int, 
    session_data: AutomationSessionCreate, 
    db: Session = Depends(get_db)
):
    """Start a new automation session for a zone"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    scene = db.query(Scene).filter(Scene.id == session_data.scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    if scene.zone_id != zone_id:
        raise HTTPException(status_code=400, detail="Scene does not belong to this zone")
    
    existing_session = db.query(AutomationSession).filter(
        AutomationSession.zone_id == zone_id,
        AutomationSession.is_active == True,
        AutomationSession.status == "running"
    ).first()
    
    if existing_session:
        existing_session.is_active = False
        existing_session.status = "stopped"
        db.commit()
    
    new_session = AutomationSession(
        zone_id=zone_id,
        scene_id=session_data.scene_id,
        duration_minutes=session_data.duration_minutes,
        is_active=True,
        status="running"
    )
    
    zone.mode = "automatic"
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    from app.services.scene_automation import process_scene_rules
    try:
        result = process_scene_rules(session_data.scene_id, db)
        new_session.last_evaluation_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"Started automation session {new_session.id} for zone {zone_id}, scene {scene.name}")
    except Exception as e:
        logger.error(f"Error during initial scene evaluation: {str(e)}")
        new_session.notes = f"Initial evaluation error: {str(e)}"
        db.commit()
    
    elapsed_time = datetime.utcnow() - new_session.started_at.replace(tzinfo=None)
    total_duration = timedelta(minutes=new_session.duration_minutes)
    time_remaining = total_duration - elapsed_time
    
    return AutomationSessionResponse(
        id=new_session.id,
        zone_id=new_session.zone_id,
        scene_id=new_session.scene_id,
        scene_name=scene.name,
        is_active=new_session.is_active,
        started_at=new_session.started_at,
        duration_minutes=new_session.duration_minutes,
        last_evaluation_at=new_session.last_evaluation_at,
        status=new_session.status,
        time_remaining_seconds=int(time_remaining.total_seconds())
    )

@router.post("/zone/{zone_id}/stop")
async def stop_automation_session(zone_id: int, db: Session = Depends(get_db)):
    """Stop the active automation session for a zone"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    active_session = db.query(AutomationSession).filter(
        AutomationSession.zone_id == zone_id,
        AutomationSession.is_active == True,
        AutomationSession.status == "running"
    ).first()
    
    if not active_session:
        raise HTTPException(status_code=404, detail="No active automation session found")
    
    active_session.is_active = False
    active_session.status = "stopped"
    
    zone.mode = "manual"
    
    db.commit()
    
    logger.info(f"Stopped automation session {active_session.id} for zone {zone_id}")
    
    return {"success": True, "message": "Automation session stopped"}

@router.get("/zone/{zone_id}/history", response_model=List[AutomationSessionResponse])
async def get_automation_history(zone_id: int, limit: int = 10, db: Session = Depends(get_db)):
    """Get automation session history for a zone"""
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    sessions = db.query(AutomationSession).filter(
        AutomationSession.zone_id == zone_id
    ).order_by(AutomationSession.started_at.desc()).limit(limit).all()
    
    result = []
    for session in sessions:
        scene = db.query(Scene).filter(Scene.id == session.scene_id).first()
        
        if session.is_active and session.status == "running":
            elapsed_time = datetime.utcnow() - session.started_at.replace(tzinfo=None)
            total_duration = timedelta(minutes=session.duration_minutes)
            time_remaining = total_duration - elapsed_time
            time_remaining_seconds = max(0, int(time_remaining.total_seconds()))
        else:
            time_remaining_seconds = 0
        
        result.append(AutomationSessionResponse(
            id=session.id,
            zone_id=session.zone_id,
            scene_id=session.scene_id,
            scene_name=scene.name if scene else "Unknown Scene",
            is_active=session.is_active,
            started_at=session.started_at,
            duration_minutes=session.duration_minutes,
            last_evaluation_at=session.last_evaluation_at,
            status=session.status,
            time_remaining_seconds=time_remaining_seconds
        ))
    
    return result
