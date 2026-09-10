from database import Device, Reading
from sqlalchemy import desc
from .outage import detect_outage_type

def get_latest_status(db, device_id):
    reading = db.query(Reading).filter(Reading.device_id == device_id).order_by(desc(Reading.timestamp)).first()
    return reading.status if reading else "UNKNOWN"

def check_pole_home_status(db, device: Device):
    # Each device's own reading only ever gets compared against its real,
    # explicitly-linked counterpart (via parent_pole_id) - never guessed or
    # cross-linked to an unrelated pole/home, so data from separate ESP32
    # units is never mixed.
    if device.type == "pole":
        pole_id = device.id
        pole_status = get_latest_status(db, pole_id)
        homes = db.query(Device).filter(Device.parent_pole_id == pole_id, Device.type == "home").all()
        for home in homes:
            home_status = get_latest_status(db, home.id)
            detect_outage_type(db, pole_id, pole_status, home.id, home_status)

    elif device.type == "home" and device.parent_pole_id:
        pole_id = device.parent_pole_id
        pole_status = get_latest_status(db, pole_id)
        home_status = get_latest_status(db, device.id)
        detect_outage_type(db, pole_id, pole_status, device.id, home_status)
