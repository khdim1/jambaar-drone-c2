import asyncio, json, random, math, uuid
from datetime import datetime, timedelta
from typing import Optional

class DroneSimulator:
    def __init__(self, manager):
        self.manager = manager
        self.running = True
        self._missions = {}

    async def run(self):
        tick = 0
        while self.running:
            await asyncio.sleep(0.5)
            tick += 1
            from database import db
            updates = []
            for drone in db.drones.values():
                self._update_drone(drone, tick)
                updates.append({
                    "id": drone.id,
                    "latitude": round(drone.latitude,6),
                    "longitude": round(drone.longitude,6),
                    "altitude": round(drone.altitude,1),
                    "speed": round(drone.speed,1),
                    "heading": round(drone.heading,1),
                    "battery": round(drone.battery,2),
                    "signal_strength": drone.signal_strength,
                    "temperature": round(drone.temperature,1),
                    "flight_time": drone.flight_time,
                    "status": drone.status,
                })
                if tick % 10 == 0:
                    db.telemetry.append({
                        "timestamp": datetime.utcnow().isoformat(),
                        "drone_id": drone.id,
                        "latitude": drone.latitude,
                        "longitude": drone.longitude,
                        "altitude": drone.altitude,
                        "speed": drone.speed,
                        "battery": drone.battery,
                        "temperature": drone.temperature,
                    })
                    if len(db.telemetry) > 5000:
                        db.telemetry = db.telemetry[-5000:]
            await self.manager.broadcast(json.dumps({
                "type": "telemetry",
                "timestamp": datetime.utcnow().isoformat(),
                "drones": updates,
            }))
            if tick % 60 == 0:
                await self._generate_alert(db)
            for drone in db.drones.values():
                if drone.battery < 15 and drone.status == "flying":
                    await self.manager.broadcast(json.dumps({
                        "type": "system_warning",
                        "drone_id": drone.id,
                        "level": "critical",
                        "message": f"BATTERIE CRITIQUE — {drone.name}: {drone.battery:.0f}%"
                    }))

    def _update_drone(self, drone, tick):
        if drone.status == "flying":
            dt = 0.5
            drone.flight_time += int(dt)
            drone.heading = (drone.heading + random.uniform(-3,3)) % 360
            drone.speed = max(8, min(25, drone.speed + random.uniform(-1,1)))
            rad = math.radians(drone.heading)
            dist = drone.speed * dt / 111320
            drone.latitude = max(12.0, min(16.7, drone.latitude + dist*math.cos(rad) + random.uniform(-0.00002,0.00002)))
            drone.longitude = max(-17.6, min(-11.4, drone.longitude + dist*math.sin(rad) + random.uniform(-0.00002,0.00002)))
            drone.altitude = max(50, min(200, drone.altitude + random.uniform(-2,2)))
            drone.battery = max(0, drone.battery - 0.004)
            drone.signal_strength = max(40, min(100, drone.signal_strength + random.randint(-2,2)))
            drone.temperature = max(30, min(55, drone.temperature + random.uniform(-0.3,0.3)))
            drone.total_distance += drone.speed * dt / 1000
            if drone.battery < 10:
                drone.status = "returning"
        elif drone.status == "returning":
            dlat = drone.home_lat - drone.latitude
            dlng = drone.home_lng - drone.longitude
            dist = math.sqrt(dlat**2 + dlng**2)
            if dist < 0.001:
                drone.status = "charging"
                drone.speed = 0
                drone.altitude = 0
            else:
                drone.heading = math.degrees(math.atan2(dlng, dlat)) % 360
                move = 18.0 * 0.5 / 111320
                drone.latitude += (dlat / dist) * move
                drone.longitude += (dlng / dist) * move
                drone.altitude = max(0, drone.altitude - 0.5)
                drone.battery = max(0, drone.battery - 0.003)
        elif drone.status == "charging":
            drone.speed = 0
            drone.altitude = 0
            drone.battery = min(100, drone.battery + 0.05)
            if drone.battery >= 95:
                drone.status = "idle"
        elif drone.status == "idle":
            drone.speed = 0
            drone.last_seen = datetime.utcnow()

    async def _generate_alert(self, db):
        flying = [d for d in db.drones.values() if d.status == "flying"]
        if not flying:
            return
        drone = random.choice(flying)
        levels = ["yellow","yellow","orange","orange","red"]
        types_map = {
            "yellow": [
                ("intrusion","Passage individuel isole detecte en zone frontiere"),
                ("anomaly","Activite inhabituelle — zone normalement deserte"),
                ("vehicle","Moto detectee sur piste non surveillee"),
                ("group","Groupe 5-8 individus — deplacement nocturne suspect"),
                ("vehicle","Vehicule 4x4 sans plaque franchissant la frontiere"),
                ("intrusion","Traversee non-autorisee detectee — confiance elevee"),
            ],
            "orange": [
                ("group","Attroupement suspect de 15 personnes zone tampon"),
                ("vehicle","Convoi 3 vehicules non identifies"),
                ("intrusion","Traversee nocturne 4 personnes infrarouge"),
                ("anomaly","Mouvement nocturne furtif detecte"),
            ],
            "red": [
                ("intrusion","Franchissement massif — 12+ individus detectes"),
                ("weapon","Objet metallique allonge detecte — possible arme"),
                ("vehicle","Convoi vehicules armes — alerte maximale"),
            ]
        }
        level = random.choice(levels)
        type_, desc = random.choice(types_map[level])
        aid = str(uuid.uuid4())
        from models import Alert
        alert = Alert(
            id=aid, drone_id=drone.id, drone_name=drone.name,
            level=level, type=type_, description=desc,
            latitude=round(drone.latitude + random.uniform(-0.01,0.01),6),
            longitude=round(drone.longitude + random.uniform(-0.01,0.01),6),
            confidence=round(random.uniform(0.70,0.97),2),
            timestamp=datetime.utcnow(), status="active"
        )
        db.alerts[aid] = alert
        drone.detections_today += 1
        await self.manager.broadcast(json.dumps({
            "type": "new_alert",
            "alert": {
                "id": alert.id, "drone_id": alert.drone_id, "drone_name": alert.drone_name,
                "level": alert.level, "type": alert.type, "description": alert.description,
                "latitude": alert.latitude, "longitude": alert.longitude,
                "confidence": alert.confidence,
                "timestamp": alert.timestamp.isoformat(), "status": alert.status,
            }
        }))

    def apply_command(self, drone_id: str, action: str, params: dict):
        from database import db
        drone = db.drones.get(drone_id)
        if not drone:
            return
        commands = {
            "takeoff": lambda: setattr(drone,"status","flying"),
            "land": lambda: setattr(drone,"status","returning"),
            "rtl": lambda: setattr(drone,"status","returning"),
            "hover": lambda: setattr(drone,"speed",0),
            "emergency": lambda: setattr(drone,"status","emergency"),
            "camera_on": lambda: setattr(drone,"camera_active",True),
            "camera_off": lambda: setattr(drone,"camera_active",False),
            "ai_on": lambda: setattr(drone,"ai_active",True),
            "ai_off": lambda: setattr(drone,"ai_active",False),
        }
        if action in commands:
            commands[action]()

    def set_mission(self, drone_id: str, mission):
        self._missions[drone_id] = mission