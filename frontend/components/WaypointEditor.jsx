// components/WaypointEditor.jsx
import React from 'react';

function WaypointEditor({ waypoint, onUpdate, onClose }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 12,
      width: 250,
      zIndex: 1000,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Éditer waypoint</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✖</button>
      </div>
      <div>
        <label>Latitude: </label>
        <input type="number" step="0.000001" value={waypoint.lat} onChange={e => onUpdate({...waypoint, lat: parseFloat(e.target.value)})} style={{ width: '100%' }} />
      </div>
      <div>
        <label>Longitude: </label>
        <input type="number" step="0.000001" value={waypoint.lng} onChange={e => onUpdate({...waypoint, lng: parseFloat(e.target.value)})} style={{ width: '100%' }} />
      </div>
      <div>
        <label>Altitude (m): </label>
        <input type="number" value={waypoint.alt} onChange={e => onUpdate({...waypoint, alt: parseFloat(e.target.value)})} style={{ width: '100%' }} />
      </div>
      <div>
        <label>Temps d'attente (s): </label>
        <input type="number" value={waypoint.loiterTime || 0} onChange={e => onUpdate({...waypoint, loiterTime: parseFloat(e.target.value)})} style={{ width: '100%' }} />
      </div>
    </div>
  );
}

export default WaypointEditor;