"""
Automated scene evaluation scheduler
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
import logging
import asyncio

from app.database import SessionLocal, settings
from app.models.scene import Scene
from app.models.zone import Zone
from app.models.automation_session import AutomationSession
from app.models.kill_switch import KillSwitch
from app.services.scene_automation import process_scene_rules
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()

def evaluate_all_active_scenes():
    """Evaluate all active scenes and automation sessions"""
    db = SessionLocal()
    try:
        kill_switch = db.query(KillSwitch).order_by(KillSwitch.id.desc()).first()
        if kill_switch and kill_switch.is_active:
            logger.info("Kill switch is active, skipping scene evaluation")
            return
        
        current_time = datetime.utcnow()
        active_sessions = db.query(AutomationSession).filter(
            AutomationSession.is_active == True,
            AutomationSession.status == "running"
        ).all()
        
        for session in active_sessions:
            elapsed_time = current_time - session.started_at.replace(tzinfo=None)
            total_duration = timedelta(minutes=session.duration_minutes)
            
            if elapsed_time >= total_duration:
                session.is_active = False
                session.status = "completed"
                
                zone = db.query(Zone).filter(Zone.id == session.zone_id).first()
                if zone:
                    zone.mode = "manual"
                
                logger.info(f"Automation session {session.id} completed after {session.duration_minutes} minutes")
        
        db.commit()
        
        active_sessions = db.query(AutomationSession).filter(
            AutomationSession.is_active == True,
            AutomationSession.status == "running"
        ).all()
        
        for session in active_sessions:
            try:
                loop = asyncio.get_event_loop()
                result = loop.run_until_complete(process_scene_rules(session.scene_id, db))
                session.last_evaluation_at = current_time
                
                if result.get("success"):
                    logger.info(f"Evaluated automation session {session.id} scene: {len(result.get('executed_actions', []))} actions")
                else:
                    logger.warning(f"Failed to evaluate automation session {session.id}: {result.get('message')}")
            except Exception as e:
                logger.error(f"Error evaluating automation session {session.id}: {str(e)}")
        
        db.commit()
        
        standalone_scenes = db.query(Scene).filter(Scene.is_active == True).all()
        session_scene_ids = {session.scene_id for session in active_sessions}
        
        for scene in standalone_scenes:
            if scene.id not in session_scene_ids:
                try:
                    loop = asyncio.get_event_loop()
                    result = loop.run_until_complete(process_scene_rules(scene.id, db))
                    if result.get("success"):
                        logger.info(f"Evaluated standalone scene {scene.name}: {len(result.get('executed_actions', []))} actions")
                    else:
                        logger.warning(f"Failed to evaluate standalone scene {scene.name}: {result.get('message')}")
                except Exception as e:
                    logger.error(f"Error evaluating standalone scene {scene.name}: {str(e)}")
                
    except Exception as e:
        logger.error(f"Error in automated scene evaluation: {str(e)}")
    finally:
        db.close()

def start_scheduler():
    """Start the automated scene evaluation scheduler"""
    if not scheduler.running:
        scheduler.add_job(
            evaluate_all_active_scenes,
            IntervalTrigger(seconds=300),  # 5 minutes
            id='scene_evaluation',
            replace_existing=True
        )
        scheduler.start()
        logger.info("Scene evaluation scheduler started (interval: 5 minutes)")

def stop_scheduler():
    """Stop the scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scene evaluation scheduler stopped")
