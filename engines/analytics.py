import datetime
from database import Reading, Device


def format_duration(seconds):
    seconds = max(0, int(seconds))
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours}h {minutes}m"


def compute_uptime(db, device_id, since, until=None):
    """Walks the Reading history for a device and sums real ON/OFF time within [since, until]."""
    until = until or datetime.datetime.utcnow()
    readings = db.query(Reading).filter(
        Reading.device_id == device_id,
        Reading.timestamp <= until
    ).order_by(Reading.timestamp.asc()).all()

    if not readings:
        return {"on_seconds": 0, "off_seconds": 0, "pct": 0.0}

    on_seconds = 0.0
    off_seconds = 0.0
    for i, r in enumerate(readings):
        seg_start = r.timestamp
        seg_end = readings[i + 1].timestamp if i + 1 < len(readings) else until
        clipped_start = max(seg_start, since)
        clipped_end = min(seg_end, until)
        if clipped_end > clipped_start:
            duration = (clipped_end - clipped_start).total_seconds()
            if r.status == "ON":
                on_seconds += duration
            else:
                off_seconds += duration

    total = on_seconds + off_seconds
    pct = (on_seconds / total * 100) if total > 0 else 0.0
    return {"on_seconds": on_seconds, "off_seconds": off_seconds, "pct": pct}


def get_uptime_stats(db, device_id):
    """Real today/week/month ON-time stats derived from the Reading table."""
    now = datetime.datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    windows = {
        "today": today_start,
        "week": now - datetime.timedelta(days=7),
        "month": now - datetime.timedelta(days=30),
    }
    stats = {}
    for key, since in windows.items():
        s = compute_uptime(db, device_id, since, now)
        stats[key] = {
            "on": format_duration(s["on_seconds"]),
            "off": format_duration(s["off_seconds"]),
            "pct": f"{s['pct']:.1f}%",
        }
    return stats


def get_outage_history(db, home_id, pole_id, limit=10):
    """Derives past outage events for a home from real ON->OFF->ON transitions in Reading history."""
    readings = db.query(Reading).filter(Reading.device_id == home_id).order_by(Reading.timestamp.asc()).all()

    events = []
    outage_start = None
    for r in readings:
        if r.status == "OFF" and outage_start is None:
            outage_start = r.timestamp
        elif r.status == "ON" and outage_start is not None:
            events.append((outage_start, r.timestamp))
            outage_start = None
    if outage_start is not None:
        events.append((outage_start, datetime.datetime.utcnow()))

    history = []
    for start, end in reversed(events[-limit:]):
        pole_reading = db.query(Reading).filter(
            Reading.device_id == pole_id,
            Reading.timestamp <= start
        ).order_by(Reading.timestamp.desc()).first()
        outage_type = "Upstream Outage" if (pole_reading and pole_reading.status == "OFF") else "Local Outage"
        history.append({
            "date": start.strftime("%b %d"),
            "time": start.strftime("%I:%M %p"),
            "duration": format_duration((end - start).total_seconds()),
            "type": outage_type,
        })
    return history


def get_community_stats(db, home_id):
    """Compares one home's real 30-day uptime against the average of all homes."""
    now = datetime.datetime.utcnow()
    since = now - datetime.timedelta(days=30)

    my_stats = compute_uptime(db, home_id, since, now)

    homes = db.query(Device).filter(Device.type == "home").all()
    pcts = []
    for h in homes:
        s = compute_uptime(db, h.id, since, now)
        if s["on_seconds"] + s["off_seconds"] > 0:
            pcts.append(s["pct"])
    area_avg = sum(pcts) / len(pcts) if pcts else 0.0

    return {
        "my_availability": f"{my_stats['pct']:.1f}%",
        "area_average": f"{area_avg:.1f}%",
    }
