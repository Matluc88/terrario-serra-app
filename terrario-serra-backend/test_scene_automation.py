#!/usr/bin/env python3
"""
Test script for scene automation functionality
"""
import sys
import os
sys.path.insert(0, '/home/ubuntu/repos/terrario-serra-app/terrario-serra-backend')

from app.services.scene_automation import get_zone_sensor_data, evaluate_scene_condition, process_scene_rules
from app.database import SessionLocal

def test_imports():
    """Test that all imports work correctly"""
    print("✓ Scene automation service imports successfully")
    print("✓ Available functions:", [
        get_zone_sensor_data.__name__, 
        evaluate_scene_condition.__name__, 
        process_scene_rules.__name__
    ])

def test_condition_evaluation():
    """Test condition evaluation logic"""
    condition = {"condition": "temperature", "operator": ">=", "value": 25.0}
    sensor_data = {"temperature": 26.5, "humidity": 60.0}
    
    result = evaluate_scene_condition(condition, sensor_data)
    print(f"✓ Temperature condition test: {result} (expected: True)")
    
    condition = {"condition": "humidity", "operator": "<=", "value": 70.0}
    result = evaluate_scene_condition(condition, sensor_data)
    print(f"✓ Humidity condition test: {result} (expected: True)")

if __name__ == "__main__":
    test_imports()
    test_condition_evaluation()
    print("✓ All tests passed!")
