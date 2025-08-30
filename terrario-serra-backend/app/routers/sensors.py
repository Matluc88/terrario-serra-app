# app/routers/sensors.py
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from pydantic import BaseModel

from app.database import get_db
from app.models.sensor import Sensor, Reading

router = APIRouter(prefix="/api/v1/sensors", tags=["sensors"])

# ---------- Ingest: riceve letture dai sensori ----------
class IngestPayload(BaseModel):
    zone_id: int
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    observed_at: Optional[datetime] = None

@router.post("/ingest")
def ingest(payload: IngestPayload, db: Session = Depends(get_db)):
    # Trova (o crea) un sensore per quella zona
    sensor = db.query(Sensor).filter(Sensor.zone_id == payload.zone_id).first()
    if not sensor:
        sensor = Sensor(zone_id=payload.zone_id, name="Gateway Sensor")
        db.add(sensor); db.commit(); db.refresh(sensor)

    ts = payload.observed_at or datetime.utcnow()

    if payload.temperature is not None:
        db.add(Reading(sensor_id=sensor.id, value=payload.temperature, unit="°C", observed_at=ts))
    if payload.humidity is not None:
        db.add(Reading(sensor_id=sensor.id, value=payload.humidity, unit="%", observed_at=ts))

    db.commit()
    return {"ok": True, "sensor_id": sensor.id}

# ---------- Helper: ultima lettura per unità ----------
def _get_last(db: Session, sensor_id: int, unit: str) -> Optional[Reading]:
    return (
        db.query(Reading)
        .filter(Reading.sensor_id == sensor_id, Reading.unit == unit)
        .order_by(Reading.observed_at.desc())
        .first()
    )

# ---------- Lista sensori della zona (con ultime letture) ----------
@router.get("/zone/{zone_id}")
def list_zone_sensors(zone_id: int, db: Session = Depends(get_db)):
    sensors: List[Sensor] = db.query(Sensor).filter(Sensor.zone_id == zone_id).all()
    out = []
    for s in sensors:
        t = _get_last(db, s.id, "°C")
        h = _get_last(db, s.id, "%")
        out.append({
            "id": s.id,
            "zone_id": s.zone_id,
            "name": s.name or f"Sensor {s.id}",
            "last_readings": {
                "temperature": t.value if t else None,
                "temperature_timestamp": t.observed_at.isoformat() if t else None,
                "humidity": h.value if h else None,
                "humidity_timestamp": h.observed_at.isoformat() if h else None,
            }
        })
    return out

# ---------- Ultime letture aggregate della zona ----------
@router.get("/zone/{zone_id}/latest")
def latest_for_zone(zone_id: int, db: Session = Depends(get_db)):
    sensors = db.query(Sensor).filter(Sensor.zone_id == zone_id).all()
    latest_t: Optional[Reading] = None
    latest_h: Optional[Reading] = None

    for s in sensors:
        t = _get_last(db, s.id, "°C")
        h = _get_last(db, s.id, "%")
        if t and (latest_t is None or t.observed_at > latest_t.observed_at):
            latest_t = t
        if h and (latest_h is None or h.observed_at > latest_h.observed_at):
            latest_h = h

    return {
        "temperature": latest_t.value if latest_t else None,
        "temperature_timestamp": latest_t.observed_at.isoformat() if latest_t else None,
        "humidity": latest_h.value if latest_h else None,
        "humidity_timestamp": latest_h.observed_at.isoformat() if latest_h else None,
    }
