from database import SessionLocal, init_db, Device, Base, engine

def seed_database():
    print("Dropping existing tables and recreating...")
    Base.metadata.drop_all(bind=engine)
    init_db()

    db = SessionLocal()

    print("Seeding devices — only the real hardware you actually have...")
    devices = [
        Device(id="P001", type="pole", location="13.324254, 77.095494"),
        Device(id="H001", type="home", location="House 1, Area 1", parent_pole_id="P001"),
    ]
    db.add_all(devices)
    db.commit()

    print("Seeding complete! No readings, tickets, or outages pre-seeded — every")
    print("device starts with zero history. Status shows as NO DATA / AWAITING")
    print("DEVICE until real telemetry arrives from actual hardware.")

if __name__ == "__main__":
    seed_database()
