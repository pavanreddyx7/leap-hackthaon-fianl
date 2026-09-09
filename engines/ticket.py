from database import Ticket
from .notification import send_sms_alert

def create_ticket(db, device_id, issue="No Current"):
    """
    Creates a ticket if one doesn't already exist and is open.
    """
    existing_ticket = db.query(Ticket).filter(
        Ticket.device_id == device_id,
        Ticket.status.in_(["OPEN", "NEW", "IN_PROGRESS"])
    ).first()
    if existing_ticket:
        print(f"Ticket already open for {device_id} (Ticket ID: {existing_ticket.id})")
        return existing_ticket

    new_ticket = Ticket(device_id=device_id, status="OPEN", issue=issue)
    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)

    print(f"Created new Ticket #{new_ticket.id} for {device_id}")
    send_sms_alert(f"{issue} detected at {device_id}. Ticket #{new_ticket.id} assigned.")

    return new_ticket
