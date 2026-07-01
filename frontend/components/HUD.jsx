// components/HUD.jsx
import React from 'react';

function HUD({ telemetry }) {
  if (!telemetry) return <div style={{ padding: 20, textAlign: 'center' }}>Télémétrie en attente...</div>;

  const { altitude, speed, heading, battery, pitch, roll } = telemetry;
  const rollDeg = roll || 0;
  const pitchDeg = pitch || 0;

  return (
    <div style={{
      background: 'rgba(0,0,0,0.7)',
      color: '#0f0',
      fontFamily: 'monospace',
      padding: 12,
      borderRadius: 8,
      border: '1px solid #0f0',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>Altitude: <strong>{altitude?.toFixed(1)} m</strong></div>
        <div>Vitesse sol: <strong>{speed?.toFixed(1)} m/s</strong></div>
        <div>Cap: <strong>{heading?.toFixed(0)}°</strong></div>
        <div>Batterie: <strong>{battery?.toFixed(0)}%</strong></div>
      </div>
      {/* Horizon artificiel simple */}
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <div style={{
          position: 'relative',
          width: 200,
          height: 120,
          background: '#333',
          borderRadius: 8,
          overflow: 'hidden',
          margin: '0 auto',
        }}>
          <div style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            background: `linear-gradient(to bottom, #87CEEB ${50 + rollDeg}%, #8B4513 ${50 + rollDeg}%)`,
            transform: `rotate(${rollDeg}deg)`,
          }} />
          <div style={{
            position: 'absolute',
            bottom: '50%',
            left: '50%',
            width: 2,
            height: 20,
            background: 'white',
            transform: 'translateX(-50%)',
          }} />
          <div style={{ position: 'absolute', bottom: 4, left: 4, color: 'white', fontSize: 10 }}>
            P:{pitchDeg?.toFixed(0)}° R:{rollDeg?.toFixed(0)}°
          </div>
        </div>
      </div>
    </div>
  );
}

export default HUD;