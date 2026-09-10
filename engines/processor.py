from database import SessionLocal, Reading, Device
from datetime import datetime
from .comparison import check_pole_home_status

def process_telemetry(payload: dict):
    db = SessionLocal()
    try:
        reading = Reading(
            device_id=payload["device_id"],
            status=payload["status"],
            voltage=payload.get("voltage"),
            current_amps=payload.get("current_amps"),
            timestamp=datetime.utcnow()
        )
        db.add(reading)

        device = db.query(Device).filter(Device.id == payload["device_id"]).first()
        if not device:
            device = Device(
                id=payload["device_id"],
                type=payload["type"]
            )
            db.add(device)

        db.commit()

        check_pole_home_status(db, device)

    finally:
        db.close()
