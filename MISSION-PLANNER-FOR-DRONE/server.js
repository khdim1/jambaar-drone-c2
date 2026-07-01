const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Stockage WebSocket
const clients = new Set();

// Télémétrie simulée
let currentTelemetry = {
  lat: 14.5,
  lon: -14.5,
  alt: 100,
  pitch: 0,
  roll: 0,
  yaw: 0,
  timestamp: Date.now()
};

// Waypoints
let waypoints = [];

// Simulation de mouvement (optionnel)
setInterval(() => {
  currentTelemetry.lat += (Math.random() - 0.5) * 0.001;
  currentTelemetry.lon += (Math.random() - 0.5) * 0.001;
  currentTelemetry.alt += (Math.random() - 0.5) * 2;
  currentTelemetry.timestamp = Date.now();
  broadcast({ type: 'telemetry', data: currentTelemetry });
}, 2000);

// WebSocket
wss.on('connection', (ws) => {
  console.log('Client WebSocket connecté');
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'telemetry', data: currentTelemetry }));
  ws.send(JSON.stringify({ type: 'waypoints', data: waypoints }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'addWaypoint') {
        const newWp = {
          id: Date.now(),
          lat: data.lat,
          lon: data.lon,
          name: data.name || `Waypoint ${waypoints.length + 1}`,
          timestamp: Date.now()
        };
        waypoints.push(newWp);
        broadcast({ type: 'waypoints', data: waypoints });
      } else if (data.type === 'removeWaypoint') {
        waypoints = waypoints.filter(wp => wp.id !== data.id);
        broadcast({ type: 'waypoints', data: waypoints });
      }
    } catch (err) { console.error(err); }
  });

  ws.on('close', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Endpoints REST
app.post('/telemetry', (req, res) => {
  const { lat, lon, alt, pitch, roll, yaw } = req.body;
  if (typeof lat !== 'number' || typeof lon !== 'number' ||
      typeof alt !== 'number' || typeof pitch !== 'number' ||
      typeof roll !== 'number' || typeof yaw !== 'number') {
    return res.status(400).json({ error: 'Données invalides' });
  }
  currentTelemetry = { lat, lon, alt, pitch, roll, yaw, timestamp: Date.now() };
  broadcast({ type: 'telemetry', data: currentTelemetry });
  res.status(200).json({ message: 'Télémétrie reçue' });
});

app.get('/api/telemetry', (req, res) => res.json(currentTelemetry));
app.get('/api/waypoints', (req, res) => res.json(waypoints));
app.post('/api/waypoints', (req, res) => {
  const { lat, lon, name } = req.body;
  if (typeof lat !== 'number' || typeof lon !== 'number') return res.status(400).json({ error: 'Lat/Lon requis' });
  const newWp = { id: Date.now(), lat, lon, name: name || `Waypoint ${waypoints.length + 1}`, timestamp: Date.now() };
  waypoints.push(newWp);
  broadcast({ type: 'waypoints', data: waypoints });
  res.status(201).json(newWp);
});
app.delete('/api/waypoints/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const len = waypoints.length;
  waypoints = waypoints.filter(wp => wp.id !== id);
  if (waypoints.length === len) return res.status(404).json({ error: 'Waypoint non trouvé' });
  broadcast({ type: 'waypoints', data: waypoints });
  res.status(200).json({ message: 'Waypoint supprimé' });
});

app.get('/health', (req, res) => res.json({ status: 'OK', clients: clients.size, waypoints: waypoints.length }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, () => {
  console.log(`🚁 Drone Mission Planner running on http://localhost:${PORT}`);
  console.log(`📡 Telemetry endpoint: http://localhost:${PORT}/telemetry`);
  console.log(`🌐 WebSocket server ready`);
});