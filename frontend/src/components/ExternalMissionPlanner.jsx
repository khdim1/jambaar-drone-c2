import React, { useEffect } from 'react';

const ExternalMissionPlanner = ({ onMissionUpload }) => {
  useEffect(() => {
    const handler = (event) => {
      if (event.origin !== 'http://localhost:8080') return;
      if (event.data.type === 'mission') {
        const waypoints = event.data.waypoints.map(wp => ({
          lat: wp.lat,
          lng: wp.lng,
          alt: 120,
          action: 'waypoint'
        }));
        const mission = {
          name: `Mission_${Date.now()}`,
          waypoints,
          speed: 15,
          altitude: 120,
          camera_mode: 'video',
          ai_detection: true,
          return_on_low_battery: 20
        };
        onMissionUpload(mission);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMissionUpload]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <iframe
        src="http://localhost:8080"
        title="Mission Planner"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  );
};

export default ExternalMissionPlanner;