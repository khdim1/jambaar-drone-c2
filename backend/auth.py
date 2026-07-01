"""JWT Authentication — Drone C2"""
import jwt
from datetime import datetime, timedelta
from typing import Optional

SECRET_KEY = "drone-senegal-secret-2024-xk9mP!vQ"
ALGORITHM = "HS256"
EXPIRE_HOURS = 12

def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=EXPIRE_HOURS)
    payload["iat"] = datetime.utcnow()
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None