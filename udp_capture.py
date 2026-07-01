import socket

UDP_IP = "127.0.0.1"
UDP_PORT = 14550

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))
print("📡 En écoute sur UDP 14550...")
print("Appuyez sur Ctrl+C pour arrêter.\n")

while True:
    data, addr = sock.recvfrom(65536)
    hex_str = ' '.join(f'{b:02X}' for b in data)
    print(f"✅ Reçu {len(data)} octets : {hex_str[:200]}...")  # affiche les 200 premiers