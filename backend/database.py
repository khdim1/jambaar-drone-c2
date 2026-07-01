# database.py
from sqlalchemy import create_engine, Column, Integer, Float, String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import json

# SQLite database file
SQLALCHEMY_DATABASE_URL = "sqlite:///./drones.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# -------------------------- Tables -------------------------------------

class Drone(Base):
    __tablename__ = "drones"
    id = Column(String, primary_key=True, index=True)          # "DRONE-001"
    name = Column(String, nullable=False)
    model = Column(String)
    status = Column(String, default="idle")
    latitude = Column(Float, default=0.0)
    longitude = Column(Float, default=0.0)
    altitude = Column(Float, default=0.0)
    speed = Column(Float, default=0.0)
    heading = Column(Float, default=0.0)
    battery = Column(Float, default=100.0)
    signal_strength = Column(Integer, default=100)
    camera_active = Column(Boolean, default=False)
    ai_active = Column(Boolean, default=True)
    gps_locked = Column(Boolean, default=True)
    temperature = Column(Float, default=25.0)
    flight_time = Column(Integer, default=0)      # seconds
    total_distance = Column(Float, default=0.0)
    home_lat = Column(Float, default=0.0)
    home_lng = Column(Float, default=0.0)
    detections_today = Column(Integer, default=0)
    last_seen = Column(DateTime, default=datetime.utcnow)
    # Relations
    parameters = relationship("DroneParameter", back_populates="drone", cascade="all, delete-orphan")
    missions = relationship("Mission", back_populates="drone", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="drone", cascade="all, delete-orphan")
    telemetry = relationship("TelemetryRecord", back_populates="drone", cascade="all, delete-orphan")

class DroneParameter(Base):
    __tablename__ = "drone_parameters"
    id = Column(Integer, primary_key=True, index=True)
    drone_id = Column(String, ForeignKey("drones.id"), nullable=False)
    param_name = Column(String, nullable=False)
    param_value = Column(String, nullable=False)   # stocké en texte pour flexibilité
    drone = relationship("Drone", back_populates="parameters")

class Mission(Base):
    __tablename__ = "missions"
    id = Column(String, primary_key=True, index=True)   # généré par uuid
    drone_id = Column(String, ForeignKey("drones.id"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, default="patrol")
    waypoints = Column(JSON)           # liste de dict {lat, lng, alt, loiter_time, action}
    speed = Column(Float, default=15.0)
    altitude = Column(Float, default=120.0)
    camera_mode = Column(String, default="video")
    ai_detection = Column(Boolean, default=True)
    return_on_low_battery = Column(Float, default=20.0)
    status = Column(String, default="pending")  # pending, active, completed, cancelled
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, nullable=True)
    drone = relationship("Drone", back_populates="missions")

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(String, primary_key=True, index=True)   # uuid
    drone_id = Column(String, ForeignKey("drones.id"), nullable=False)
    level = Column(String)       # red, orange, yellow, green
    type = Column(String)        # intrusion, vehicle, weapon, group, anomaly
    description = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    confidence = Column(Float)
    thumbnail = Column(String, nullable=True)   # URL ou base64
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")  # active, acknowledged, resolved, false_positive
    notes = Column(String, nullable=True)
    acknowledged_by = Column(String, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    drone = relationship("Drone", back_populates="alerts")

class CommandLog(Base):
    __tablename__ = "command_logs"
    id = Column(String, primary_key=True, index=True)   # uuid
    drone_id = Column(String, ForeignKey("drones.id"), nullable=False)
    command = Column(String)       # takeoff, land, rtl, etc.
    params = Column(JSON)          # dict
    sent_by = Column(String)       # nom de l'utilisateur
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="sent")   # sent, executed, failed

class TelemetryRecord(Base):
    __tablename__ = "telemetry"
    id = Column(Integer, primary_key=True, index=True)
    drone_id = Column(String, ForeignKey("drones.id"), nullable=False)
    latitude = Column(Float)
    longitude = Column(Float)
    altitude = Column(Float)
    speed = Column(Float)
    heading = Column(Float)
    battery = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)
    drone = relationship("Drone", back_populates="telemetry")

# -------------------------- Create tables ---------------------------------
def create_tables():
    Base.metadata.create_all(bind=engine)

# -------------------------- Helper functions (optionnelles) --------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()