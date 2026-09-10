from .ticket import create_ticket

def detect_outage_type(db, pole_id, pole_status, home_id, home_status):
    print(f"[{pole_id}={pole_status}] vs [{home_id}={home_status}]")

    if pole_status == "ON" and home_status == "ON":
        print("Status: NORMAL")
    elif pole_status == "OFF" and home_status == "OFF":
        print("Status: UPSTREAM EVENT")
        create_ticket(db, pole_id, issue="No Current - Upstream Outage")
    elif pole_status == "ON" and home_status == "OFF":
        print("Status: LOCAL FAULT DETECTED!")
        create_ticket(db, pole_id, issue="No Current - Local Fault")
    elif pole_status == "OFF" and home_status == "ON":
        print("Status: INCONSISTENT (Sensor Error?)")
