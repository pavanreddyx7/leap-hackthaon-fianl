from fastapi import FastAPI, Request, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from database import init_db, get_db, Reading, Device, Ticket
from gateway.auth import authenticate_device
from gateway.validator import validate_telemetry
from engines.processor import process_telemetry
from engines.ticket import create_ticket
from engines.analytics import get_uptime_stats, get_outage_history, get_community_stats
import json
import datetime
import uvicorn
from contextlib import asynccontextmanager

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

STALE_THRESHOLD_SECONDS = 120

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import FileResponse

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def serve_index():
    return FileResponse('static/index.html')

@app.post("/api/telemetry")
async def receive_telemetry(request: Request, db: Session = Depends(get_db)):
    device_id = request.headers.get('X-Device-ID')
    token = request.headers.get('X-Device-Token')

    if not device_id or not token:
        raise HTTPException(status_code=401, detail="Missing authentication headers")

    if not authenticate_device(device_id, token):
        raise HTTPException(status_code=401, detail="Unauthorized device")

    payload = await request.json()
    is_valid, reason = validate_telemetry(payload)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Validation failed: {reason}")

    process_telemetry(payload)

    await manager.broadcast(json.dumps({"event": "new_data", "data": payload}))

    return {"message": "Telemetry received and processed successfully"}

@app.get("/api/dashboard_data")
def get_dashboard_data(db: Session = Depends(get_db)):
    total_poles = db.query(Device).filter(Device.type == "pole").count()
    total_homes = db.query(Device).filter(Device.type == "home").count()
    open_tickets = db.query(Ticket).filter(Ticket.status.in_(["OPEN", "NEW", "IN_PROGRESS"])).count()

    poles = db.query(Device).filter(Device.type == "pole").all()
    pole_status_map = {}
    current_poles = 0
    no_current_poles = 0
    not_reporting_poles = 0

    pole_data = []
    alerts = []
    now = datetime.datetime.utcnow()

    for p in poles:
        reading = db.query(Reading).filter(Reading.device_id == p.id).order_by(Reading.timestamp.desc()).first()
        voltage = reading.voltage if reading else 0.0
        timestamp = reading.timestamp.isoformat() if reading else ""

        seconds_since_update = (now - reading.timestamp).total_seconds() if reading else None
        is_reporting = reading is not None and seconds_since_update <= STALE_THRESHOLD_SECONDS

        status = reading.status if (reading and is_reporting) else "NO DATA"

        if status == "ON":
            current_poles += 1
        elif status == "OFF":
            no_current_poles += 1
        else:
            not_reporting_poles += 1

        pole_status_map[p.id] = status

        affected_homes = db.query(Device).filter(Device.parent_pole_id == p.id, Device.type == "home").count()

        p_dict = {
            "id": p.id,
            "parent_id": p.parent_pole_id,
            "status": status,
            "reporting": is_reporting,
            "seconds_since_update": seconds_since_update,
            "voltage": voltage,
            "location": p.location,
            "last_update": timestamp,
            "homes_count": affected_homes
        }
        pole_data.append(p_dict)

        if status == "NO DATA" and affected_homes > 0:
            alerts.append({"pole_id": p.id, "homes_affected": affected_homes, "status": "NO SIGNAL"})
        elif status == "OFF" and affected_homes > 0:
            alerts.append({"pole_id": p.id, "homes_affected": affected_homes, "status": "NO CURRENT"})

    homes = db.query(Device).filter(Device.type == "home").all()
    home_data = []
    for h in homes:
        reading = db.query(Reading).filter(Reading.device_id == h.id).order_by(Reading.timestamp.desc()).first()
        home_data.append({
            "id": h.id,
            "parent_pole_id": h.parent_pole_id,
            "status": reading.status if reading else "UNKNOWN"
        })

    active_tickets = db.query(Ticket).filter(Ticket.status.in_(["OPEN", "NEW", "IN_PROGRESS"])).all()
    ticket_data = []
    for t in active_tickets:
        affected = db.query(Device).filter(Device.parent_pole_id == t.device_id, Device.type == "home").count()
        current_status = pole_status_map.get(t.device_id, "UNKNOWN")
        priority = "🔴 HIGH" if current_status in ("OFF", "NO DATA") else "🟡 MED"
        ticket_data.append({
            "id": f"TK{1000 + t.id}",
            "raw_id": t.id,
            "pole_id": t.device_id,
            "homes_affected": affected,
            "issue": t.issue or "No Current",
            "priority": priority,
            "status": t.status
        })

    return {
        "stats": {
            "total_poles": total_poles,
            "current_poles": current_poles,
            "no_current_poles": no_current_poles,
            "not_reporting_poles": not_reporting_poles,
            "total_homes": total_homes,
            "open_tickets": open_tickets
        },
        "poles": pole_data,
        "alerts": alerts,
        "homes": home_data,
        "tickets": ticket_data
    }

@app.post("/api/tickets")
async def create_ticket_endpoint(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    device_id = payload.get("device_id")
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id is required")

    device = db.query(Device).filter(Device.id == device_id).first()
    pole_id = device.parent_pole_id if (device and device.type == "home" and device.parent_pole_id) else device_id

    issue = payload.get("issue") or "Manual Report"
    ticket = create_ticket(db, pole_id, issue=issue)

    await manager.broadcast(json.dumps({"event": "new_data", "data": {"ticket_id": ticket.id}}))

    return {"id": f"TK{1000 + ticket.id}", "raw_id": ticket.id, "pole_id": ticket.device_id, "issue": ticket.issue, "status": ticket.status}

@app.post("/api/tickets/{ticket_id}/resolve")
async def resolve_ticket_endpoint(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.status = "RESOLVED"
    ticket.resolved_at = datetime.datetime.utcnow()
    db.commit()

    await manager.broadcast(json.dumps({"event": "new_data", "data": {"ticket_id": ticket.id}}))

    return {"id": f"TK{1000 + ticket.id}", "status": ticket.status}

@app.post("/api/homes")
async def create_home_endpoint(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    home_id = payload.get("home_id")
    pole_id = payload.get("pole_id")
    if not home_id or not pole_id:
        raise HTTPException(status_code=400, detail="home_id and pole_id are required")

    pole = db.query(Device).filter(Device.id == pole_id, Device.type == "pole").first()
    if not pole:
        raise HTTPException(status_code=404, detail=f"Pole {pole_id} not found")

    if db.query(Device).filter(Device.id == home_id).first():
        raise HTTPException(status_code=400, detail=f"Device {home_id} already exists")

    home = Device(id=home_id, type="home", location=payload.get("location") or "", parent_pole_id=pole_id)
    db.add(home)

    status = payload.get("status") if payload.get("status") in ["ON", "OFF"] else "ON"
    reading = Reading(device_id=home_id, status=status, voltage=230.0 if status == "ON" else 0.0)
    db.add(reading)
    db.commit()

    await manager.broadcast(json.dumps({"event": "new_data", "data": {"home_id": home_id}}))

    return {"id": home.id, "pole_id": pole_id, "status": status}

@app.get("/customer")
async def serve_customer():
    return FileResponse('static/customer.html')

@app.get("/api/customer_data/{home_id}")
def get_customer_data(home_id: str, db: Session = Depends(get_db)):
    home_reading = db.query(Reading).filter(Reading.device_id == home_id).order_by(Reading.timestamp.desc()).first()

    home_device = db.query(Device).filter(Device.id == home_id).first()
    pole_id = "P001"
    if home_device and home_device.parent_pole_id:
        pole_id = home_device.parent_pole_id

    pole_reading = db.query(Reading).filter(Reading.device_id == pole_id).order_by(Reading.timestamp.desc()).first()

    tickets = db.query(Ticket).filter(Ticket.device_id == home_id).order_by(Ticket.created_at.desc()).all()

    if not tickets:
        tickets = db.query(Ticket).filter(Ticket.device_id == pole_id).order_by(Ticket.created_at.desc()).all()

    analytics = get_uptime_stats(db, home_id)
    outage_history = get_outage_history(db, home_id, pole_id)
    community = get_community_stats(db, home_id)

    return {
        "home": {"device_id": home_id, "status": home_reading.status, "voltage": home_reading.voltage, "current_amps": home_reading.current_amps, "timestamp": home_reading.timestamp.isoformat()} if home_reading else None,
        "pole": {"device_id": pole_id, "status": pole_reading.status, "voltage": pole_reading.voltage, "current_amps": pole_reading.current_amps, "timestamp": pole_reading.timestamp.isoformat()} if pole_reading else None,
        "tickets": [{"id": f"TK{1000+t.id}", "issue": t.issue or "No Current", "status": t.status} for t in tickets],
        "analytics": analytics,
        "outage_history": outage_history,
        "community": community
    }

@app.websocket("/ws/customer/{home_id}")
async def customer_websocket_endpoint(websocket: WebSocket, home_id: str):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.websocket("/ws/dashboard")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)
