import asyncio
import websockets
import socket

UDP_IP = "127.0.0.1"
UDP_PORT = 14550
WS_PORT = 8765

sock_recv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock_recv.bind((UDP_IP, UDP_PORT))
sock_recv.setblocking(False)

sock_send = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

async def handler(websocket):
    print("✅ Client WebSocket connecté")
    try:
        while True:
            # 1. UDP → WebSocket
            try:
                data, addr = sock_recv.recvfrom(65536)
                if data:
                    await websocket.send(data)
            except BlockingIOError:
                pass

            # 2. WebSocket → UDP
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=0.01)
                if isinstance(message, bytes):
                    sock_send.sendto(message, (UDP_IP, UDP_PORT))
                    print(f"📤 Commande UDP envoyée: {len(message)} octets")
                else:
                    print(f"⚠️ Message non binaire reçu: {type(message)}")
            except asyncio.TimeoutError:
                pass
            except websockets.exceptions.ConnectionClosed:
                break

            await asyncio.sleep(0.001)
    except websockets.exceptions.ConnectionClosed:
        print("❌ Client déconnecté")

async def main():
    print(f"🔁 Pont UDP {UDP_IP}:{UDP_PORT} ↔ WebSocket ws://0.0.0.0:{WS_PORT}")
    async with websockets.serve(handler, "0.0.0.0", WS_PORT):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())