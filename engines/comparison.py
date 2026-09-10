from database import Device, Reading
from sqlalchemy import desc
from .outage import detect_outage_type

def get_latest_status(db, device_id):
    reading = db.query(Reading).filter(Reading.device_id == device_id).order_by(desc(Reading.timestamp)).first()
    return reading.status if reading else "UNKNOWN"

def check_pole_home_status(db, device: Device):
    pole_status = "UNKNOWN"
    home_status = "UNKNOWN"
    target_home_id = None
    target_pole_id = None

    if device.type == "pole":
        target_pole_id = device.id
        pole_status = get_latest_status(db, target_pole_id)
        home = db.query(Device).filter(Device.parent_pole_id == target_pole_id).first()
        if home:
            target_home_id = home.id
            home_status = get_latest_status(db, target_home_id)
        else:
            home = db.query(Device).filter(Device.type == "home").first()
            if home:
                target_home_id = home.id
                home_status = get_latest_status(db, target_home_id)

    elif device.type == "home":
        target_home_id = device.id
        home_status = get_latest_status(db, target_home_id)
        if device.parent_pole_id:
            target_pole_id = device.parent_pole_id
            pole_status = get_latest_status(db, target_pole_id)
        else:
            pole = db.query(Device).filter(Device.type == "pole").first()
            if pole:
                target_pole_id = pole.id
                pole_status = get_latest_status(db, target_pole_id)

    if target_pole_id and target_home_id:
        detect_outage_type(db, target_pole_id, pole_status, target_home_id, home_status)
