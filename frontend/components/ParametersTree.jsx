// components/ParametersTree.jsx
import React, { useState, useEffect } from 'react';

function ParametersTree({ droneId, onParamChange }) {
  const [params, setParams] = useState({});
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    // Récupérer les paramètres depuis le backend
    fetch(`http://localhost:8000/api/drones/${droneId}/params`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(setParams)
      .catch(console.error);
  }, [droneId]);

  const updateParam = async (name, value) => {
    try {
      await fetch(`http://localhost:8000/api/drones/${droneId}/param`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ name, value }),
      });
      setParams(prev => ({ ...prev, [name]: value }));
      onParamChange?.(name, value);
    } catch (err) {
      alert(`Erreur mise à jour ${name}: ${err.message}`);
    }
    setEditing(null);
  };

  const filteredParams = Object.entries(params).filter(([key]) =>
    key.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <input
        type="text"
        placeholder="Filtrer les paramètres..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ marginBottom: 8, padding: 6 }}
      />
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filteredParams.map(([name, value]) => (
          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: 4, borderBottom: '1px solid #ccc' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{name}</span>
            {editing === name ? (
              <input
                type="text"
                defaultValue={value}
                onBlur={(e) => updateParam(name, e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && updateParam(name, e.target.value)}
                autoFocus
                style={{ width: 100 }}
              />
            ) : (
              <span
                style={{ cursor: 'pointer', fontFamily: 'monospace' }}
                onClick={() => setEditing(name)}
              >
                {value}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ParametersTree;