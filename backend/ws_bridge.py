"""
ws_bridge.py - Pont entre Jetson et backend
Version complète avec toutes les commandes de vol et transmission des données GPS
"""

import asyncio
import websockets
import json
import aiohttp
import time

JETSON_WS = "ws://100.97.206.1:8765"
BACKEND_URL = "http://localhost:8000/api/telemetry/update"

command_queue = asyncio.Queue()
connected = False
current_websocket = None

async def forward_to_backend():
    """Boucle principale de connexion au Jetson"""
    global connected, current_websocket
    
    while True:
        try:
            print(f"🔌 Connexion à {JETSON_WS}...")
            async with websockets.connect(
                JETSON_WS,
                ping_interval=20,
                ping_timeout=60,
                close_timeout=10
            ) as websocket:
                connected = True
                current_websocket = websocket
                print(f"✅ Connecté au Jetson")
                print(f"📡 En attente des données de télémétrie...")
                
                async def send_commands():
                    global connected
                    while connected:
                        try:
                            cmd = await asyncio.wait_for(command_queue.get(), timeout=0.5)
                            if current_websocket:
                                await current_websocket.send(cmd)
                                print(f"📤 Commande envoyée au Jetson: {cmd}")
                        except asyncio.TimeoutError:
                            continue
                        except Exception as e:
                            print(f"⚠️ Erreur envoi: {e}")
                            connected = False
                            break
                
                async def receive_messages():
                    global connected
                    async with aiohttp.ClientSession() as session:
                        while connected:
                            try:
                                msg = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                                try:
                                    data = json.loads(msg)
                                    msg_type = data.get('type', 'unknown')
                                    
                                    print(f"📥 Reçu: {msg_type}")
                                    
                                    # === GLOBAL_POSITION_INT ===
                                    if msg_type == 'GLOBAL_POSITION_INT':
                                        lat = data.get('lat', 0)
                                        lon = data.get('lon', 0)
                                        alt = data.get('alt', 0)
                                        heading = data.get('heading', 0)
                                        
                                        print(f"📍 GPS: lat={lat:.6f}, lon={lon:.6f}, alt={alt:.1f}m")
                                        
                                        # Envoyer au backend avec les bonnes clés
                                        payload = {
                                            "type": "GLOBAL_POSITION_INT",
                                            "latitude": lat,
                                            "longitude": lon,
                                            "altitude": alt,
                                            "heading": heading
                                        }
                                        async with session.post(BACKEND_URL, json={"telemetry": payload}) as response:
                                            if response.status == 200:
                                                print(f"✅ Envoyé GPS au backend")
                                            else:
                                                print(f"⚠️ Backend GPS: {response.status}")
                                    
                                    # === HEARTBEAT ===
                                    elif msg_type == 'HEARTBEAT':
                                        mode = data.get('mode', 'UNKNOWN')
                                        armed = data.get('armed', False)
                                        
                                        print(f"📥 HEARTBEAT: mode={mode}, armed={armed}")
                                        
                                        payload = {
                                            "type": "HEARTBEAT",
                                            "mode": mode,
                                            "armed": armed
                                        }
                                        async with session.post(BACKEND_URL, json={"telemetry": payload}) as response:
                                            if response.status == 200:
                                                print(f"✅ Envoyé HEARTBEAT au backend")
                                            else:
                                                print(f"⚠️ Backend HEARTBEAT: {response.status}")
                                    
                                    # === SYS_STATUS ===
                                    elif msg_type == 'SYS_STATUS':
                                        battery = data.get('battery', 0)
                                        voltage = data.get('voltage', 0)
                                        
                                        print(f"🔋 Batterie: {battery}%, Voltage: {voltage:.2f}V")
                                        
                                        payload = {
                                            "type": "SYS_STATUS",
                                            "battery": battery,
                                            "voltage": voltage
                                        }
                                        async with session.post(BACKEND_URL, json={"telemetry": payload}) as response:
                                            if response.status == 200:
                                                print(f"✅ Envoyé SYS_STATUS au backend")
                                            else:
                                                print(f"⚠️ Backend SYS_STATUS: {response.status}")
                                    
                                    # === VFR_HUD ===
                                    elif msg_type == 'VFR_HUD':
                                        heading = data.get('heading', 0)
                                        speed = data.get('groundspeed', 0)
                                        airspeed = data.get('airspeed', 0)
                                        altitude = data.get('alt', 0)
                                        
                                        print(f"📊 Cap: {heading}°, Vitesse: {speed:.1f}m/s, Alt: {altitude:.1f}m")
                                        
                                        payload = {
                                            "type": "VFR_HUD",
                                            "heading": heading,
                                            "speed": speed,
                                            "groundspeed": speed,
                                            "airspeed": airspeed,
                                            "altitude": altitude
                                        }
                                        async with session.post(BACKEND_URL, json={"telemetry": payload}) as response:
                                            if response.status == 200:
                                                print(f"✅ Envoyé VFR_HUD au backend")
                                            else:
                                                print(f"⚠️ Backend VFR_HUD: {response.status}")
                                    
                                    # === GPS_RAW_INT ===
                                    elif msg_type == 'GPS_RAW_INT':
                                        satellites = data.get('satellites', 0)
                                        fix_type = data.get('fix_type', 0)
                                        lat = data.get('lat', 0)
                                        lon = data.get('lon', 0)
                                        alt = data.get('alt', 0)
                                        
                                        print(f"🛰️ GPS: fix={fix_type}, satellites={satellites}")
                                        
                                        payload = {
                                            "type": "GPS_RAW_INT",
                                            "satellites": satellites,
                                            "fix_type": fix_type,
                                            "latitude": lat,
                                            "longitude": lon,
                                            "altitude": alt
                                        }
                                        async with session.post(BACKEND_URL, json={"telemetry": payload}) as response:
                                            if response.status == 200:
                                                print(f"✅ Envoyé GPS_RAW_INT au backend")
                                            else:
                                                print(f"⚠️ Backend GPS_RAW_INT: {response.status}")
                                    
                                    # === AUTRES MESSAGES ===
                                    else:
                                        print(f"📥 {msg_type}")
                                        async with session.post(BACKEND_URL, json={"telemetry": data}) as response:
                                            if response.status != 200:
                                                print(f"⚠️ Backend {msg_type}: {response.status}")
                                            
                                except json.JSONDecodeError as e:
                                    print(f"⚠️ JSON invalide: {e}")
                                    
                            except asyncio.TimeoutError:
                                continue
                            except websockets.exceptions.ConnectionClosed:
                                print("❌ Connexion fermée")
                                connected = False
                                break
                            except Exception as e:
                                print(f"❌ Erreur réception: {e}")
                                connected = False
                                break
                
                await asyncio.gather(
                    send_commands(),
                    receive_messages()
                )
                
        except Exception as e:
            connected = False
            current_websocket = None
            print(f"❌ Erreur connexion: {e}")
            await asyncio.sleep(5)

async def handle_command(request):
    """Gère les commandes reçues du backend"""
    try:
        data = await request.json()
        command = data.get("command")
        params = data.get("params", {})
        print(f"📥 Commande reçue du backend: {command}")
        
        # Toutes les commandes supportées
        if command == "arm":
            cmd_msg = json.dumps({"command": "arm"})
        elif command == "disarm":
            cmd_msg = json.dumps({"command": "disarm"})
        elif command == "takeoff":
            altitude = params.get("altitude", 10)
            cmd_msg = json.dumps({"command": "takeoff", "altitude": altitude})
        elif command == "land":
            cmd_msg = json.dumps({"command": "land"})
        elif command == "rtl":
            cmd_msg = json.dumps({"command": "rtl"})
        elif command == "loiter":
            cmd_msg = json.dumps({"command": "loiter"})
        elif command == "mode":
            mode = params.get("mode", "STABILIZE")
            cmd_msg = json.dumps({"command": "mode", "mode": mode})
        elif command == "emergency_rtl":
            cmd_msg = json.dumps({"command": "emergency_rtl"})
        else:
            cmd_msg = json.dumps({"command": command, "params": params})
        
        await command_queue.put(cmd_msg)
        print(f"📤 Commande mise en queue: {cmd_msg}")
        
        return aiohttp.web.Response(
            text='{"status":"ok","message":"Commande envoyée au Jetson"}',
            content_type='application/json'
        )
        
    except Exception as e:
        print(f"❌ Erreur commande: {e}")
        return aiohttp.web.Response(
            text=f'{{"status":"error","message":"{e}"}}',
            content_type='application/json',
            status=500
        )

async def start_command_server():
    from aiohttp import web
    app = web.Application()
    app.router.add_post('/command', handle_command)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', 8767)
    await site.start()
    print(f"🌐 Serveur de commandes sur http://127.0.0.1:8767")
    return runner

async def main():
    print("=" * 50)
    print("🚀 Bridge MAVLink → Backend")
    print(f"📡 Jetson: {JETSON_WS}")
    print(f"📤 Backend: {BACKEND_URL}")
    print("=" * 50)
    print("Commandes: arm, disarm, takeoff, land, rtl, loiter, mode, emergency_rtl")
    print("=" * 50)
    print("📡 Données de télémétrie transmises au backend")
    print("=" * 50)
    
    runner = await start_command_server()
    try:
        await forward_to_backend()
    except KeyboardInterrupt:
        print("\n🛑 Arrêt")
    finally:
        await runner.cleanup()

if __name__ == "__main__":
    asyncio.run(main())