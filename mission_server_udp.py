#!/usr/bin/env python3
"""
Mission Upload Server pour JAMBAAR (version UDP)
Se connecte à MAVProxy via UDP (pas directement au port série)
"""

import json
import socket
import threading
from pymavlink import mavutil
import time

# ─── Configuration ────────────────────────────────────────────
MAVPROXY_UDP = "udp:127.0.0.1:14550"  # MAVProxy UDP endpoint
SERVER_PORT = 8766

# ─── Connexion MAVLink via UDP ───────────────────────────────
master = mavutil.mavlink_connection(MAVPROXY_UDP)
master.wait_heartbeat()
print(f"✅ Connecté à MAVProxy sur {MAVPROXY_UDP}")

def upload_mission(waypoints):
    target_system = 1
    target_component = 1
    count = len(waypoints)

    print(f"📤 Upload de {count} waypoints...")

    # 1. Clear mission
    master.mav.mission_clear_all_send(target_system, target_component)
    time.sleep(0.5)

    # 2. MISSION_COUNT
    master.mav.mission_count_send(target_system, target_component, count)
    time.sleep(0.5)

    # 3. Envoyer les items
    for i in range(count):
        # Attendre la requête
        msg = master.recv_match(type=['MISSION_REQUEST', 'MISSION_REQUEST_INT'], blocking=True, timeout=10)
        if not msg:
            print(f"❌ Timeout pour la requête séquence {i}")
            return False

        wp = waypoints[i]
        command = 19 if wp.get('loiter_time', 0) > 0 else 16
        param1 = wp.get('loiter_time', 0)
        param2 = 0
        param3 = 0
        param4 = 0
        x = int(wp['lat'] * 1e7)
        y = int(wp['lng'] * 1e7)
        z = wp['alt']

        master.mav.mission_item_int_send(
            target_system, target_component,
            i, 0, command, 0, 1,
            param1, param2, param3, param4,
            x, y, z
        )
        print(f"  ✅ Waypoint {i+1} envoyé")

    time.sleep(0.5)
    master.mav.mission_ack_send(target_system, target_component, 0)
    print("✅ Mission uploadée !")
    return True

# ─── Serveur HTTP ────────────────────────────────────────────
def handle_client(conn, addr):
    try:
        data = conn.recv(4096).decode()
        if not data:
            return
        body = data.split('\r\n\r\n')[-1]
        waypoints = json.loads(body)
        if not isinstance(waypoints, list):
            raise ValueError("Format invalide")
        upload_mission(waypoints)
        response = "HTTP/1.1 200 OK\nContent-Type: application/json\n\n{\"status\":\"ok\"}"
        conn.send(response.encode())
    except Exception as e:
        print(f"❌ Erreur: {e}")
        response = f"HTTP/1.1 500 ERROR\n\n{{\"status\":\"error\",\"message\":\"{str(e)}\"}}"
        conn.send(response.encode())
    finally:
        conn.close()

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', SERVER_PORT))
    server.listen(1)
    print(f"🌐 Serveur mission sur http://127.0.0.1:{SERVER_PORT}")
    while True:
        conn, addr = server.accept()
        threading.Thread(target=handle_client, args=(conn, addr)).start()

if __name__ == "__main__":
    main()