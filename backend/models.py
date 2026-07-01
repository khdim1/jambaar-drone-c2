# models.py
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class DroneStatusEnum(str, Enum):
    idle = "idle"
    flying = "flying"
    returning = "returning"
    charging = "charging"
    maintenance = "maintenance"
    emergency = "emergency"

class AlertLevel(str, Enum):
    red = "red"
    orange = "orange"
    yellow = "yellow"
    green = "green"

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
    id: Optional[str] = None
    drone_id: Optional[str] = None
    name: str
    type: str = "patrol"
    waypoints: List[Waypoint] = []
    speed: float = 15.0
    altitude: float = 120.0
    camera_mode: str = "video"
    ai_detection: bool = True
    return_on_low_battery: float = 20.0
    status: str = "pending"
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None

class DroneCommand(BaseModel):
    action: str
    params: Dict[str, Any] = {}

class AlertUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None