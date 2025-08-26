from app.database import SessionLocal
from app.models.scene import Scene, SceneRule
from app.models.device import Device, Outlet
import json

db = SessionLocal()
try:
    scene = db.query(Scene).filter(Scene.name == 'prova').first()
    if scene:
        print(f'Scene found: {scene.name} (ID: {scene.id})')
        print(f'Zone ID: {scene.zone_id}')
        print(f'Active: {scene.is_active}')
        print(f'Settings: {json.dumps(scene.settings, indent=2)}')
        
        rules = db.query(SceneRule).filter(SceneRule.scene_id == scene.id).all()
        print(f'\nRules ({len(rules)}):')
        for rule in rules:
            print(f'  Rule {rule.id}: {rule.name}')
            print(f'    Condition: {json.dumps(rule.condition, indent=4)}')
            print(f'    Action: {json.dumps(rule.action, indent=4)}')
            print(f'    Priority: {rule.priority}')
            print()
        
        outlets = db.query(Outlet).join(Device).filter(Device.zone_id == scene.zone_id).all()
        print(f'Outlets in zone {scene.zone_id}:')
        for outlet in outlets:
            print(f'  {outlet.custom_name} (channel: {outlet.channel}, enabled: {outlet.enabled})')
    else:
        print('Scene "prova" not found')
finally:
    db.close()
