from .ticket import create_ticket

def detect_outage_type(db, pole_id, pole_status, home_id, home_status):
    print(f"[{pole_id}={pole_status}] vs [{home_id}={home_status}]")

    if pole_status == "OFF":
        # Pole has no current, so nothing downstream can have power either,
        # regardless of what an individual home reports. One ticket on the
        # pole covers every home connected to it.
        print("Status: UPSTREAM EVENT - pole has no current, affects all connected homes")
        create_ticket(db, pole_id, issue="No Current - Upstream Outage")
    elif home_status == "OFF":
        # Pole is fine but this specific home has zero voltage - a local
        # fault. Ticket is keyed to the home so it never bleeds onto
        # siblings sharing the same pole.
        print("Status: LOCAL FAULT DETECTED!")
        create_ticket(db, home_id, issue="No Current - Local Fault")
    else:
        print("Status: NORMAL")
