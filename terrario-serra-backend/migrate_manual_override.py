#!/usr/bin/env python3
"""
Database migration to add manual override fields to outlets table
"""
import sys
import os
sys.path.insert(0, '/home/ubuntu/repos/terrario-serra-app/terrario-serra-backend')

from sqlalchemy import text
from app.database import SessionLocal, engine

def migrate_manual_override_fields():
    """Add manual_override and manual_override_until fields to outlets table"""
    db = SessionLocal()
    try:
        result = db.execute(text("PRAGMA table_info(outlets)"))
        columns = [row[1] for row in result.fetchall()]
        
        changes_made = False
        
        if 'manual_override' not in columns:
            db.execute(text("ALTER TABLE outlets ADD COLUMN manual_override BOOLEAN DEFAULT FALSE"))
            print("✅ Added manual_override column")
            changes_made = True
        else:
            print("ℹ️  manual_override column already exists")
        
        if 'manual_override_until' not in columns:
            db.execute(text("ALTER TABLE outlets ADD COLUMN manual_override_until DATETIME"))
            print("✅ Added manual_override_until column")
            changes_made = True
        else:
            print("ℹ️  manual_override_until column already exists")
        
        if changes_made:
            db.commit()
            print("✅ Manual override fields migration completed successfully")
        else:
            print("ℹ️  No migration needed - all fields already exist")
        
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("🔄 Starting manual override fields migration...")
    migrate_manual_override_fields()
    print("✅ Migration script completed")
