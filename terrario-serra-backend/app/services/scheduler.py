"""
Automated scene evaluation scheduler
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
import logging

from app.database import SessionLocal, settings
from app.models.scene import Scene
from app.services.scene_automation import process_scene_rules

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()

def evaluate_all_active_scenes():
    """Evaluate all active scenes across all zones"""
    db = SessionLocal()
    try:
        active_scenes = db.query(Scene).filter(Scene.is_active == True).all()
        
        for scene in active_scenes:
            try:
                result = process_scene_rules(scene.id, db)
                if result.get("success"):
                    logger.info(f"Evaluated scene {scene.name}: {len(result.get('executed_actions', []))} actions")
                else:
                    logger.warning(f"Failed to evaluate scene {scene.name}: {result.get('message')}")
            except Exception as e:
                logger.error(f"Error evaluating scene {scene.name}: {str(e)}")
                
    except Exception as e:
        logger.error(f"Error in automated scene evaluation: {str(e)}")
    finally:
        db.close()

def start_scheduler():
    """Start the automated scene evaluation scheduler"""
    if not scheduler.running:
        scheduler.add_job(
            evaluate_all_active_scenes,
            IntervalTrigger(seconds=settings.rule_tick_seconds),
            id='scene_evaluation',
            replace_existing=True
        )
        scheduler.start()
        logger.info(f"Scene evaluation scheduler started (interval: {settings.rule_tick_seconds}s)")

def stop_scheduler():
    """Stop the scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scene evaluation scheduler stopped")
