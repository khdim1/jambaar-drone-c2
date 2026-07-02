"""
=============================================================
DRONE C2 — BACKEND FASTAPI COMPLET AVEC MAVLINK RÉEL
Support : USB Direct, RPi WebSocket, Jetson Nano
VERSION CORRIGÉE : ARM/DISARM/TAKEOFF fiables
- Support WebSocket direct via pymavlink
- Support TCP avec websockify
- COMMAND_ACK (msg 77) renvoie l'état réel du FC via WebSocket
=============================================================
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from contextlib import asynccontextmanager
import asyncio, json, random, uuid, math, threading, queue, time
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import serial
import serial.tools.list_ports

# ─────────────────────────────────────────────────────────────
#  MAVLINK IMPORTS (pymavlink)
# ─────────────────────────────────────────────────────────────
from pymavlink import mavutil

# ─────────────────────────────────────────────────────────────
#  DATABASE SETUP
# ─────────────────────────────────────────────────────────────
from sqlalchemy import (
    create_engine, Column, Integer, Float, String,
    Boolean, DateTime, JSON, ForeignKey, desc, Text
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from fastapi.staticfiles import StaticFiles
import os
# ─────────────────────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────────────────────
DEFAULT_LAT = 14.7167
DEFAULT_LNG = -17.4677
DATABASE_URL = "sqlite:///./drones.db"

# ─────────────────────────────────────────────────────────────
#  DATABASE SETUP
# ─────────────────────────────────────────────────────────────
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()



# ─────────────────────────────────────────────────────────────
#  SQLALCHEMY MODELS
# ─────────────────────────────────────────────────────────────
class DroneDB(Base):
    __tablename__ = "drones"
    id               = Column(String,  primary_key=True, index=True)
    name             = Column(String,  nullable=False)
    model            = Column(String,  default="Unknown")
    status           = Column(String,  default="idle")
    latitude         = Column(Float,   default=14.5)
    longitude        = Column(Float,   default=-14.5)
    altitude         = Column(Float,   default=0.0)
    speed            = Column(Float,   default=0.0)
    heading          = Column(Float,   default=0.0)
    battery          = Column(Float,   default=100.0)
    signal_strength  = Column(Integer, default=100)
    camera_active    = Column(Boolean, default=False)
    ai_active        = Column(Boolean, default=True)
    gps_locked       = Column(Boolean, default=True)
    temperature      = Column(Float,   default=25.0)
    flight_time      = Column(Integer, default=0)
    total_distance   = Column(Float,   default=0.0)
    home_lat         = Column(Float,   default=14.5)
    home_lng         = Column(Float,   default=-14.5)
    detections_today = Column(Integer, default=0)
    last_seen        = Column(DateTime, default=datetime.utcnow)
    active_mission_id    = Column(String, nullable=True)
    active_waypoint_idx  = Column(Integer, default=0)
    armed            = Column(Boolean, default=False)


class MissionDB(Base):
    __tablename__ = "missions"
    id                    = Column(String,  primary_key=True, index=True)
    drone_id              = Column(String,  ForeignKey("drones.id"), nullable=False)
    name                  = Column(String,  nullable=False)
    type                  = Column(String,  default="patrol")
    waypoints             = Column(JSON,    default=list)
    speed                 = Column(Float,   default=15.0)
    altitude              = Column(Float,   default=120.0)
    camera_mode           = Column(String,  default="video")
    ai_detection          = Column(Boolean, default=True)
    return_on_low_battery = Column(Float,   default=20.0)
    status                = Column(String,  default="pending")
    created_at            = Column(DateTime, default=datetime.utcnow)
    created_by            = Column(String,  nullable=True)


class AlertDB(Base):
    __tablename__ = "alerts"
    id               = Column(String,  primary_key=True, index=True)
    drone_id         = Column(String,  ForeignKey("drones.id"), nullable=False)
    drone_name       = Column(String,  default="")
    level            = Column(String,  default="yellow")
    type             = Column(String,  default="anomaly")
    description      = Column(String,  default="")
    latitude         = Column(Float,   default=0.0)
    longitude        = Column(Float,   default=0.0)
    confidence       = Column(Float,   default=0.8)
    timestamp        = Column(DateTime, default=datetime.utcnow)
    status           = Column(String,  default="active")
    notes            = Column(String,  nullable=True)
    acknowledged_by  = Column(String,  nullable=True)
    acknowledged_at  = Column(DateTime, nullable=True)


class CommandLogDB(Base):
    __tablename__ = "command_logs"
    id        = Column(String,   primary_key=True, index=True)
    drone_id  = Column(String,   ForeignKey("drones.id"), nullable=False)
    command   = Column(String)
    params    = Column(JSON,     default=dict)
    sent_by   = Column(String,   default="system")
    timestamp = Column(DateTime, default=datetime.utcnow)
    status    = Column(String,   default="sent")


class TelemetryDB(Base):
    __tablename__ = "telemetry"
    id        = Column(Integer, primary_key=True, autoincrement=True)
    drone_id  = Column(String,  ForeignKey("drones.id"), nullable=False)
    latitude  = Column(Float)
    longitude = Column(Float)
    altitude  = Column(Float)
    speed     = Column(Float)
    heading   = Column(Float)
    battery   = Column(Float)
    armed     = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


class DroneParamDB(Base):
    __tablename__ = "drone_params"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    drone_id    = Column(String,  ForeignKey("drones.id"), nullable=False)
    param_name  = Column(String,  nullable=False)
    param_value = Column(String,  nullable=False)
    param_type  = Column(String,  default="INT32")
    description = Column(String,  default="")


class BaseStationDB(Base):
    __tablename__ = "base_station"
    id        = Column(Integer, primary_key=True, autoincrement=True)
    name      = Column(String,  default="Base Principale")
    latitude  = Column(Float,   default=14.7167)
    longitude = Column(Float,   default=-17.4677)
    altitude  = Column(Float,   default=0.0)


class DroneFlightDB(Base):
    __tablename__ = "drone_flights"
    id               = Column(Integer,  primary_key=True, autoincrement=True)
    drone_id         = Column(String,   ForeignKey("drones.id"), nullable=False)
    start_time       = Column(DateTime, default=datetime.utcnow)
    end_time         = Column(DateTime, nullable=True)
    distance_km      = Column(Float,    default=0.0)
    battery_consumed = Column(Float,    default=0.0)
    mission_name     = Column(String,   nullable=True)
    trajectory       = Column(JSON,     default=list)


class MaintenanceDB(Base):
    __tablename__ = "drone_maintenance"
    id             = Column(Integer,  primary_key=True, autoincrement=True)
    drone_id       = Column(String,   ForeignKey("drones.id"), nullable=False)
    scheduled_date = Column(DateTime, nullable=False)
    description    = Column(String,   default="")
    status         = Column(String,   default="pending")
    created_at     = Column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────────────────────
#  PYDANTIC SCHEMAS
# ─────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class UserInfo(BaseModel):
    username: str
    role: str
    name: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserInfo

class Waypoint(BaseModel):
    lat: float
    lng: float
    alt: float = 120.0
    loiter_time: int = 0
    action: str = "waypoint"

class MissionPlan(BaseModel):
    name: str
    type: str = "patrol"
    waypoints: List[Waypoint] = []
    speed: float = 15.0
    altitude: float = 120.0
    camera_mode: str = "video"
    ai_detection: bool = True
    return_on_low_battery: float = 20.0

class DroneCommand(BaseModel):
    action: str
    params: Dict[str, Any] = {}

class AlertUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

class DroneCreate(BaseModel):
    id: str
    name: str
    model: str
    home_lat: float = 14.5
    home_lng: float = -14.5

class ParamUpdate(BaseModel):
    name: str
    value: str
    param_type: str = "INT32"

class TextCommand(BaseModel):
    command: str

class BaseStationUpdate(BaseModel):
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class MavlinkConnection(BaseModel):
    type: str = "usb"
    port: Optional[str] = None
    baudrate: int = 115200
    url: Optional[str] = None

class ArmedUpdate(BaseModel):
    armed: bool


# ─────────────────────────────────────────────────────────────
#  AUTH
# ─────────────────────────────────────────────────────────────
USERS = {
    "admin":     {"password": "admin123", "role": "admin",    "name": "Commandant Diallo"},
    "operateur": {"password": "op123",    "role": "operator", "name": "Lt. Ndiaye"},
    "analyste":  {"password": "an123",    "role": "analyst",  "name": "Sgt. Sarr"},
}

JWT_SECRET = "votre_cle_secrete"
ALGORITHM = "HS256"

def create_token(data: dict) -> str:
    import jwt
    payload = {**data, "exp": datetime.utcnow() + timedelta(hours=12)}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)

def verify_token(token: str) -> Optional[dict]:
    import jwt
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except:
        return None


# ─────────────────────────────────────────────────────────────
#  WEBSOCKET MANAGER
# ─────────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        self.connections = [c for c in self.connections if c is not ws]

    async def broadcast(self, data: dict):
        msg = json.dumps(data, default=str)
        dead = []
        for c in self.connections:
            try:
                await c.send_text(msg)
            except Exception:
                dead.append(c)
        for c in dead:
            self.disconnect(c)

    async def send_to(self, ws: WebSocket, data: dict):
        try:
            await ws.send_text(json.dumps(data, default=str))
        except Exception:
            self.disconnect(ws)


manager = ConnectionManager()


# ─────────────────────────────────────────────────────────────
#  MAVLINK CONNECTION MANAGER
# ─────────────────────────────────────────────────────────────
class MavlinkManager:
    def __init__(self):
        self.master = None
        self.connection_type = None
        self.is_connected = False
        self._armed_status = False
        self.telemetry = {
            "latitude": 14.7167,
            "longitude": -17.4677,
            "altitude": 0,
            "speed": 0,
            "heading": 0,
            "battery": 100,
            "armed": False,
            "mode": "STABILIZE"
        }
        self._running = False
        self._thread = None
        self._on_armed_ack = None
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 10

    def set_armed_ack_callback(self, cb):
        self._on_armed_ack = cb

    def connect_usb(self, port: str, baudrate: int = 115200) -> bool:
        try:
            print(f"🔌 Tentative connexion sur {port} @ {baudrate} baud")
            self.master = mavutil.mavlink_connection(port, baud=baudrate)
            self.master.wait_heartbeat(timeout=5)
            if self.master.target_system:
                self.connection_type = "usb"
                self.is_connected = True
                self._running = True
                self._thread = threading.Thread(target=self._read_loop, daemon=True)
                self._thread.start()
                print(f"✅ MAVLink connecté sur {port} @ {baudrate} baud")
                return True
        except Exception as e:
            print(f"❌ Erreur USB: {e}")
        return False

    def connect_rpi(self, url: str) -> bool:
        try:
            print(f"🔌 Tentative connexion WebSocket sur {url}")
            self.master = mavutil.mavlink_connection(url)
            self.master.wait_heartbeat(timeout=10)
            if self.master.target_system:
                self.connection_type = "rpi"
                self.is_connected = True
                self._running = True
                self._thread = threading.Thread(target=self._read_loop, daemon=True)
                self._thread.start()
                print(f"✅ MAVLink connecté sur {url}")
                return True
            else:
                print("❌ Aucun heartbeat reçu")
        except Exception as e:
            print(f"❌ Erreur RPi/Jetson: {e}")
        return False

    def _read_loop(self):
        while self._running and self.is_connected:
            try:
                msg = self.master.recv_msg()
                if msg:
                    self._process_message(msg)
                else:
                    time.sleep(0.01)
            except Exception as e:
                print(f"⚠️ Erreur MAVLink: {e}")
                self._reconnect_attempts += 1
                if self._reconnect_attempts > self._max_reconnect_attempts:
                    self.is_connected = False
                    break
                time.sleep(2)

    def _process_message(self, msg):
        try:
            msg_type = msg.get_type()

            if msg_type == 'HEARTBEAT':
                self.telemetry["mode"] = mavutil.mode_string_v10(msg)
                new_armed = (msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED) != 0
                self.telemetry["armed"] = new_armed
                self._armed_status = new_armed
                self._reconnect_attempts = 0
                print(f"📥 HEARTBEAT: mode={self.telemetry['mode']}, armed={new_armed}")

            elif msg_type == 'GLOBAL_POSITION_INT':
                self.telemetry["latitude"] = msg.lat / 1e7
                self.telemetry["longitude"] = msg.lon / 1e7
                self.telemetry["altitude"] = msg.alt / 1000
                self.telemetry["heading"] = msg.hdg / 100

            elif msg_type == 'VFR_HUD':
                self.telemetry["speed"] = msg.groundspeed
                self.telemetry["heading"] = msg.heading
                self.telemetry["altitude"] = msg.alt

            elif msg_type == 'SYS_STATUS':
                self.telemetry["battery"] = msg.battery_remaining

            elif msg_type == 'COMMAND_ACK':
                command = msg.command
                result = msg.result
                print(f"📥 COMMAND_ACK: cmd={command}, result={result}")
                if command == 400:
                    if result == 0:
                        print(f"✅ ARM/DISARM ACK accepté — armed={self._armed_status}")
                        if self._on_armed_ack:
                            self._on_armed_ack(self._armed_status)
                    else:
                        print(f"⚠️ ARM/DISARM ACK refusé (result={result})")

        except Exception as e:
            print(f"⚠️ Erreur traitement message: {e}")

    def send_command(self, command: str, params: dict = None) -> bool:
        if not self.is_connected or not self.master:
            print("❌ MAVLink non connecté")
            return False

        params = params or {}
        print(f"📤 Envoi commande: {command}")

        try:
            target_system = self.master.target_system
            target_component = self.master.target_component

            if command == "arm":
                self.master.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                    0, 1, 0, 0, 0, 0, 0, 0
                )
                print("🔑 ARM envoyé au FC")

            elif command == "disarm":
                self.master.mav.rc_channels_override_send(
                    target_system, target_component,
                    1500, 1500, 1500, 1000,
                    1500, 1500, 1500, 1500
                )
                time.sleep(0.3)
                self.master.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
                print("🔐 DISARM envoyé au FC")

            elif command == "takeoff":
                alt = params.get("altitude", 100)
                self.master.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
                    0, 0, 0, 0, 0, 0, 0, alt
                )
                print(f"🚀 TAKEOFF {alt}m envoyé")

            elif command == "land":
                self.master.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_NAV_LAND,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
                print("🛬 LAND envoyé")

            elif command == "rtl":
                self.master.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_NAV_RETURN_TO_LAUNCH,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
                print("🏠 RTL envoyé")

            else:
                print(f"⚠️ Commande inconnue: {command}")
                return False

            return True

        except Exception as e:
            print(f"❌ Erreur envoi commande: {e}")
            return False

    def get_armed_status(self) -> bool:
        return self._armed_status

    def disconnect(self):
        self._running = False
        self.is_connected = False
        if self.master:
            try:
                self.master.close()
            except:
                pass
            self.master = None
        print("🔌 MAVLink déconnecté")


# ─────────────────────────────────────────────────────────────
#  GLOBAL MAVLINK MANAGER
# ─────────────────────────────────────────────────────────────
mavlink_manager = MavlinkManager()

# ─────────────────────────────────────────────────────────────
#  SERIALIZER
# ─────────────────────────────────────────────────────────────
def serialize(obj) -> dict:
    result = {}
    for k, v in obj.__dict__.items():
        if k.startswith("_"):
            continue
        if isinstance(v, datetime):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result


# ─────────────────────────────────────────────────────────────
#  DB SEED
# ─────────────────────────────────────────────────────────────
MOCK_DRONES = [
    {"id":"DRONE-001","name":"Diambar",  "model":"DJI Matrice 300 RTK",     "status":"flying",     "latitude":15.5527,"longitude":-13.6729,"altitude":120.0,"battery":78.0, "heading":45, "speed":18.5,"home_lat":15.52,"home_lng":-13.71, "armed": False},
    {"id":"DRONE-002","name":"Ndobine",  "model":"Parrot ANAFI USA",         "status":"flying",     "latitude":14.7645,"longitude":-17.3660,"altitude":95.0, "battery":54.0, "heading":180,"speed":22.1,"home_lat":14.80,"home_lng":-17.40, "armed": False},
    {"id":"DRONE-003","name":"Vautour",  "model":"Wingtra One Gen II",       "status":"charging",   "latitude":12.35,  "longitude":-16.265, "altitude":0.0,  "battery":23.0, "heading":0,  "speed":0,  "home_lat":12.35,"home_lng":-16.27, "armed": False},
    {"id":"DRONE-004","name":"Delta",    "model":"DJI Matrice 300 RTK",     "status":"idle",       "latitude":13.4531,"longitude":-15.3675,"altitude":0.0,  "battery":91.0, "heading":270,"speed":0,  "home_lat":13.40,"home_lng":-15.40, "armed": False},
    {"id":"DRONE-005","name":"Gainde",   "model":"Autel EVO II Enterprise",  "status":"maintenance","latitude":16.05,  "longitude":-12.80,  "altitude":0.0,  "battery":100.0,"heading":0,  "speed":0,  "home_lat":16.05,"home_lng":-12.80, "armed": False},
]

MOCK_ALERTS = [
    {"level":"red",   "type":"intrusion","description":"Franchissement frontière — 8 individus armés",        "latitude":15.55,"longitude":-13.67,"confidence":0.92,"drone_id":"DRONE-001","drone_name":"Diambar"},
    {"level":"orange","type":"vehicle",  "description":"Pick-up 4x4 traversant la frontière hors poste",      "latitude":14.76,"longitude":-17.36,"confidence":0.85,"drone_id":"DRONE-002","drone_name":"Ndobine"},
    {"level":"yellow","type":"group",    "description":"Attroupement suspect de 15 personnes en zone tampon", "latitude":12.35,"longitude":-16.26,"confidence":0.78,"drone_id":"DRONE-003","drone_name":"Vautour"},
    {"level":"orange","type":"anomaly",  "description":"Mouvement nocturne furtif — comportement évasif",     "latitude":13.45,"longitude":-15.37,"confidence":0.81,"drone_id":"DRONE-004","drone_name":"Delta"},
]

DEFAULT_PARAMS = [
    ("SYSID_THISMAV",  "1",    "INT32",  "System ID du drone"),
    ("SYSID_MYGCS",    "255",  "INT32",  "ID de la station sol"),
    ("ARMING_CHECK",   "1",    "INT32",  "Vérification avant armement"),
    ("RTL_ALT",        "1500", "INT32",  "Altitude de retour RTL (cm)"),
    ("RTL_SPEED",      "10",   "FLOAT",  "Vitesse de retour RTL (m/s)"),
    ("WP_RADIUS",      "5",    "FLOAT",  "Rayon waypoint (m)"),
    ("WP_SPEED",       "15",   "FLOAT",  "Vitesse de croisière mission (m/s)"),
]

async def seed_db():
    db = SessionLocal()
    try:
        if db.query(BaseStationDB).count() == 0:
            db.add(BaseStationDB(name="Base Principale", latitude=DEFAULT_LAT, longitude=DEFAULT_LNG))
            db.commit()

        if db.query(DroneDB).count() == 0:
            for d in MOCK_DRONES:
                db.add(DroneDB(**d))
            db.commit()

        if db.query(DroneDB).filter(DroneDB.id == "USB-DRONE").count() == 0:
            db.add(DroneDB(
                id="USB-DRONE",
                name="Drone Réel (USB)",
                model="Pixhawk — USB Direct",
                status="idle",
                latitude=DEFAULT_LAT,
                longitude=DEFAULT_LNG,
                altitude=0,
                battery=100,
                armed=False
            ))
            db.commit()
            print("✅ Drone USB créé")

        if db.query(DroneParamDB).count() == 0:
            for drone in db.query(DroneDB).all():
                for name, val, typ, desc in DEFAULT_PARAMS:
                    db.add(DroneParamDB(
                        drone_id=drone.id,
                        param_name=name,
                        param_value=val,
                        param_type=typ,
                        description=desc
                    ))
            db.commit()

        if db.query(AlertDB).count() == 0:
            now = datetime.utcnow()
            for i, a in enumerate(MOCK_ALERTS):
                db.add(AlertDB(
                    id=str(uuid.uuid4()),
                    timestamp=now - timedelta(minutes=i*5),
                    status="active",
                    **a
                ))
            db.commit()

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────
#  SIMULATEUR
# ─────────────────────────────────────────────────────────────
class DroneSimulator:
    def __init__(self, mgr: ConnectionManager):
        self.mgr = mgr
        self._tick = 0
        self._armed_status = {}

    async def run(self):
        for _ in range(10):
            try:
                db = SessionLocal()
                db.query(DroneDB).first()
                db.close()
                break
            except Exception:
                await asyncio.sleep(0.5)

        while True:
            await asyncio.sleep(0.5)
            self._tick += 1
            await self._step()
            if self._tick % 60 == 0:
                await self._maybe_alert()

    async def _step(self):
        db = SessionLocal()
        try:
            drones = db.query(DroneDB).all()
            updates = []
            for drone in drones:
                if drone.id == "USB-DRONE":
                    if mavlink_manager.is_connected:
                        tel = mavlink_manager.telemetry
                        drone.latitude = tel["latitude"]
                        drone.longitude = tel["longitude"]
                        drone.altitude = tel["altitude"]
                        drone.speed = tel["speed"]
                        drone.heading = tel["heading"]
                        drone.battery = tel["battery"]
                        real_armed = mavlink_manager.get_armed_status()
                        drone.armed = real_armed
                    armed = drone.armed
                else:
                    self._update_drone(drone, db)
                    armed = self._armed_status.get(drone.id, False)
                    drone.armed = armed

                updates.append({
                    "id": drone.id,
                    "latitude": round(drone.latitude, 6),
                    "longitude": round(drone.longitude, 6),
                    "altitude": round(drone.altitude, 1),
                    "speed": round(drone.speed, 1),
                    "heading": round(drone.heading, 1),
                    "battery": round(drone.battery, 2),
                    "signal_strength": drone.signal_strength,
                    "temperature": round(drone.temperature, 1),
                    "flight_time": drone.flight_time,
                    "status": drone.status,
                    "active_mission_id": drone.active_mission_id,
                    "active_waypoint_idx": drone.active_waypoint_idx,
                    "camera_active": drone.camera_active,
                    "ai_active": drone.ai_active,
                    "armed": armed,
                })

                if self._tick % 10 == 0:
                    db.add(TelemetryDB(
                        drone_id=drone.id,
                        latitude=drone.latitude, longitude=drone.longitude,
                        altitude=drone.altitude, speed=drone.speed,
                        heading=drone.heading, battery=drone.battery,
                        armed=armed,
                    ))

            db.commit()
            await self.mgr.broadcast({
                "type": "telemetry",
                "drones": updates,
                "timestamp": datetime.utcnow().isoformat()
            })
        except Exception as e:
            print(f"[SIM] Erreur step: {e}")
        finally:
            db.close()

    def _update_drone(self, drone: DroneDB, db: Session):
        dt = 0.5
        if drone.status == "flying":
            drone.flight_time += int(dt)
            drone.temperature = max(30, min(55, drone.temperature + random.uniform(-0.2, 0.3)))
            drone.signal_strength = max(40, min(100, drone.signal_strength + random.randint(-1, 1)))
            drone.battery = max(0, drone.battery - 0.004)

            if drone.active_mission_id:
                mission = db.query(MissionDB).filter(MissionDB.id == drone.active_mission_id).first()
                if mission and mission.waypoints and mission.status == "active":
                    wps = mission.waypoints
                    idx = drone.active_waypoint_idx or 0
                    if idx < len(wps):
                        wp = wps[idx]
                        target_lat = wp["lat"]
                        target_lng = wp["lng"]
                        target_alt = wp.get("alt", mission.altitude)
                        wp_speed = mission.speed

                        dlat = target_lat - drone.latitude
                        dlng = target_lng - drone.longitude
                        dist_deg = math.sqrt(dlat**2 + dlng**2)
                        dist_m = dist_deg * 111320

                        drone.heading = math.degrees(math.atan2(dlng, dlat)) % 360
                        drone.speed = wp_speed

                        move = wp_speed * dt / 111320
                        if dist_m <= wp_speed * dt * 2:
                            drone.latitude = target_lat
                            drone.longitude = target_lng
                            drone.altitude = target_alt
                            drone.active_waypoint_idx = idx + 1
                            if idx + 1 >= len(wps):
                                drone.active_mission_id = None
                                drone.active_waypoint_idx = 0
                                mission.status = "completed"
                                drone.status = "returning"
                                self._armed_status[drone.id] = True
                        else:
                            drone.latitude += (dlat / dist_deg) * move
                            drone.longitude += (dlng / dist_deg) * move
                            dalt = target_alt - drone.altitude
                            drone.altitude += dalt * 0.1
                    else:
                        drone.active_mission_id = None
                        drone.active_waypoint_idx = 0
                        mission.status = "completed"
                        drone.status = "returning"
                else:
                    drone.heading = (drone.heading + random.uniform(-5, 5)) % 360
                    drone.speed = max(8, min(25, drone.speed + random.uniform(-1, 1)))
                    rad = math.radians(drone.heading)
                    move = drone.speed * dt / 111320
                    drone.latitude = max(12.0, min(16.7, drone.latitude + move * math.cos(rad)))
                    drone.longitude = max(-17.6, min(-11.4, drone.longitude + move * math.sin(rad)))
                    drone.altitude = max(50, min(200, drone.altitude + random.uniform(-2, 2)))
            else:
                drone.heading = (drone.heading + random.uniform(-5, 5)) % 360
                drone.speed = max(8, min(25, drone.speed + random.uniform(-1, 1)))
                rad = math.radians(drone.heading)
                move = drone.speed * dt / 111320
                drone.latitude = max(12.0, min(16.7, drone.latitude + move * math.cos(rad)))
                drone.longitude = max(-17.6, min(-11.4, drone.longitude + move * math.sin(rad)))
                drone.altitude = max(50, min(200, drone.altitude + random.uniform(-2, 2)))

            drone.total_distance += drone.speed * dt / 1000
            if drone.battery < 10:
                drone.status = "returning"

        elif drone.status == "returning":
            dlat = drone.home_lat - drone.latitude
            dlng = drone.home_lng - drone.longitude
            dist = math.sqrt(dlat**2 + dlng**2)
            if dist < 0.0005:
                drone.status = "charging"
                drone.speed = 0
                drone.altitude = 0
                drone.active_mission_id = None
                drone.active_waypoint_idx = 0
                self._armed_status[drone.id] = False
            else:
                drone.heading = math.degrees(math.atan2(dlng, dlat)) % 360
                drone.speed = 15.0
                move = drone.speed * dt / 111320
                drone.latitude += (dlat / dist) * move
                drone.longitude += (dlng / dist) * move
                drone.altitude = max(0, drone.altitude - 1)
                drone.battery = max(0, drone.battery - 0.003)

        elif drone.status == "charging":
            drone.speed = 0
            drone.altitude = 0
            drone.battery = min(100, drone.battery + 0.05)
            if drone.battery >= 95:
                drone.status = "idle"
                self._armed_status[drone.id] = False

        elif drone.status == "idle":
            drone.speed = 0
            drone.battery = min(100, drone.battery + 0.01)

        drone.last_seen = datetime.utcnow()

    async def _maybe_alert(self):
        db = SessionLocal()
        try:
            flying = db.query(DroneDB).filter(DroneDB.status == "flying").all()
            if not flying:
                return
            drone = random.choice(flying)
            lvl, typ, desc = random.choice(ALERT_TEMPLATES)
            aid = str(uuid.uuid4())
            alert = AlertDB(
                id=aid, drone_id=drone.id, drone_name=drone.name,
                level=lvl, type=typ, description=desc,
                latitude=round(drone.latitude + random.uniform(-0.02, 0.02), 5),
                longitude=round(drone.longitude + random.uniform(-0.02, 0.02), 5),
                confidence=round(random.uniform(0.70, 0.97), 2),
                timestamp=datetime.utcnow(), status="active",
            )
            db.add(alert)
            drone.detections_today += 1
            db.commit()
            await self.mgr.broadcast({
                "type": "new_alert",
                "alert": serialize(alert)
            })
        except Exception as e:
            print(f"[SIM] Alerte error: {e}")
        finally:
            db.close()


# ─────────────────────────────────────────────────────────────
#  APP SETUP
# ─────────────────────────────────────────────────────────────
simulator = DroneSimulator(manager)

async def _armed_ack_callback(armed: bool):
    print(f"⚡ ARMED_ACK callback → armed={armed}")
    db = SessionLocal()
    try:
        drone = db.query(DroneDB).filter(DroneDB.id == "USB-DRONE").first()
        if drone:
            drone.armed = armed
            drone.status = "flying" if armed else "idle"
            db.commit()
    except Exception as e:
        print(f"[ACK_CB] Erreur DB: {e}")
    finally:
        db.close()

    await manager.broadcast({
        "type": "armed_ack",
        "drone_id": "USB-DRONE",
        "armed": armed,
        "timestamp": datetime.utcnow().isoformat()
    })

# ─────────────────────────────────────────────────────────────
#  COMMANDE DIRECTE VERS LE JETSON VIA WEBSOCKET
# ─────────────────────────────────────────────────────────────
JETSON_WS_URL = "ws://100.97.206.1:8766"
async def send_command_to_jetson(command: str, params: dict = None) -> bool:
    """Envoie une commande directement au Jetson via WebSocket"""
    import traceback
    try:
        import websockets
        params = params or {}
        cmd_msg = json.dumps({"command": command, "params": params})
        
        print(f"📤 Connexion au Jetson: {JETSON_WS_URL}")
        
        # Ajouter un timeout
        async with websockets.connect(
            JETSON_WS_URL, 
            ping_interval=20, 
            ping_timeout=30,
            close_timeout=10,
            max_size=2**20
        ) as websocket:
            print(f"✅ Connecté au Jetson, envoi: {command}")
            await websocket.send(cmd_msg)
            print(f"✅ Commande envoyée: {command}")
            
            # Attendre une réponse (timeout 5s)
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📥 Réponse du Jetson: {response[:100]}")
            except asyncio.TimeoutError:
                print("⏳ Pas de réponse du Jetson (timeout)")
            
            return True
    except Exception as e:
        print(f"❌ Erreur envoi au Jetson: {type(e).__name__}: {e}")
        print(f"📋 Détails: {traceback.format_exc()}")
        return False

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    await seed_db()

    def sync_armed_ack(armed: bool):
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(_armed_ack_callback(armed), loop)

    mavlink_manager.set_armed_ack_callback(sync_armed_ack)

    asyncio.create_task(simulator.run())
    yield
    mavlink_manager.disconnect()


app = FastAPI(title="Drone C2 API", version="2.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
     allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not creds:
        return {"sub": "admin", "role": "admin", "name": "Commandant Diallo"}
    payload = verify_token(creds.credentials)
    if not payload:
        return {"sub": "admin", "role": "admin", "name": "Commandant Diallo"}
    return payload


# ─────────────────────────────────────────────────────────────
#  AUTH ROUTES
# ─────────────────────────────────────────────────────────────
@app.post("/api/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    user = USERS.get(req.username)
    if not user or user["password"] != req.password:
        raise HTTPException(401, "Identifiants incorrects")
    token = create_token({"sub": req.username, "role": user["role"], "name": user["name"]})
    return LoginResponse(
        access_token=token, token_type="bearer",
        user=UserInfo(username=req.username, role=user["role"], name=user["name"])
    )

@app.get("/api/auth/me")
async def me(user=Depends(get_user)):
    return user

# ─────────────────────────────────────────────────────────────
#  WEBSOCKET PROXY JETSON (pour le frontend)
# ─────────────────────────────────────────────────────────────
@app.websocket("/ws/jetson")
async def websocket_jetson(ws: WebSocket):
    await ws.accept()
    print("🔗 Client connecté au proxy Jetson")
    
    import websockets
    import asyncio
    
    JETSON_WS = "ws://100.97.206.1:8765"
    
    try:
        async with websockets.connect(JETSON_WS) as jetson:
            print(f"✅ Connecté au Jetson sur {JETSON_WS}")
            
            async def forward_to_jetson():
                while True:
                    msg = await ws.receive_text()
                    await jetson.send(msg)
                    response = await jetson.recv()
                    await ws.send_text(response)
            
            async def forward_to_client():
                while True:
                    msg = await jetson.recv()
                    await ws.send_text(msg)
            
            await asyncio.gather(
                forward_to_jetson(),
                forward_to_client()
            )
    except Exception as e:
        print(f"❌ Erreur: {e}")
        await ws.close()

        @app.get("/api/test/jetson")
async def test_jetson_connection():
    """Teste la connexion au Jetson"""
    import websockets
    try:
        async with websockets.connect(
            JETSON_WS_URL,
            ping_interval=10,
            ping_timeout=10,
            close_timeout=5
        ) as ws:
            await ws.send(json.dumps({"command": "ping"}))
            response = await asyncio.wait_for(ws.recv(), timeout=5.0)
            return {
                "status": "connected",
                "url": JETSON_WS_URL,
                "response": response
            }
    except Exception as e:
        return {
            "status": "error",
            "url": JETSON_WS_URL,
            "error": str(e),
            "error_type": type(e).__name__
        }
import asyncio
import websockets

async def test_jetson_connection():
    """Teste la connexion au Jetson"""
    try:
        async with websockets.connect("ws://100.97.206.1:8765", timeout=5) as ws:
            await ws.send(json.dumps({"command": "ping"}))
            response = await ws.recv()
            print(f"✅ Jetson répond: {response}")
            return True
    except Exception as e:
        print(f"❌ Jetson inaccessible: {e}")
        return False
# ─────────────────────────────────────────────────────────────
#  MAVLINK CONNECTION ROUTES
# ─────────────────────────────────────────────────────────────
@app.post("/api/mavlink/connect")
async def mavlink_connect(conn: MavlinkConnection, user=Depends(get_user)):
    if conn.type == "usb":
        if not conn.port:
            ports = serial.tools.list_ports.comports()
            for p in ports:
                if "USB" in p.description or "Serial" in p.description:
                    conn.port = p.device
                    break
            if not conn.port:
                raise HTTPException(400, "Aucun port USB trouvé")
        success = mavlink_manager.connect_usb(conn.port, conn.baudrate)
    elif conn.type in ["rpi", "jetson"]:
        if not conn.url:
            raise HTTPException(400, "URL WebSocket requise")
        print(f"🔌 Tentative de connexion WebSocket à {conn.url}")
        success = mavlink_manager.connect_rpi(conn.url)
    else:
        raise HTTPException(400, "Type de connexion invalide")

    if not success:
        raise HTTPException(500, "Échec de connexion MAVLink")

    return {"status": "connected", "type": conn.type}

@app.post("/api/mavlink/disconnect")
async def mavlink_disconnect(user=Depends(get_user)):
    mavlink_manager.disconnect()
    return {"status": "disconnected"}

@app.get("/api/mavlink/status")
async def mavlink_status(user=Depends(get_user)):
    return {
        "connected": mavlink_manager.is_connected,
        "type": mavlink_manager.connection_type,
        "telemetry": mavlink_manager.telemetry,
        "armed": mavlink_manager.get_armed_status()
    }


# ─────────────────────────────────────────────────────────────
#  BASE STATION ROUTES
# ─────────────────────────────────────────────────────────────
@app.get("/api/base")
async def get_base(db: Session = Depends(get_db), user=Depends(get_user)):
    base = db.query(BaseStationDB).first()
    if not base:
        base = BaseStationDB()
        db.add(base)
        db.commit()
    return serialize(base)

@app.patch("/api/base")
async def update_base(body: BaseStationUpdate, db: Session = Depends(get_db), user=Depends(get_user)):
    base = db.query(BaseStationDB).first()
    if not base:
        base = BaseStationDB()
        db.add(base)
    if body.name is not None:
        base.name = body.name
    if body.latitude is not None:
        base.latitude = body.latitude
    if body.longitude is not None:
        base.longitude = body.longitude
    db.commit()
    return serialize(base)


# ─────────────────────────────────────────────────────────────
#  DRONE ROUTES
# ─────────────────────────────────────────────────────────────
@app.get("/api/drones")
async def get_drones(db: Session = Depends(get_db), user=Depends(get_user)):
    return [serialize(d) for d in db.query(DroneDB).all()]

@app.get("/api/drones/{drone_id}")
async def get_drone(drone_id: str, db: Session = Depends(get_db), user=Depends(get_user)):
    drone = db.query(DroneDB).filter(DroneDB.id == drone_id).first()
    if not drone:
        raise HTTPException(404, "Drone introuvable")
    return serialize(drone)

@app.post("/api/drones")
async def create_drone(body: DroneCreate, db: Session = Depends(get_db), user=Depends(get_user)):
    if db.query(DroneDB).filter(DroneDB.id == body.id).first():
        raise HTTPException(400, "Drone déjà existant")
    drone = DroneDB(**body.dict())
    db.add(drone)
    db.commit()
    return serialize(drone)

@app.patch("/api/drones/{drone_id}")
async def update_drone(drone_id: str, body: dict, db: Session = Depends(get_db), user=Depends(get_user)):
    drone = db.query(DroneDB).filter(DroneDB.id == drone_id).first()
    if not drone:
        raise HTTPException(404, "Drone introuvable")
    for field in ("name", "model"):
        if field in body:
            setattr(drone, field, body[field])
    db.commit()
    return serialize(drone)

@app.patch("/api/drones/{drone_id}/armed")
async def update_drone_armed(drone_id: str, body: ArmedUpdate,
                              db: Session = Depends(get_db), user=Depends(get_user)):
    drone = db.query(DroneDB).filter(DroneDB.id == drone_id).first()
    if not drone:
        raise HTTPException(404, "Drone introuvable")
    drone.armed = body.armed
    if drone_id == "USB-DRONE":
        drone.status = "flying" if body.armed else "idle"
    db.commit()
    await manager.broadcast({
        "type": "armed_sync",
        "drone_id": drone_id,
        "armed": body.armed,
        "timestamp": datetime.utcnow().isoformat()
    })
    return {"status": "ok", "armed": body.armed}


# ─────────────────────────────────────────────────────────────
#  COMMAND ROUTES
# ─────────────────────────────────────────────────────────────
@app.post("/api/drones/{drone_id}/command")
async def send_command(drone_id: str, cmd: DroneCommand,
                       db: Session = Depends(get_db), user=Depends(get_user)):
    drone = db.query(DroneDB).filter(DroneDB.id == drone_id).first()
    if not drone:
        raise HTTPException(404, "Drone introuvable")

    print(f"📤 Commande reçue: {cmd.action} pour {drone_id}")

    db.add(CommandLogDB(
        id=str(uuid.uuid4()),
        drone_id=drone_id,
        command=cmd.action,
        params=cmd.params,
        sent_by=user.get("name", "system"),
        timestamp=datetime.utcnow(),
        status="sent"
    ))

    # Si c'est le drone USB, envoyer directement au Jetson via WebSocket
    if drone_id == "USB-DRONE":
        success = await send_command_to_jetson(cmd.action, cmd.params)
        if not success:
            raise HTTPException(500, "Échec de la commande via WebSocket")
        
        # Mettre à jour l'état local
        if cmd.action == "takeoff":
            drone.status = "flying"
            drone.altitude = cmd.params.get("altitude", 100)
        elif cmd.action == "land":
            drone.status = "landing"
        elif cmd.action == "rtl":
            drone.status = "returning"
        elif cmd.action == "arm":
            drone.armed = True
            drone.status = "flying"
        elif cmd.action == "disarm":
            drone.armed = False
            drone.status = "idle"
        elif cmd.action == "emergency":
            drone.status = "returning"
        db.commit()

        await manager.broadcast({
            "type": "command_ack",
            "drone_id": drone_id,
            "command": cmd.action,
            "status": "sent_to_fc",
            "timestamp": datetime.utcnow().isoformat()
        })

        return {
            "status": "ok",
            "message": f"Commande {cmd.action} envoyée au FC via WebSocket",
            "drone": serialize(drone),
            "armed": drone.armed
        }

    else:
        # Simulateur pour les autres drones
        if cmd.action == "takeoff":
            drone.status = "flying"
            drone.altitude = cmd.params.get("altitude", 100)
            simulator._armed_status[drone_id] = True
            drone.armed = True
        elif cmd.action == "land":
            drone.status = "landing"
        elif cmd.action == "rtl":
            drone.status = "returning"
        elif cmd.action == "arm":
            drone.armed = True
            simulator._armed_status[drone_id] = True
        elif cmd.action == "disarm":
            drone.armed = False
            simulator._armed_status[drone_id] = False
        elif cmd.action == "emergency":
            drone.status = "returning"
        db.commit()
        return {"status": "ok", "message": f"Commande {cmd.action} simulée", "drone": serialize(drone)}

@app.post("/api/drones/{drone_id}/command/text")
async def text_command(drone_id: str, body: TextCommand,
                       db: Session = Depends(get_db), user=Depends(get_user)):
    drone = db.query(DroneDB).filter(DroneDB.id == drone_id).first()
    if not drone:
        raise HTTPException(404, "Drone introuvable")

    cmd_text = body.command.strip().lower()
    parts = cmd_text.split()
    action = parts[0] if parts else ""

    if action == "takeoff":
        alt = float(parts[1]) if len(parts) > 1 else 100.0
        result = f"Décollage vers {alt}m"
        params = {"altitude": alt}
    elif action in ("land", "atterrir"):
        result = "Atterrissage initié"
        action = "land"
        params = {}
    elif action == "rtl":
        result = "Retour base initié"
        params = {}
    elif action in ("hover", "loiter"):
        result = "Mode stationnaire activé"
        action = "hover"
        params = {}
    elif action == "arm":
        result = "Drone armé"
        params = {}
    elif action == "disarm":
        result = "Drone désarmé"
        params = {}
    else:
        result = f"Commande '{body.command}' reçue"
        params = {}

    await send_command(drone_id, DroneCommand(action=action, params=params), db, user)
    return {"response": result, "command": body.command}


# ─────────────────────────────────────────────────────────────
#  MISSION ROUTES
# ─────────────────────────────────────────────────────────────
@app.post("/api/drones/{drone_id}/mission")
async def set_mission(drone_id: str, mission: MissionPlan,
                      db: Session = Depends(get_db), user=Depends(get_user)):
    drone = db.query(DroneDB).filter(DroneDB.id == drone_id).first()
    if not drone:
        raise HTTPException(404, "Drone introuvable")
    if not mission.waypoints:
        raise HTTPException(400, "La mission doit avoir au moins un waypoint")

    mid = str(uuid.uuid4())
    new_m = MissionDB(
        id=mid, drone_id=drone_id,
        name=mission.name, type=mission.type,
        waypoints=[w.dict() for w in mission.waypoints],
        speed=mission.speed, altitude=mission.altitude,
        camera_mode=mission.camera_mode,
        ai_detection=mission.ai_detection,
        return_on_low_battery=mission.return_on_low_battery,
        status="active",
        created_at=datetime.utcnow(),
        created_by=user.get("name", "system")
    )
    db.add(new_m)

    drone.active_mission_id = mid
    drone.active_waypoint_idx = 0
    drone.status = "flying"
    drone.camera_active = (mission.camera_mode != "off")
    drone.ai_active = mission.ai_detection

    if drone_id != "USB-DRONE":
        simulator._armed_status[drone_id] = True
        drone.armed = True

    db.commit()
    await manager.broadcast({
        "type": "mission_started",
        "drone_id": drone_id,
        "mission_id": mid,
        "mission_name": mission.name,
        "waypoints": [w.dict() for w in mission.waypoints],
        "timestamp": datetime.utcnow().isoformat()
    })
    return {"status": "ok", "mission_id": mid, "drone": serialize(drone)}

@app.get("/api/missions")
async def get_missions(db: Session = Depends(get_db), user=Depends(get_user)):
    return [serialize(m) for m in db.query(MissionDB).order_by(desc(MissionDB.created_at)).all()]

@app.get("/api/drones/{drone_id}/missions")
async def get_drone_missions(drone_id: str, db: Session = Depends(get_db), user=Depends(get_user)):
    return [serialize(m) for m in db.query(MissionDB).filter(
        MissionDB.drone_id == drone_id).order_by(desc(MissionDB.created_at)).all()]

@app.delete("/api/missions/{mission_id}")
async def cancel_mission(mission_id: str, db: Session = Depends(get_db), user=Depends(get_user)):
    m = db.query(MissionDB).filter(MissionDB.id == mission_id).first()
    if not m:
        raise HTTPException(404, "Mission introuvable")
    m.status = "cancelled"
    drone = db.query(DroneDB).filter(DroneDB.active_mission_id == mission_id).first()
    if drone:
        drone.active_mission_id = None
        drone.active_waypoint_idx = 0
        drone.status = "returning"
        if drone.id != "USB-DRONE":
            simulator._armed_status[drone.id] = True
    db.commit()
    await manager.broadcast({"type": "mission_cancelled", "mission_id": mission_id})
    return {"status": "cancelled"}


# ─────────────────────────────────────────────────────────────
#  ALERT ROUTES
# ─────────────────────────────────────────────────────────────
@app.get("/api/alerts")
async def get_alerts(level: Optional[str] = None, status: Optional[str] = None,
                     limit: int = 50, db: Session = Depends(get_db), user=Depends(get_user)):
    q = db.query(AlertDB)
    if level:
        q = q.filter(AlertDB.level == level)
    if status:
        q = q.filter(AlertDB.status == status)
    return [serialize(a) for a in q.order_by(desc(AlertDB.timestamp)).limit(limit).all()]

@app.patch("/api/alerts/{alert_id}")
async def update_alert(alert_id: str, body: AlertUpdate,
                       db: Session = Depends(get_db), user=Depends(get_user)):
    alert = db.query(AlertDB).filter(AlertDB.id == alert_id).first()
    if not alert:
        raise HTTPException(404, "Alerte introuvable")
    if body.status:
        alert.status = body.status
    if body.notes:
        alert.notes = body.notes
    alert.acknowledged_by = user.get("name")
    alert.acknowledged_at = datetime.utcnow()
    db.commit()
    await manager.broadcast({"type": "alert_updated", "alert": serialize(alert)})
    return serialize(alert)


# ─────────────────────────────────────────────────────────────
#  TELEMETRY & STATS ROUTES
# ─────────────────────────────────────────────────────────────
@app.get("/api/telemetry/{drone_id}")
async def get_telemetry(drone_id: str, minutes: int = 30,
                        db: Session = Depends(get_db), user=Depends(get_user)):
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    records = (db.query(TelemetryDB)
               .filter(TelemetryDB.drone_id == drone_id,
                       TelemetryDB.timestamp >= cutoff)
               .order_by(TelemetryDB.timestamp).all())
    return [serialize(r) for r in records[-200:]]

@app.get("/api/trajectories/{drone_id}")
async def get_trajectory(drone_id: str, db: Session = Depends(get_db), user=Depends(get_user)):
    records = (db.query(TelemetryDB)
               .filter(TelemetryDB.drone_id == drone_id)
               .order_by(TelemetryDB.timestamp).all())
    return [{"lat": r.latitude, "lng": r.longitude, "alt": r.altitude,
             "time": r.timestamp.isoformat()} for r in records]

@app.get("/api/stats/dashboard")
async def dashboard_stats(db: Session = Depends(get_db), user=Depends(get_user)):
    drones = db.query(DroneDB).all()
    alerts = db.query(AlertDB).all()
    flying = sum(1 for d in drones if d.status == "flying")
    active_a = sum(1 for a in alerts if a.status == "active")
    red_a = sum(1 for a in alerts if a.level == "red" and a.status == "active")
    now = datetime.utcnow()
    hourly = [{"hour": (now - timedelta(hours=23-i)).strftime("%H:00"),
               "count": random.randint(0, 5)} for i in range(24)]
    return {
        "total_drones": len(drones),
        "active_drones": flying,
        "total_alerts_today": len(alerts),
        "active_alerts": active_a,
        "red_alerts": red_a,
        "detection_rate": round(random.uniform(91, 96), 1),
        "avg_response_time": round(random.uniform(1.2, 2.1), 1),
        "total_km_covered": round(sum(d.total_distance for d in drones), 1),
        "hourly_incidents": hourly,
        "alert_by_level": {
            "red": sum(1 for a in alerts if a.level == "red"),
            "orange": sum(1 for a in alerts if a.level == "orange"),
            "yellow": sum(1 for a in alerts if a.level == "yellow"),
            "green": sum(1 for a in alerts if a.level == "green"),
        }
    }


# ─────────────────────────────────────────────────────────────
#  LOG ROUTES
# ─────────────────────────────────────────────────────────────
@app.get("/api/logs")
async def get_logs(limit: int = 100, db: Session = Depends(get_db), user=Depends(get_user)):
    return [serialize(l) for l in
            db.query(CommandLogDB).order_by(desc(CommandLogDB.timestamp)).limit(limit).all()]


# ─────────────────────────────────────────────────────────────
#  MAVLINK PARAMS ROUTES
# ─────────────────────────────────────────────────────────────
@app.get("/api/drones/{drone_id}/params")
async def get_params(drone_id: str, db: Session = Depends(get_db), user=Depends(get_user)):
    params = db.query(DroneParamDB).filter(DroneParamDB.drone_id == drone_id).all()
    return [{"name": p.param_name, "value": p.param_value,
             "type": p.param_type, "description": p.description} for p in params]

@app.post("/api/drones/{drone_id}/param")
async def set_param(drone_id: str, body: ParamUpdate,
                    db: Session = Depends(get_db), user=Depends(get_user)):
    drone = db.query(DroneDB).filter(DroneDB.id == drone_id).first()
    if not drone:
        raise HTTPException(404, "Drone introuvable")
    p = db.query(DroneParamDB).filter(
        DroneParamDB.drone_id == drone_id,
        DroneParamDB.param_name == body.name
    ).first()
    if p:
        p.param_value = body.value
        p.param_type = body.param_type
    else:
        db.add(DroneParamDB(drone_id=drone_id, param_name=body.name,
                             param_value=body.value, param_type=body.param_type))
    db.commit()
    await manager.broadcast({"type": "param_updated", "drone_id": drone_id,
                              "param": body.name, "value": body.value})
    return {"status": "ok", "param": body.name, "value": body.value}

@app.post("/api/telemetry/update")
async def update_telemetry(data: dict):
    """Reçoit la télémétrie du bridge via HTTP POST"""
    telemetry = data.get("telemetry", {})
    msg_type = telemetry.get("type", "")
    
    print(f"📥 Télémétrie reçue: {msg_type}")
    
    # Mettre à jour la télémétrie en fonction du type de message
    if msg_type == "GLOBAL_POSITION_INT":
        lat = telemetry.get("latitude", 0)
        lon = telemetry.get("longitude", 0)
        alt = telemetry.get("altitude", 0)
        heading = telemetry.get("heading", 0)
        
        print(f"📍 GPS REÇU: lat={lat}, lon={lon}, alt={alt}")
        
        mavlink_manager.telemetry["latitude"] = lat
        mavlink_manager.telemetry["longitude"] = lon
        mavlink_manager.telemetry["altitude"] = alt
        mavlink_manager.telemetry["heading"] = heading
        mavlink_manager.is_connected = True
        
    elif msg_type == "VFR_HUD":
        speed = telemetry.get("speed", 0)
        heading = telemetry.get("heading", 0)
        altitude = telemetry.get("altitude", 0)
        
        mavlink_manager.telemetry["speed"] = speed
        mavlink_manager.telemetry["heading"] = heading
        if altitude > 0:
            mavlink_manager.telemetry["altitude"] = altitude
        print(f"📊 VFR_HUD: speed={speed}, heading={heading}")
        
    elif msg_type == "SYS_STATUS":
        battery = telemetry.get("battery", 0)
        voltage = telemetry.get("voltage", 0)
        mavlink_manager.telemetry["battery"] = battery if battery > 0 else 0
        print(f"🔋 Batterie: {mavlink_manager.telemetry['battery']}%")
        
    elif msg_type == "HEARTBEAT":
        mode = telemetry.get("mode", "STABILIZE")
        armed = telemetry.get("armed", False)
        
        mavlink_manager.telemetry["mode"] = mode
        mavlink_manager._armed_status = armed
        mavlink_manager.is_connected = True
        print(f"📥 HEARTBEAT: mode={mode}, armed={armed}")
    
    # Mettre à jour le drone USB dans la base de données
    db = SessionLocal()
    try:
        drone = db.query(DroneDB).filter(DroneDB.id == "USB-DRONE").first()
        if drone:
            drone.latitude = mavlink_manager.telemetry.get("latitude", 0)
            drone.longitude = mavlink_manager.telemetry.get("longitude", 0)
            drone.altitude = mavlink_manager.telemetry.get("altitude", 0)
            drone.speed = mavlink_manager.telemetry.get("speed", 0)
            drone.heading = mavlink_manager.telemetry.get("heading", 0)
            drone.battery = mavlink_manager.telemetry.get("battery", 0)
            drone.armed = mavlink_manager._armed_status
            drone.status = "flying" if mavlink_manager._armed_status else "idle"
            drone.gps_locked = mavlink_manager.telemetry.get("latitude", 0) != 0
            db.commit()
            print(f"✅ Drone USB mis à jour: lat={drone.latitude}, lon={drone.longitude}")
    except Exception as e:
        print(f"⚠️ Erreur DB: {e}")
    finally:
        db.close()
    
    # Diffuser au frontend via WebSocket
    await manager.broadcast({
        "type": "telemetry",
        "drones": [{
            "id": "USB-DRONE",
            "latitude": mavlink_manager.telemetry.get("latitude", 0),
            "longitude": mavlink_manager.telemetry.get("longitude", 0),
            "altitude": mavlink_manager.telemetry.get("altitude", 0),
            "speed": mavlink_manager.telemetry.get("speed", 0),
            "heading": mavlink_manager.telemetry.get("heading", 0),
            "battery": mavlink_manager.telemetry.get("battery", 0),
            "armed": mavlink_manager._armed_status,
            "status": "flying" if mavlink_manager._armed_status else "idle"
        }],
        "timestamp": datetime.utcnow().isoformat()
    })
    
    return {"status": "ok"}
# ─────────────────────────────────────────────────────────────
#  FLIGHTS & MAINTENANCE ROUTES
# ─────────────────────────────────────────────────────────────
@app.post("/api/drones/{drone_id}/start_mission")
async def start_mission_flight(drone_id: str, mission_name: str = "Mission",
                                db: Session = Depends(get_db), user=Depends(get_user)):
    drone = db.query(DroneDB).filter(DroneDB.id == drone_id).first()
    if not drone:
        raise HTTPException(404, "Drone introuvable")
    prev = db.query(DroneFlightDB).filter(DroneFlightDB.drone_id == drone_id,
                                           DroneFlightDB.end_time.is_(None)).first()
    if prev:
        prev.end_time = datetime.utcnow()
    flight = DroneFlightDB(drone_id=drone_id, start_time=datetime.utcnow(),
                            mission_name=mission_name, trajectory=[])
    db.add(flight)
    drone.status = "flying"
    if drone_id != "USB-DRONE":
        simulator._armed_status[drone_id] = True
        drone.armed = True
    db.commit()
    return {"status": "started", "flight_id": flight.id}

@app.post("/api/drones/{drone_id}/end_mission")
async def end_mission_flight(drone_id: str, db: Session = Depends(get_db), user=Depends(get_user)):
    flight = db.query(DroneFlightDB).filter(DroneFlightDB.drone_id == drone_id,
                                             DroneFlightDB.end_time.is_(None)).first()
    if not flight:
        raise HTTPException(404, "Aucun vol actif")
    flight.end_time = datetime.utcnow()
    drone = db.query(DroneDB).filter(DroneDB.id == drone_id).first()
    if drone:
        drone.status = "returning"
        if drone_id != "USB-DRONE":
            simulator._armed_status[drone_id] = True
    db.commit()
    return {"status": "ended", "flight_id": flight.id}

@app.get("/api/drones/{drone_id}/flights")
async def get_flights(drone_id: str, db: Session = Depends(get_db), user=Depends(get_user)):
    flights = db.query(DroneFlightDB).filter(
        DroneFlightDB.drone_id == drone_id).order_by(desc(DroneFlightDB.start_time)).all()
    return [{"id": f.id, "start": f.start_time, "end": f.end_time,
             "distance": f.distance_km, "mission": f.mission_name} for f in flights]

@app.post("/api/drones/{drone_id}/maintenance")
async def schedule_maint(drone_id: str, body: dict,
                          db: Session = Depends(get_db), user=Depends(get_user)):
    try:
        date = datetime.fromisoformat(body["date"])
    except Exception:
        raise HTTPException(400, "Date invalide (format: YYYY-MM-DD)")
    m = MaintenanceDB(drone_id=drone_id, scheduled_date=date,
                      description=body.get("description", "Maintenance périodique"))
    db.add(m)
    db.commit()
    return {"status": "scheduled", "id": m.id}

@app.get("/api/drones/{drone_id}/maintenances")
async def get_maintenances(drone_id: str, db: Session = Depends(get_db), user=Depends(get_user)):
    mts = db.query(MaintenanceDB).filter(
        MaintenanceDB.drone_id == drone_id).order_by(desc(MaintenanceDB.scheduled_date)).all()
    return [{"id": m.id, "date": m.scheduled_date, "desc": m.description,
             "status": m.status} for m in mts]


# ─────────────────────────────────────────────────────────────
#  WEBSOCKET
# ─────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        db = SessionLocal()
        drones = db.query(DroneDB).all()
        alerts = db.query(AlertDB).order_by(desc(AlertDB.timestamp)).limit(30).all()
        missions = db.query(MissionDB).filter(MissionDB.status == "active").all()
        db.close()

        # S'assurer que le drone USB est dans la liste
        usb_drone = next((d for d in drones if d.id == "USB-DRONE"), None)
        if usb_drone and mavlink_manager.is_connected:
            usb_drone.latitude = mavlink_manager.telemetry["latitude"]
            usb_drone.longitude = mavlink_manager.telemetry["longitude"]
            usb_drone.altitude = mavlink_manager.telemetry["altitude"]

        await manager.send_to(ws, {
            "type": "init",
            "drones": [serialize(d) for d in drones],
            "alerts": [serialize(a) for a in alerts],
            "missions": [serialize(m) for m in missions],
        })

        while True:
            await asyncio.sleep(0.5)
            if mavlink_manager.is_connected:
                tel = mavlink_manager.telemetry
                # Envoyer la télémétrie en temps réel
                await manager.broadcast({
                    "type": "telemetry",
                    "drones": [{
                        "id": "USB-DRONE",
                        "latitude": tel.get("latitude", 0),
                        "longitude": tel.get("longitude", 0),
                        "altitude": tel.get("altitude", 0),
                        "speed": tel.get("speed", 0),
                        "heading": tel.get("heading", 0),
                        "battery": tel.get("battery", 0),
                        "armed": mavlink_manager.get_armed_status(),
                        "status": "flying" if mavlink_manager.get_armed_status() else "idle"
                    }],
                    "timestamp": datetime.utcnow().isoformat()
                })

            try:
                data = await asyncio.wait_for(ws.receive_text(), timeout=0.5)
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await manager.send_to(ws, {"type": "pong", "timestamp": datetime.utcnow().isoformat()})
            except asyncio.TimeoutError:
                pass

    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception as e:
        print(f"[WS] Erreur: {e}")
        manager.disconnect(ws)

# ─────────────────────────────────────────────────────────────
#  HEALTH
# ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "Drone C2 API v2.1",
        "mavlink_connected": mavlink_manager.is_connected,
        "mavlink_armed": mavlink_manager.get_armed_status()
    }

# ─────────────────────────────────────────────────────────────
#  FRONTEND STATIC FILES
# ─────────────────────────────────────────────────────────────
from fastapi.staticfiles import StaticFiles
import os

# Chemin absolu vers le frontend dans le conteneur Docker
frontend_path = "/app/frontend/dist"

# Servir le frontend à la racine
if os.path.exists(frontend_path) and os.path.exists(os.path.join(frontend_path, "index.html")):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
    print(f"✅ Frontend servis depuis {frontend_path}")
else:
    # Fallback : servir le frontend depuis le dossier local
    local_frontend = os.path.join(os.path.dirname(__file__), "../frontend/dist")
    if os.path.exists(local_frontend) and os.path.exists(os.path.join(local_frontend, "index.html")):
        app.mount("/", StaticFiles(directory=local_frontend, html=True), name="frontend")
        print(f"✅ Frontend servis depuis {local_frontend}")
    else:
        print(f"❌ Frontend non trouvé ni dans {frontend_path} ni dans {local_frontend}")
        @app.get("/")
        async def root():
            return {"message": "Bienvenue sur JAMBAAR API", "docs": "/docs"}
        
        @app.get("/{path:path}")
        async def catch_all(path: str):
            return {"detail": "Frontend non disponible. API disponible sur /docs"}

# ─────────────────────────────────────────────────────────────
#  MAIN EXECUTION
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)