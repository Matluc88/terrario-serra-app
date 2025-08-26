from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.kill_switch import KillSwitch
from app.models.audit import AuditLog
from app.schemas.kill_switch import KillSwitchResponse, KillSwitchActivate
from datetime import datetime
import json

router = APIRouter(prefix="/api/v1/kill", tags=["kill-switch"])

@router.get("/", response_model=KillSwitchResponse)
async def get_kill_switch_status(db: Session = Depends(get_db)):
    """Get current kill switch status"""
    kill_switch = db.query(KillSwitch).order_by(KillSwitch.id.desc()).first()
    
    if not kill_switch:
        kill_switch = KillSwitch(is_active=False)
        db.add(kill_switch)
        db.commit()
        db.refresh(kill_switch)
    
    return kill_switch

@router.post("/", response_model=KillSwitchResponse)
async def activate_kill_switch(
    request: KillSwitchActivate,
    db: Session = Depends(get_db)
):
    """Activate kill switch - stops all automation and device operations"""
    
    kill_switch = db.query(KillSwitch).order_by(KillSwitch.id.desc()).first()
    
    if kill_switch and kill_switch.is_active:
        raise HTTPException(status_code=400, detail="Kill switch is already active")
    
    new_kill_switch = KillSwitch(
        is_active=True,
        reason=request.reason,
        activated_at=datetime.utcnow()
    )
    db.add(new_kill_switch)
    
    audit_log = AuditLog(
        action="kill_switch_activated",
        details={
            "reason": request.reason,
            "timestamp": datetime.utcnow().isoformat()
        }
    )
    db.add(audit_log)
    
    db.commit()
    db.refresh(new_kill_switch)
    
    return new_kill_switch

@router.delete("/", response_model=KillSwitchResponse)
async def deactivate_kill_switch(db: Session = Depends(get_db)):
    """Deactivate kill switch - resumes normal operations"""
    
    kill_switch = db.query(KillSwitch).order_by(KillSwitch.id.desc()).first()
    
    if not kill_switch or not kill_switch.is_active:
        raise HTTPException(status_code=400, detail="Kill switch is not active")
    
    new_kill_switch = KillSwitch(
        is_active=False,
        deactivated_at=datetime.utcnow()
    )
    db.add(new_kill_switch)
    
    audit_log = AuditLog(
        action="kill_switch_deactivated",
        details={
            "timestamp": datetime.utcnow().isoformat()
        }
    )
    db.add(audit_log)
    
    db.commit()
    db.refresh(new_kill_switch)
    
    return new_kill_switch
