from database import SessionLocal, Reading, Device
from datetime import datetime
from .comparison import check_pole_home_status

def process_telemetry(payload: dict):
    """
    Saves reading to DB and triggers comparison engine.
    """
    db = SessionLocal()
    try:
        # Save Reading
        reading = Reading(
            device_id=payload["device_id"],
            status=payload["status"],
            voltage=payload.get("voltage"),
            timestamp=datetime.utcnow()
        )
        db.add(reading)
        
        # Ensure device exists, for simplicity auto-create
        device = db.query(Device).filter(Device.id == payload["device_id"]).first()
        if not device:
            device = Device(
                id=payload["device_id"],
                type=payload["type"]
            )
            db.add(device)
            
        db.commit()
        
        # Trigger Comparison Engine if we have enough context
        # (This is simplified, normally it would be async or triggered by a change)
        check_pole_home_status(db, device)
        
    finally:
        db.close()
