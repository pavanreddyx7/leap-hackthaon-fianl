from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker
import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./iot_platform.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Device(Base):
    __tablename__ = "devices"
    id = Column(String, primary_key=True, index=True)
    type = Column(String) # 'pole' or 'home'
    location = Column(String)
    # A pole can serve multiple homes
    parent_pole_id = Column(String, ForeignKey("devices.id"), nullable=True)

class Reading(Base):
    __tablename__ = "readings"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, ForeignKey("devices.id"))
    status = Column(String) # 'ON', 'OFF'
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    voltage = Column(Float, nullable=True)
    
class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, ForeignKey("devices.id"))
    issue = Column(String, nullable=True)
    status = Column(String, default="OPEN") # 'OPEN', 'IN_PROGRESS', 'RESOLVED'
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

def init_db():
    Base.metadata.create_all(bind=engine)
    
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
