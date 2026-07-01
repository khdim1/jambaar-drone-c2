import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// Correction des icônes Leaflet par défaut
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Composant pour centrer la carte
const ChangeView = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

// Barre de recherche (réutilisée de votre code)
const SearchBar = ({ onSearchResult }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const proxyUrl = 'https://corsproxy.io/?url=';
      const targetUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const response = await fetch(proxyUrl + encodeURIComponent(targetUrl), {
        headers: { 'User-Agent': 'DroneC2-App/1.0' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        onSearchResult(parseFloat(lat), parseFloat(lon), 15);
      } else {
        setError('Aucun lieu trouvé');
      }
    } catch (err) {
      console.error('Erreur de recherche:', err);
      setError('Erreur de recherche (CORS)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 10, right: 10, zIndex: 1000,
      display: 'flex', gap: 8, background: 'var(--panel)', padding: '8px 12px',
      borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <input
        type="text"
        className="form-input"
        placeholder="Rechercher un lieu..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        style={{ width: 200, margin: 0 }}
      />
      <button className="cmd-btn success" onClick={handleSearch} disabled={loading} style={{ padding: '4px 12px' }}>
        {loading ? '...' : '🔍'}
      </button>
      {error && <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 8 }}>{error}</span>}
    </div>
  );
};

const MissionPlanner = ({ droneId, onMissionUpload }) => {
  const [missionParams, setMissionParams] = useState({
    speed: 15,
    altitude: 120,
    cameraMode: 'video',
    aiDetection: true,
  });
  const [center, setCenter] = useState([14.5, -14.5]);
  const [zoom, setZoom] = useState(7);
  const featureGroupRef = useRef();

  const _onCreated = (e) => {
    const { layer } = e;
    console.log('Waypoint ajouté', layer.getLatLng());
  };

  const handleUploadMission = () => {
    const layers = featureGroupRef.current?.getLayers();
    if (!layers || layers.length === 0) {
      alert('Veuillez ajouter au moins un waypoint (marqueur) sur la carte.');
      return;
    }

    const waypoints = [];
    layers.forEach(layer => {
      if (layer instanceof L.Marker) {
        const { lat, lng } = layer.getLatLng();
        waypoints.push({ lat, lng, alt: missionParams.altitude, action: 'waypoint' });
      }
    });

    const mission = {
      name: `Mission_${new Date().toISOString().slice(0, 19)}`,
      waypoints,
      speed: missionParams.speed,
      altitude: missionParams.altitude,
      camera_mode: missionParams.cameraMode,
      ai_detection: missionParams.aiDetection,
      return_on_low_battery: 20,
    };
    onMissionUpload(mission);
  };

  const clearAll = () => {
    if (featureGroupRef.current) featureGroupRef.current.clearLayers();
  };

  const handleSearchResult = (lat, lng, zoomLevel) => {
    setCenter([lat, lng]);
    setZoom(zoomLevel);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 12, padding: 8, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: 'var(--panel)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>Vitesse (m/s):</label>
          <input type="number" value={missionParams.speed} onChange={e => setMissionParams({...missionParams, speed: parseFloat(e.target.value)})} style={{ width: 70 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>Altitude (m):</label>
          <input type="number" value={missionParams.altitude} onChange={e => setMissionParams({...missionParams, altitude: parseFloat(e.target.value)})} style={{ width: 70 }} />
        </div>
        <select value={missionParams.cameraMode} onChange={e => setMissionParams({...missionParams, cameraMode: e.target.value})}>
          <option value="video">Vidéo</option>
          <option value="photo">Photo</option>
          <option value="thermal">Thermique</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={missionParams.aiDetection} onChange={e => setMissionParams({...missionParams, aiDetection: e.target.checked})} />
          IA Active
        </label>
        <button className="cmd-btn success" onClick={handleUploadMission}>🚀 Envoyer mission</button>
        <button className="cmd-btn" onClick={clearAll}>🗑️ Effacer tout</button>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <SearchBar onSearchResult={handleSearchResult} />
        <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
          <ChangeView center={center} zoom={zoom} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          <FeatureGroup ref={featureGroupRef}>
            <EditControl
              position="topleft"
              onCreated={_onCreated}
              draw={{
                rectangle: false,
                polyline: false,
                circle: false,
                circlemarker: false,
                polygon: false,
                marker: true,
              }}
            />
          </FeatureGroup>
        </MapContainer>
      </div>
    </div>
  );
};

export default MissionPlanner;