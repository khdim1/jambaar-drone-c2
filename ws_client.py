import asyncio
import websockets
import json

async def receive_data():
    uri = "ws://192.168.1.85:8765"
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connecté au bridge !")
            while True:
                message = await websocket.recv()
                data = json.loads(message)
                if data.get("type") == "HEARTBEAT":
                    print(f"📥 HEARTBEAT: mode={data.get('mode')}, armed={data.get('armed')}")
                elif data.get("type") == "GLOBAL_POSITION_INT":
                    print(f"📍 POSITION: {data.get('latitude'):.6f}, {data.get('longitude'):.6f}")
                elif data.get("type") == "SYS_STATUS":
                    print(f"🔋 BATTERIE: {data.get('battery')}%")
    except Exception as e:
        print(f"❌ Erreur: {e}")

asyncio.run(receive_data())