// hooks/useMAVLink.js
import { useEffect, useRef, useState, useCallback } from 'react';

export function useMAVLink(droneId, onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!droneId) return;
    const ws = new WebSocket(`ws://localhost:8000/ws/mavlink/${droneId}`);
    wsRef.current = ws;
    ws.onopen = () => {
      console.log(`MAVLink WebSocket connecté pour ${droneId}`);
      setConnected(true);
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage?.(data);
    };
    ws.onerror = (err) => console.error('MAVLink WS error', err);
    ws.onclose = () => {
      setConnected(false);
      console.log('MAVLink WS fermé');
    };
    return () => ws.close();
  }, [droneId, onMessage]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { connected, send };
}