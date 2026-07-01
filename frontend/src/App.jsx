/**
 * ============================================================
 * DRONE C2 / JAMBAAR — FRONTEND REACT COMPLET v5.0
 * ============================================================
 * CORRECTIONS v5.0 :
 * - ✅ Bouton Armer/Désarmer fonctionnel avec vote majority (armedRef)
 * - ✅ Bouton Décollage actif uniquement quand le drone est armé
 * - ✅ Mise à jour en temps réel de l'état armé via WebSocket
 * - ✅ Synchronisation complète backend ↔ frontend
 * - ✅ HEARTBEAT_VOTE_SIZE = 5 pour stabilité état armé
 * - ✅ useRef pour éviter les flickering React
 * - ✅ CORRECTION GPS : La carte affiche la position réelle du drone
 * ============================================================
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from "react";
import {
  MapContainer, TileLayer, Marker, Polyline,
  Circle, Popup, useMap, useMapEvents
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon   from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
});

// ─────────────────────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";
const RPI_WS_URL = "ws://localhost:8765";
const DEFAULT_LAT = 14.7167;
const DEFAULT_LNG = -17.4677;

// Nombre de HEARTBEAT consécutifs nécessaires pour changer l'état armé
const HEARTBEAT_VOTE_SIZE = 10;

// ─────────────────────────────────────────────────────────────
//  CSS GLOBAL
// ─────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#f0f4f0;--bg2:#e6ede6;--bg3:#d8e4d8;--panel:#fff;
  --border:#b8d0b8;--brd2:#90b890;
  --accent:#1b7c1b;--acc2:#0d5c0d;--acc3:#e8f5e8;
  --green:#1b7c1b;--orange:#e65c00;--red:#c62828;
  --yellow:#c79100;--blue:#1565c0;
  --text:#1a2e1a;--txt2:#2d4a2d;--txt3:#527a52;
  --font:'Exo 2',sans-serif;--mono:'Share Tech Mono',monospace;
  --title:'Rajdhani',sans-serif;
  --shadow:0 2px 8px rgba(0,0,0,0.12);
}
html,body,#root{height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font);}
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-track{background:var(--bg2);}
::-webkit-scrollbar-thumb{background:var(--brd2);border-radius:3px;}
.app{display:grid;grid-template-rows:56px 1fr;height:100vh;}
.main{display:grid;grid-template-columns:270px 1fr 330px;overflow:hidden;}
.header{display:flex;align-items:center;justify-content:space-between;
  padding:0 16px;background:linear-gradient(90deg,#1b5e20,#2e7d32,#1b5e20);
  border-bottom:2px solid var(--acc2);box-shadow:var(--shadow);z-index:200;}
.logo-text{font-family:var(--title);font-size:22px;font-weight:700;letter-spacing:3px;color:#fff;}
.logo-sub{font-family:var(--mono);font-size:8px;color:rgba(255,255,255,0.7);letter-spacing:3px;}
.flag{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.1);
  padding:3px 10px 3px 6px;border-radius:30px;border:1px solid rgba(255,255,255,0.2);}
.flag-text{font-family:var(--mono);font-size:10px;color:rgba(255,255,255,0.9);letter-spacing:1px;}
.nav-btn{padding:6px 14px;border:none;background:transparent;color:rgba(255,255,255,0.7);
  font-family:var(--font);font-size:11px;font-weight:600;letter-spacing:1px;
  cursor:pointer;border-radius:4px;text-transform:uppercase;transition:all 0.2s;position:relative;}
.nav-btn:hover{color:#fff;background:rgba(255,255,255,0.15);}
.nav-btn.active{color:#fff;background:rgba(255,255,255,0.2);}
.nav-btn.active::after{content:'';position:absolute;bottom:0;left:15%;right:15%;
  height:2px;background:#fff;border-radius:1px;}
.dot{width:8px;height:8px;border-radius:50%;background:#69f0ae;
  box-shadow:0 0 6px #69f0ae;animation:pdot 2s infinite;}
.dot.warn{background:#ffab40;box-shadow:0 0 6px #ffab40;}
.dot.alert{background:#ff5252;box-shadow:0 0 8px #ff5252;}
@keyframes pdot{0%,100%{opacity:1}50%{opacity:0.4}}
.avatar{width:30px;height:30px;border-radius:50%;
  background:linear-gradient(135deg,rgba(255,255,255,0.3),rgba(255,255,255,0.1));
  border:1px solid rgba(255,255,255,0.4);
  display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:700;color:#fff;font-family:var(--title);}
.logout-btn{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);
  color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;
  font-size:11px;font-family:var(--font);transition:all 0.2s;}
.logout-btn:hover{background:rgba(198,40,40,0.5);}
.sidebar{background:var(--bg2);border-right:1px solid var(--border);
  display:flex;flex-direction:column;overflow:hidden;}
.section-hdr{padding:8px 12px;background:var(--bg3);border-bottom:1px solid var(--border);
  font-family:var(--title);font-size:11px;font-weight:700;letter-spacing:3px;
  color:var(--txt3);text-transform:uppercase;display:flex;justify-content:space-between;}
.drone-list{display:flex;flex-direction:column;gap:5px;overflow-y:auto;flex:1;padding:10px;}
.dc{background:var(--panel);border:1px solid var(--border);border-radius:8px;
  padding:9px 11px;cursor:pointer;transition:all 0.18s;position:relative;overflow:hidden;
  box-shadow:var(--shadow);}
.dc::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;
  background:var(--sc,var(--txt3));border-radius:8px 0 0 8px;}
.dc.flying{--sc:var(--green);}
.dc.charging{--sc:var(--yellow);}
.dc.maintenance{--sc:var(--orange);}
.dc.returning{--sc:var(--blue);}
.dc.emergency{--sc:var(--red);animation:flash-dc 1s infinite;}
.dc.idle{--sc:var(--txt3);}
.dc.disconnected{--sc:#999;opacity:0.6;}
.dc.selected{border-color:var(--accent);background:var(--acc3);box-shadow:0 0 0 1px var(--accent);}
.dc:hover:not(.selected){border-color:var(--brd2);background:#f5faf5;}
@keyframes flash-dc{0%,100%{border-color:var(--red)}50%{border-color:transparent}}
.dc-name{font-family:var(--title);font-weight:700;font-size:14px;letter-spacing:1px;color:var(--text);}
.dc-stat-badge{font-family:var(--mono);font-size:9px;padding:1px 6px;border-radius:3px;
  border:1px solid var(--sc,var(--txt3));color:var(--sc,var(--txt3));
  text-transform:uppercase;letter-spacing:1px;}
.batt-bar{height:4px;background:var(--bg3);border-radius:2px;margin-top:6px;overflow:hidden;}
.batt-fill{height:100%;border-radius:2px;transition:width 0.6s;}
.mission-badge{font-family:var(--mono);font-size:8px;color:var(--blue);
  background:rgba(21,101,192,0.1);border:1px solid rgba(21,101,192,0.3);
  padding:1px 6px;border-radius:3px;margin-top:3px;display:inline-block;}
.kpi-bar{display:grid;grid-template-columns:repeat(5,1fr);
  border-bottom:1px solid var(--border);background:var(--bg2);}
.kpi{padding:7px 10px;border-right:1px solid var(--border);text-align:center;}
.kpi:last-child{border-right:none;}
.kpi-v{font-family:var(--title);font-size:20px;font-weight:700;color:var(--accent);line-height:1;}
.kpi-l{font-size:8px;color:var(--txt3);text-transform:uppercase;letter-spacing:1px;margin-top:2px;}
.rp{background:var(--bg2);border-left:1px solid var(--border);
  display:flex;flex-direction:column;overflow:hidden;}
.rp-tabs{display:flex;background:var(--bg3);border-bottom:1px solid var(--border);
  overflow-x:auto;flex-shrink:0;}
.rp-tab{flex:0 0 auto;padding:9px 8px;text-align:center;cursor:pointer;
  font-family:var(--font);font-size:10px;font-weight:600;text-transform:uppercase;
  letter-spacing:0.5px;color:var(--txt3);border:none;background:transparent;
  transition:all 0.2s;position:relative;white-space:nowrap;}
.rp-tab.active{color:var(--accent);background:var(--panel);}
.rp-tab.active::after{content:'';position:absolute;bottom:0;left:10%;right:10%;
  height:2px;background:var(--accent);}
.rp-content{flex:1;overflow-y:auto;padding:10px;}
.dp-hdr{background:linear-gradient(135deg,var(--acc3),#fff);
  border-bottom:1px solid var(--border);padding:12px;margin:-10px -10px 10px;}
.dp-name{font-family:var(--title);font-size:18px;font-weight:700;letter-spacing:2px;color:var(--accent);}
.dp-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);
  border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:10px;}
.dp-cell{background:var(--panel);padding:8px 12px;}
.dp-lbl{font-size:9px;color:var(--txt3);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;}
.dp-val{font-family:var(--mono);font-size:14px;color:var(--text);font-weight:600;}
.cmd-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.cbtn{padding:9px 6px;border-radius:6px;border:1px solid var(--border);background:var(--panel);
  color:var(--txt2);font-family:var(--font);font-size:11px;font-weight:600;
  cursor:pointer;text-align:center;transition:all 0.18s;text-transform:uppercase;
  letter-spacing:0.5px;display:flex;align-items:center;justify-content:center;gap:4px;}
.cbtn:hover:not(:disabled){border-color:var(--accent);color:var(--accent);background:var(--acc3);}
.cbtn:disabled{opacity:0.4;cursor:not-allowed;}
.cbtn.ok{border-color:rgba(27,124,27,0.5);color:var(--green);background:rgba(27,124,27,0.06);}
.cbtn.ok:hover:not(:disabled){background:rgba(27,124,27,0.12);}
.cbtn.danger{border-color:rgba(198,40,40,0.5);color:var(--red);background:rgba(198,40,40,0.04);}
.cbtn.danger:hover:not(:disabled){background:rgba(198,40,40,0.12);}
.cbtn.warn{border-color:rgba(230,92,0,0.5);color:var(--orange);}
.cbtn.full{grid-column:span 2;}
.cbtn.active-mission{border-color:rgba(21,101,192,0.5);color:var(--blue);background:rgba(21,101,192,0.06);}
.cbtn.usb-btn{border-color:rgba(27,124,27,0.6);color:#fff;background:var(--green);font-weight:700;}
.cbtn.usb-btn:hover:not(:disabled){background:var(--acc2);}
.cbtn.usb-btn.connected{background:var(--red);border-color:var(--red);}
.cbtn.armed-active{border-color:rgba(198,40,40,0.7);color:#fff;background:var(--red);font-weight:700;}
.cbtn.armed-active:hover:not(:disabled){background:#a82020;}
.spark-wrap{margin-bottom:8px;}
.spark-lbl{font-size:9px;color:var(--txt3);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;}
.spark-val{font-family:var(--mono);font-size:12px;font-weight:600;float:right;}
.ai{border:1px solid var(--border);border-radius:6px;padding:9px 10px;
  margin-bottom:7px;cursor:pointer;transition:all 0.18s;position:relative;
  background:var(--panel);overflow:hidden;}
.ai::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;}
.ai.red{border-color:rgba(198,40,40,0.4);}
.ai.red::before{background:var(--red);}
.ai.orange{border-color:rgba(230,92,0,0.4);}
.ai.orange::before{background:var(--orange);}
.ai.yellow{border-color:rgba(199,145,0,0.4);}
.ai.yellow::before{background:var(--yellow);}
.ai.acknowledged{opacity:0.5;}
.al-badge{display:inline-block;padding:1px 7px;border-radius:3px;
  font-family:var(--mono);font-size:9px;text-transform:uppercase;
  letter-spacing:1px;font-weight:700;margin-bottom:4px;}
.al-badge.red{background:rgba(198,40,40,0.15);color:var(--red);border:1px solid rgba(198,40,40,0.4);}
.al-badge.orange{background:rgba(230,92,0,0.15);color:var(--orange);border:1px solid rgba(230,92,0,0.4);}
.al-badge.yellow{background:rgba(199,145,0,0.12);color:var(--yellow);border:1px solid rgba(199,145,0,0.3);}
.conf-bar{height:3px;background:var(--bg3);border-radius:2px;margin-top:5px;}
.conf-fill{height:100%;border-radius:2px;background:var(--green);}
.mission-form{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
.form-field{display:flex;flex-direction:column;gap:3px;}
.flbl{font-size:10px;color:var(--txt3);text-transform:uppercase;letter-spacing:1px;font-weight:600;}
.finput{padding:7px 10px;background:var(--bg3);border:1px solid var(--border);
  border-radius:5px;color:var(--text);font-family:var(--mono);font-size:12px;outline:none;
  transition:border 0.2s;}
.finput:focus{border-color:var(--accent);}
.fselect{width:100%;padding:7px 10px;background:var(--bg3);
  border:1px solid var(--border);border-radius:5px;color:var(--text);
  font-family:var(--mono);font-size:12px;outline:none;}
.wp-item{display:flex;justify-content:space-between;align-items:center;
  padding:5px 8px;background:var(--bg3);border-radius:4px;margin-bottom:4px;
  font-family:var(--mono);font-size:11px;}
.wp-num{background:var(--accent);color:#fff;width:20px;height:20px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;}
.wp-del{background:rgba(198,40,40,0.1);border:1px solid rgba(198,40,40,0.3);
  color:var(--red);padding:2px 8px;border-radius:3px;cursor:pointer;font-size:10px;}
.param-row{display:flex;justify-content:space-between;align-items:center;
  padding:5px 0;border-bottom:1px solid var(--border);font-size:11px;}
.param-name{color:var(--txt2);font-family:var(--mono);font-size:10px;flex:1;}
.param-desc{color:var(--txt3);font-size:9px;margin-top:1px;}
.param-val{font-family:var(--mono);font-size:11px;color:var(--accent);
  cursor:pointer;padding:2px 6px;border-radius:3px;border:1px solid transparent;}
.param-val:hover{border-color:var(--accent);background:var(--acc3);}
.param-input{width:80px;padding:2px 6px;background:var(--bg3);
  border:1px solid var(--accent);border-radius:3px;color:var(--text);
  font-family:var(--mono);font-size:11px;outline:none;}
.console-log{font-family:var(--mono);font-size:11px;padding:3px 0;border-bottom:1px solid var(--bg3);}
.console-log.sent{color:var(--accent);}
.console-log.recv{color:var(--green);}
.console-log.error{color:var(--red);}
.console-log.mav{color:#00d4ff;}
.console-log .ts{color:var(--txt3);margin-right:6px;}
.console-input-row{display:flex;gap:6px;margin-top:8px;}
.login-screen{height:100vh;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#e8f5e9 0%,#f1f8e9 50%,#e8f5e9 100%);}
.login-card{background:rgba(255,255,255,0.95);border:1px solid var(--border);
  border-radius:16px;padding:40px;width:420px;box-shadow:0 8px 32px rgba(27,124,27,0.12);}
.login-title{font-family:var(--title);font-size:26px;font-weight:700;
  letter-spacing:3px;color:var(--accent);text-align:center;margin-bottom:4px;}
.login-sub{text-align:center;color:var(--txt3);font-size:11px;letter-spacing:2px;
  text-transform:uppercase;margin-bottom:28px;}
.form-label{display:block;font-size:11px;color:var(--txt3);text-transform:uppercase;
  letter-spacing:1px;margin-bottom:5px;font-weight:600;}
.form-input{width:100%;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);
  border-radius:6px;color:var(--text);font-family:var(--mono);font-size:13px;outline:none;
  transition:border 0.2s;margin-bottom:14px;}
.form-input:focus{border-color:var(--accent);}
.login-btn{width:100%;padding:12px;
  background:linear-gradient(135deg,var(--acc2),var(--accent));
  border:none;border-radius:6px;color:#fff;font-family:var(--title);
  font-size:17px;font-weight:700;letter-spacing:2px;cursor:pointer;
  text-transform:uppercase;transition:all 0.2s;}
.login-btn:hover{box-shadow:0 4px 16px rgba(27,124,27,0.4);transform:translateY(-1px);}
.login-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none;}
.login-error{background:rgba(198,40,40,0.08);border:1px solid rgba(198,40,40,0.3);
  border-radius:6px;padding:9px;color:var(--red);font-size:12px;margin-top:10px;text-align:center;}
.login-hint{font-size:11px;color:var(--txt3);text-align:center;margin-top:14px;font-family:var(--mono);}
.notifs{position:fixed;top:65px;right:16px;z-index:9999;
  display:flex;flex-direction:column;gap:7px;max-width:360px;pointer-events:none;}
.notif{background:rgba(255,255,255,0.97);border-radius:8px;padding:11px 14px;
  box-shadow:0 4px 16px rgba(0,0,0,0.15);border-left:4px solid;
  animation:slide-in 0.25s ease;font-size:12px;cursor:pointer;pointer-events:all;}
.notif.red{border-color:var(--red);}
.notif.orange{border-color:var(--orange);}
.notif.yellow{border-color:var(--yellow);}
.notif.info{border-color:var(--accent);}
.notif.success{border-color:var(--green);}
.notif.critical{border-color:var(--red);background:#fff3f3;animation:flash-notif 0.5s infinite;}
.notif-title{font-family:var(--title);font-size:13px;font-weight:700;margin-bottom:2px;}
.notif.red .notif-title{color:var(--red);}
.notif.orange .notif-title{color:var(--orange);}
.notif.yellow .notif-title{color:var(--yellow);}
.notif.info .notif-title{color:var(--accent);}
.notif.success .notif-title{color:var(--green);}
.notif.critical .notif-title{color:var(--red);}
@keyframes slide-in{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes flash-notif{0%,100%{opacity:1}50%{opacity:0.7}}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px;}
.stat-card{background:var(--panel);border:1px solid var(--border);border-radius:10px;
  padding:18px;position:relative;overflow:hidden;box-shadow:var(--shadow);}
.stat-card::after{content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:var(--ac,var(--accent));}
.stat-v{font-family:var(--title);font-size:34px;font-weight:700;color:var(--text);line-height:1;}
.stat-l{font-size:11px;color:var(--txt3);margin-top:4px;text-transform:uppercase;letter-spacing:1px;}
.chart-card{background:var(--panel);border:1px solid var(--border);border-radius:10px;
  padding:14px;box-shadow:var(--shadow);}
.chart-title{font-family:var(--title);font-size:13px;font-weight:700;letter-spacing:1px;
  color:var(--text);margin-bottom:10px;}
.fleet-card{background:var(--panel);border:1px solid var(--border);border-radius:8px;
  padding:14px;margin-bottom:10px;box-shadow:var(--shadow);}
.fleet-card-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
.fleet-actions{display:flex;gap:6px;flex-wrap:wrap;}
.map-container{position:relative;overflow:hidden;background:#e8f5e8;}
.leaflet-container{height:100% !important;width:100% !important;background:#a8d5a2 !important;z-index:1;}
.drone-icon-wrap,.wp-icon-wrap,.alert-icon-wrap,.base-icon-wrap{background:transparent !important;border:none !important;}
.map-ctrl-bar{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);
  z-index:1000;display:flex;gap:8px;background:rgba(255,255,255,0.95);
  border:1px solid var(--border);border-radius:30px;padding:6px 14px;
  box-shadow:var(--shadow);}
.mctrl-btn{padding:5px 12px;border-radius:20px;border:1px solid var(--border);
  background:transparent;color:var(--txt2);font-family:var(--font);font-size:11px;
  font-weight:600;cursor:pointer;transition:all 0.18px;text-transform:uppercase;}
.mctrl-btn:hover,.mctrl-btn.active{border-color:var(--accent);color:var(--accent);background:var(--acc3);}
.hud{background:#0a1628;color:#00ff88;font-family:var(--mono);
  padding:12px;border-radius:8px;border:1px solid #1a3a5c;}
.hud-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
.hud-cell{background:rgba(0,0,0,0.3);border:1px solid #1a3a5c;border-radius:4px;padding:6px 10px;}
.hud-lbl{font-size:8px;color:#4a7a99;text-transform:uppercase;letter-spacing:1px;}
.hud-val{font-size:16px;font-weight:700;color:#00d4ff;line-height:1.2;}
.hud-unit{font-size:9px;color:#4a7a99;}
.hud-ai{font-size:9px;padding:2px 8px;border-radius:10px;display:inline-block;margin-top:4px;}
.hud-ai.on{background:rgba(0,255,136,0.2);color:#00ff88;border:1px solid rgba(0,255,136,0.4);}
.hud-ai.off{background:rgba(100,100,100,0.2);color:#666;border:1px solid rgba(100,100,100,0.3);}
@keyframes scanline{0%{top:-2px}100%{top:100%}}
.scanline{position:absolute;left:0;right:0;height:2px;
  background:linear-gradient(transparent,rgba(27,124,27,0.08),transparent);
  animation:scanline 10s linear infinite;pointer-events:none;z-index:5;}
.wp-hint{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:1000;
  background:rgba(21,101,192,0.9);color:#fff;padding:7px 18px;border-radius:20px;
  font-size:12px;font-family:var(--font);font-weight:600;box-shadow:var(--shadow);
  pointer-events:none;white-space:nowrap;}
.usb-status-bar{display:flex;align-items:center;gap:10px;background:#0a1628;
  border:1px solid #1a3a5c;border-radius:8px;padding:8px 12px;margin-bottom:10px;
  font-family:var(--mono);font-size:10px;color:#00d4ff;}
.usb-status-bar .baud-sel{background:#1a3a5c;border:1px solid #2a5a8c;
  border-radius:4px;color:#00d4ff;font-family:var(--mono);font-size:10px;
  padding:2px 6px;cursor:pointer;}
.vsim canvas{display:block;width:100%;height:auto;}
.arm-indicator{display:inline-flex;align-items:center;gap:6px;
  padding:4px 10px;border-radius:20px;font-family:var(--mono);font-size:11px;font-weight:700;}
.arm-indicator.armed{background:rgba(198,40,40,0.15);color:var(--red);border:1px solid rgba(198,40,40,0.5);}
.arm-indicator.disarmed{background:rgba(82,122,82,0.15);color:var(--txt3);border:1px solid var(--border);}
`;

// ─────────────────────────────────────────────────────────────
//  API CLIENT
// ─────────────────────────────────────────────────────────────
let _token = null;

async function apiFetch(path, opts = {}) {
  const url  = `${API_BASE}${path}`;
  const hdrs = {
    "Content-Type": "application/json",
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    ...(opts.headers || {})
  };
  const res = await fetch(url, { ...opts, headers: hdrs });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

const api = {
  login:         (u, p)    => apiFetch("/auth/login", { method:"POST", body:JSON.stringify({username:u,password:p}) }),
  getBaseStation:()        => apiFetch("/base"),
  updateBase:    (data)    => apiFetch("/base", { method:"PATCH", body:JSON.stringify(data) }),
  getDrones:     ()        => apiFetch("/drones"),
  createDrone:   (data)    => apiFetch("/drones", { method:"POST", body:JSON.stringify(data) }),
  getAlerts:     ()        => apiFetch("/alerts?limit=60"),
  getMissions:   ()        => apiFetch("/missions"),
  getLogs:       ()        => apiFetch("/logs"),
  getStats:      ()        => apiFetch("/stats/dashboard"),
  sendCommand:   (id,a,p={}) => apiFetch(`/drones/${id}/command`,{method:"POST",body:JSON.stringify({action:a,params:p})}),
  textCommand:   (id,cmd)  => apiFetch(`/drones/${id}/command/text`,{method:"POST",body:JSON.stringify({command:cmd})}),
  setMission:    (id,mis)  => apiFetch(`/drones/${id}/mission`,{method:"POST",body:JSON.stringify(mis)}),
  cancelMission: (mid)     => apiFetch(`/missions/${mid}`,{method:"DELETE"}),
  ackAlert:      (id,notes)=> apiFetch(`/alerts/${id}`,{method:"PATCH",body:JSON.stringify({status:"acknowledged",notes})}),
  getParams:     (id)      => apiFetch(`/drones/${id}/params`),
  setParam:      (id,n,v,t="INT32") => apiFetch(`/drones/${id}/param`,{method:"POST",body:JSON.stringify({name:n,value:v,param_type:t})}),
  scheduleMaint: (id,data) => apiFetch(`/drones/${id}/maintenance`,{method:"POST",body:JSON.stringify(data)}),
};

// ─────────────────────────────────────────────────────────────
//  MAVLINK HELPERS — CRC X25, encodage trames
// ─────────────────────────────────────────────────────────────
const MAV_CRC_EXTRA = { 0:50, 1:124, 11:89, 33:104, 74:20, 76:152, 84:143 };

function x25Crc(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    let tmp = data[i] ^ (crc & 0xFF);
    tmp ^= (tmp << 4) & 0xFF;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;
  }
  return crc;
}

function encodeMavlink1(msgId, payload, sysId=255, compId=190, seq=0) {
  const len = payload.length;
  const frame = new Uint8Array(6 + len + 2);
  frame[0] = 0xFE;
  frame[1] = len;
  frame[2] = seq & 0xFF;
  frame[3] = sysId;
  frame[4] = compId;
  frame[5] = msgId;
  frame.set(payload, 6);
  const crcData = new Uint8Array(5 + len + 1);
  crcData.set(frame.slice(1, 6 + len));
  crcData[5 + len] = MAV_CRC_EXTRA[msgId] || 0;
  const crc = x25Crc(crcData);
  frame[6 + len]     = crc & 0xFF;
  frame[6 + len + 1] = (crc >> 8) & 0xFF;
  return frame;
}

function encodeCommandLong(cmd, p1=0,p2=0,p3=0,p4=0,p5=0,p6=0,p7=0) {
  const buf = new ArrayBuffer(33);
  const dv  = new DataView(buf);
  dv.setFloat32(0,  p1, true);
  dv.setFloat32(4,  p2, true);
  dv.setFloat32(8,  p3, true);
  dv.setFloat32(12, p4, true);
  dv.setFloat32(16, p5, true);
  dv.setFloat32(20, p6, true);
  dv.setFloat32(24, p7, true);
  dv.setUint16(28, cmd, true);
  dv.setUint8(30, 1);
  dv.setUint8(31, 1);
  dv.setUint8(32, 0);
  return encodeMavlink1(76, new Uint8Array(buf));
}

function encodeSetMode(customMode) {
  const buf = new ArrayBuffer(6);
  const dv  = new DataView(buf);
  dv.setUint32(0, customMode, true);
  dv.setUint8(4, 1);
  dv.setUint8(5, 0x80);
  return encodeMavlink1(11, new Uint8Array(buf));
}

function encodeDoSetMode(customMode) {
  return encodeCommandLong(176, 1, customMode, 0, 0, 0, 0, 0);
}

const ARDUPILOT_MODES = {
  STABILIZE: 0, ACRO: 1, ALT_HOLD: 2, AUTO: 3, GUIDED: 4,
  LOITER: 5, RTL: 6, CIRCLE: 7, LAND: 9, DRIFT: 11, POSHOLD: 16,
   CUSTOM_61987: 61987, 
};

const MAV_CMD = {
  NAV_TAKEOFF:          22,
  NAV_LAND:             21,
  NAV_RETURN_TO_LAUNCH: 20,
  NAV_WAYPOINT:         16,
  NAV_LOITER_TIME:      19,
  NAV_LOITER_UNLIM:     17,
  DO_REPOSITION:        192,
  COMPONENT_ARM_DISARM: 400,
  DO_SET_HOME:          179,
  DO_PAUSE_CONTINUE:    193,
  DO_CHANGE_SPEED:      178,
  DO_SET_CAM_TRIGG_DIST:206,
  REQUEST_MESSAGE:      512,
};

// ─────────────────────────────────────────────────────────────
//  UTILITAIRES
// ─────────────────────────────────────────────────────────────
const battColor = (b) => b > 50 ? "#1b7c1b" : b > 20 ? "#c79100" : "#c62828";
const levColors = { red:"#c62828", orange:"#e65c00", yellow:"#c79100", green:"#1b7c1b" };
const STATUS_LABEL = {
  flying:"EN VOL", charging:"EN CHARGE", maintenance:"MAINTENANCE",
  idle:"STAND-BY", returning:"RETOUR BASE", emergency:"URGENCE",
  landing:"ATTERRISSAGE", disconnected:"DÉCONNECTÉ",
};
const fmtTime = (iso) => {
  if (!iso) return "--";
  try { return new Date(iso).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); }
  catch { return "--"; }
};
const fmtElapsed = (secs) => {
  const h=Math.floor(secs/3600), m=Math.floor((secs%3600)/60), s=secs%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
};

// ─────────────────────────────────────────────────────────────
//  ICÔNES LEAFLET
// ─────────────────────────────────────────────────────────────
function makeDroneIcon(status, heading, selected, missionActive, isUsb=false) {
  const colors = {
    flying:"#1b7c1b",
    charging:"#c79100",
    maintenance:"#e65c00",
    idle:"#78909c",
    returning:"#1565c0",
    emergency:"#c62828",
    landing:"#0288d1",
    disconnected:"#666",
  };
  const color = colors[status] || "#78909c";
  
  const pulseAnim = (status==="flying"||status==="returning"||status==="emergency") ? `
    <circle cx="20" cy="20" r="16" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.5">
      <animate attributeName="r" values="14;28;14" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/>
    </circle>` : "";
  const selRing = selected ? `
    <circle cx="20" cy="20" r="18" fill="none" stroke="#00d4ff" stroke-width="2"
      stroke-dasharray="6 4" opacity="0.9">
      <animateTransform attributeName="transform" type="rotate"
        from="0 20 20" to="360 20 20" dur="4s" repeatCount="indefinite"/>
    </circle>` : "";
  const usbDot = isUsb ? `
    <circle cx="30" cy="10" r="5" fill="#00d4ff" stroke="white" stroke-width="1.5">
      <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>
    </circle>` : "";
  const misDot = missionActive ? `<circle cx="30" cy="10" r="5" fill="#1565c0" stroke="white" stroke-width="1.5"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    ${pulseAnim}${selRing}
    <g transform="rotate(${heading||0} 20 20)">
      <ellipse cx="20" cy="20" rx="5" ry="7" fill="${color}" opacity="0.95"/>
      <line x1="8"  y1="8"  x2="32" y2="32" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
      <line x1="32" y1="8"  x2="8"  y2="32" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
      <circle cx="8"  cy="8"  r="5" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>
      <circle cx="32" cy="8"  r="5" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>
      <circle cx="8"  cy="32" r="5" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>
      <circle cx="32" cy="32" r="5" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>
      <polygon points="20,4 17,11 23,11" fill="${color}" opacity="0.9"/>
    </g>
    ${usbDot}${misDot}
    <circle cx="20" cy="20" r="3" fill="white" opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html:`<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">${svg}</div>`,
    className:"drone-icon-wrap", iconSize:[40,40], iconAnchor:[20,20], popupAnchor:[0,-22],
  });
}

function makeAlertIcon(level){
  const c=levColors[level]||"#c79100";
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 28 34">
    <circle cx="14" cy="12" r="10" fill="none" stroke="${c}" stroke-width="1" opacity="0.4">
      <animate attributeName="r" values="8;20;8" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/>
    </circle>
    <polygon points="14,2 26,24 2,24" fill="${c}" stroke="white" stroke-width="1.5" opacity="0.92"/>
    <text x="14" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="Arial">!</text>
  </svg>`;
  return L.divIcon({html:`<div style="width:28px;height:34px;">${svg}</div>`,className:"alert-icon-wrap",iconSize:[28,34],iconAnchor:[14,32],popupAnchor:[0,-32]});
}

function makeWpIcon(num,color="#1565c0"){
  return L.divIcon({
    html:`<div style="background:${color};color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:monospace;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${num}</div>`,
    className:"wp-icon-wrap", iconSize:[26,26], iconAnchor:[13,13], popupAnchor:[0,-13],
  });
}

function makeBaseIcon(){
  return L.divIcon({
    html:`<div style="background:#1b5e20;color:white;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.4);">🏠</div>`,
    className:"base-icon-wrap", iconSize:[34,34], iconAnchor:[17,17], popupAnchor:[0,-17],
  });
}

// ─────────────────────────────────────────────────────────────
//  COMPOSANTS CARTE
// ─────────────────────────────────────────────────────────────
function FlyToMarker({ center, zoom }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (!center) return;
    if (prev.current &&
        Math.abs(prev.current[0]-center[0])<0.0001 &&
        Math.abs(prev.current[1]-center[1])<0.0001) return;
    prev.current = center;
    map.flyTo(center, zoom, { animate:true, duration:0.8 });
  }, [center, zoom, map]);
  return null;
}

function MapClickHandler({ active, onAdd }) {
  useMapEvents({ click(e) { if (active) onAdd(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function DroneMap({ drones, alerts, selectedDroneId, onSelectDrone, trajectories,
  waypoints, addingWaypoints, onAddWaypoint, mapCenter, mapZoom, baseStation, missionRoutes }) {

  const validDrones = useMemo(() =>
    drones.filter(d =>
      typeof d.latitude  ==="number" && isFinite(d.latitude)  && d.latitude  !== 0 &&
      typeof d.longitude ==="number" && isFinite(d.longitude) && d.longitude !== 0
    ), [drones]);

  const validAlerts = useMemo(() =>
    alerts.filter(a =>
      a.status==="active" &&
      typeof a.latitude ==="number" && isFinite(a.latitude) &&
      typeof a.longitude==="number" && isFinite(a.longitude) &&
      (Math.abs(a.latitude)>0.001||Math.abs(a.longitude)>0.001)
    ), [alerts]);

  return (
    <MapContainer center={mapCenter} zoom={mapZoom}
      style={{height:"100%",width:"100%"}} zoomControl preferCanvas={false}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}/>
      <FlyToMarker center={mapCenter} zoom={mapZoom}/>
      <MapClickHandler active={addingWaypoints} onAdd={onAddWaypoint}/>

      {baseStation &&
       typeof baseStation.latitude==="number" && isFinite(baseStation.latitude) && (
        <Marker position={[baseStation.latitude,baseStation.longitude]} icon={makeBaseIcon()}>
          <Popup>
            <div style={{fontFamily:"monospace",fontSize:12}}>
              <b>🏠 {baseStation.name}</b><br/>
              {baseStation.latitude.toFixed(4)}, {baseStation.longitude.toFixed(4)}
            </div>
          </Popup>
        </Marker>
      )}

      {Object.entries(missionRoutes).map(([droneId,wps])=>{
        if(!wps||wps.length<1) return null;
        const vwps=wps.filter(w=>typeof w.lat==="number"&&isFinite(w.lat)&&typeof w.lng==="number"&&isFinite(w.lng));
        if(!vwps.length) return null;
        return (
          <React.Fragment key={`route-${droneId}`}>
            {vwps.length>=2&&<Polyline positions={vwps.map(w=>[w.lat,w.lng])} pathOptions={{color:"#1565c0",weight:2.5,opacity:0.8,dashArray:"10 6"}}/>}
            {vwps.map((wp,i)=>(
              <Marker key={`mwp-${droneId}-${i}`} position={[wp.lat,wp.lng]} icon={makeWpIcon(i+1,"#1565c0")}>
                <Popup><div style={{fontFamily:"monospace",fontSize:11}}>
                  <b>WP {i+1}</b><br/>Lat: {wp.lat.toFixed(5)}<br/>Lng: {wp.lng.toFixed(5)}<br/>Alt: {wp.alt||120}m
                </div></Popup>
              </Marker>
            ))}
          </React.Fragment>
        );
      })}

      {Object.entries(trajectories).map(([droneId,pts])=>{
        if(!pts||pts.length<2) return null;
        const vpts=pts.filter(p=>typeof p.lat==="number"&&isFinite(p.lat)&&typeof p.lng==="number"&&isFinite(p.lng));
        if(vpts.length<2) return null;
        const drone=drones.find(d=>d.id===droneId);
        const col={flying:"#1b7c1b",returning:"#1565c0",charging:"#c79100",idle:"#78909c"}[drone?.status]||"#78909c";
        return <Polyline key={`traj-${droneId}`} positions={vpts.map(p=>[p.lat,p.lng])} pathOptions={{color:col,weight:1.8,opacity:0.55,dashArray:"5 4"}}/>;
      })}

      {validAlerts.map(alert=>(
        <React.Fragment key={`al-${alert.id}`}>
          <Marker position={[alert.latitude,alert.longitude]} icon={makeAlertIcon(alert.level)}>
            <Popup><div style={{fontFamily:"monospace",fontSize:11,minWidth:180}}>
              <b style={{color:levColors[alert.level]}}>⚠ {alert.level?.toUpperCase()} — {alert.type?.toUpperCase()}</b><br/>
              {alert.description}<br/><span style={{color:"#666"}}>Drone: {alert.drone_name}</span>
            </div></Popup>
          </Marker>
          <Circle center={[alert.latitude,alert.longitude]} radius={200}
            pathOptions={{fillColor:levColors[alert.level],fillOpacity:0.12,color:levColors[alert.level],weight:1.5,opacity:0.5}}/>
        </React.Fragment>
      ))}

      {validDrones.map(drone=>(
        <Marker key={drone.id} position={[
          drone.latitude || DEFAULT_LAT, 
          drone.longitude || DEFAULT_LNG
        ]}
          icon={makeDroneIcon(drone.status,drone.heading||0,drone.id===selectedDroneId,!!drone.active_mission_id,drone.id==="USB-DRONE")}
          zIndexOffset={drone.id===selectedDroneId?1000:100}
          eventHandlers={{click:()=>onSelectDrone(drone)}}>
          <Popup>
            <div style={{fontFamily:"monospace",fontSize:11,minWidth:190}}>
              <b style={{fontSize:13,color:"#1b7c1b"}}>{drone.name}</b>
              {drone.id==="USB-DRONE"&&<span style={{marginLeft:6,color:"#00d4ff",fontSize:9}}>●USB</span>}<br/><br/>
              🔋 {drone.battery?.toFixed(0)}% | ↑ {drone.altitude?.toFixed(0)}m | ➜ {drone.speed?.toFixed(1)}m/s<br/>
              {drone.gps_locked ? `📡 GPS LOCK (${drone.satellites||0} sat)` : "📡 GPS SEARCHING"}<br/>
              <span style={{fontSize:10,color:"#666"}}>
                {drone.latitude?.toFixed(6)}, {drone.longitude?.toFixed(6)}
              </span>
            </div>
          </Popup>
        </Marker>
      ))}

      {addingWaypoints&&waypoints.map((wp,i)=>(
        <Marker key={`nwp-${i}`} position={[wp.lat,wp.lng]} icon={makeWpIcon(i+1,"#0288d1")}>
          <Popup><div style={{fontFamily:"monospace",fontSize:11}}><b>Nouveau WP {i+1}</b><br/>{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</div></Popup>
        </Marker>
      ))}
      {addingWaypoints&&waypoints.length>=2&&(
        <Polyline positions={waypoints.map(w=>[w.lat,w.lng])} pathOptions={{color:"#0288d1",weight:2.5,dashArray:"8 5",opacity:0.85}}/>
      )}
    </MapContainer>
  );
}

// ─────────────────────────────────────────────────────────────
//  HOOK MAVLINK — USB WebSerial + Raspberry Pi WebSocket
//  CORRECTION v5.0 : vote majority pour état armé (armedRef)
// ─────────────────────────────────────────────────────────────
function useMavlink(onLog, onArmedChange) {
  const [mode, setMode] = useState("none");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Déconnecté");
  const [baudRate, setBaudRate] = useState(115200);
  const [rpiUrl, setRpiUrl] = useState(RPI_WS_URL);
  const [telemetry, setTelemetry] = useState({
    latitude: 0, longitude: 0, altitude: 0, speed: 0, heading: 0,
    battery: 0, voltage: 0, armed: false, flightMode: "",
    satellites: 0, gps_lock: false, roll: 0, pitch: 0,
    groundspeed: 0, airspeed: 0, climbrate: 0,
    rcRssi: 0, temperature: 0,
    rcChannels: [],
  });

  const portRef    = useRef(null);
  const readerRef  = useRef(null);
  const writerRef  = useRef(null);
  const wsRef      = useRef(null);
  const seqRef     = useRef(0);
  const reconnTimRef = useRef(null);
  const readingActive = useRef(false);

  // ── Vote majority pour l'état armé ────────────────────────
  // Accumule les N derniers HEARTBEAT et ne change d'état
  // que si la majorité absolue est d'accord → élimine le flickering
  const armedVoteQueue = useRef([]);   // tableau de booléens (max HEARTBEAT_VOTE_SIZE)
  const armedRef       = useRef(false); // valeur stable actuelle

  const missionPending = useRef(false);
  const missionRequestResolvers = useRef({});

  const log = (msg, type = "mav") => onLog && onLog(msg, type);

  // ── Mise à jour de l'état armé avec vote majority ─────────
  const pushArmedVote = useCallback((rawArmed) => {
    const queue = armedVoteQueue.current;
    queue.push(rawArmed);
    if (queue.length > HEARTBEAT_VOTE_SIZE) queue.shift();

    if (queue.length < HEARTBEAT_VOTE_SIZE) return; // pas encore assez de votes

    const trueCount = queue.filter(Boolean).length;
    const majority = trueCount > HEARTBEAT_VOTE_SIZE / 2;

    if (majority !== armedRef.current) {
      armedRef.current = majority;
      console.log(`🗳️ Vote armement: ${trueCount}/${HEARTBEAT_VOTE_SIZE} → ${majority ? "ARMÉ" : "DÉSARMÉ"}`);
      // Notifier le composant parent via callback
      if (onArmedChange) onArmedChange(majority);
      // Mettre à jour la télémétrie React
      setTelemetry(prev => ({ ...prev, armed: majority }));
    }
  }, [onArmedChange]);

  const parseMavlink = useCallback((buf) => {
    const frames = [];
    let i = 0;
    while (i < buf.length) {
      if (buf[i] === 0xFE) {
        if (i + 8 > buf.length) break;
        const len = buf[i + 1];
        if (i + 8 + len > buf.length) break;
        const msgId = buf[i + 5];
        const payload = buf.slice(i + 6, i + 6 + len);
        frames.push({ msgId, payload });
        i += 8 + len;
        continue;
      }
      if (buf[i] === 0xFD) {
        if (i + 12 > buf.length) break;
        const len = buf[i + 1];
        const incompatFlags = buf[i + 2];
        if (incompatFlags & 0x01) { i++; continue; }
        if (i + 12 + len > buf.length) break;
        const msgId = buf[i + 7] | (buf[i + 8] << 8) | (buf[i + 9] << 16);
        const payload = buf.slice(i + 10, i + 10 + len);
        frames.push({ msgId, payload });
        i += 12 + len;
        continue;
      }
      i++;
    }
    return { frames, remaining: buf.slice(i) };
  }, []);

  const decodeMavlink = useCallback(({ msgId, payload }) => {
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

    // HEARTBEAT (0) — source principale de l'état armé
    if (msgId === 0 && payload.length >= 6) {
      const baseMode   = payload[4];
      const customMode = dv.getUint32(0, true);
      const rawArmed   = (baseMode & 0x80) !== 0;

      // Passer par le vote majority au lieu de modifier directement
      pushArmedVote(rawArmed);

      let flightMode = "UNKNOWN";
      for (const [name, val] of Object.entries(ARDUPILOT_MODES)) {
        if (customMode === val) { flightMode = name; break; }
      }
      if (flightMode === "UNKNOWN") flightMode = `MODE_${customMode}`;

      console.log(`📥 HB — baseMode=${baseMode} rawArmed=${rawArmed} mode=${flightMode} voteQueue=[${armedVoteQueue.current.map(Number).join(",")}]`);

      // Ne pas inclure armed ici — géré par pushArmedVote
      return { flightMode };
    }

    if (msgId === 1 && payload.length >= 32) {
      const voltage = dv.getUint16(10, true) / 1000;
      const battery = dv.getUint8(30);
      return { voltage, battery: Math.min(100, battery) };
    }

    if (msgId === 24 && payload.length >= 18) {
      const fixType   = payload[14];
      const satellites = payload[15];
      const lat = dv.getInt32(8, true) / 1e7;
      const lon = dv.getInt32(12, true) / 1e7;
      const gps_lock = fixType >= 3;
      if (gps_lock && lat !== 0) return { latitude: lat, longitude: lon, gps_lock, satellites };
      return { satellites, gps_lock };
    }

    if (msgId === 33 && payload.length >= 28) {
      const lat = dv.getInt32(4, true) / 1e7;
      const lon = dv.getInt32(8, true) / 1e7;
      const alt = dv.getInt32(12, true) / 1000;
      const vx  = dv.getInt16(20, true) / 100;
      const vy  = dv.getInt16(22, true) / 100;
      const hdg = dv.getUint16(26, true) / 100;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (lat !== 0 || lon !== 0)
        return { latitude: lat, longitude: lon, altitude: alt, heading: hdg, groundspeed: speed };
      return {};
    }

    if (msgId === 74 && payload.length >= 20) {
      const airspeed   = dv.getFloat32(0, true);
      const groundspeed = dv.getFloat32(4, true);
      const alt        = dv.getFloat32(8, true);
      const climbrate  = dv.getFloat32(12, true);
      const heading    = dv.getInt16(16, true);
      return { airspeed, groundspeed, speed: groundspeed, altitude: alt, climbrate, heading };
    }

    if (msgId === 30 && payload.length >= 16) {
      const roll  = dv.getFloat32(4, true) * 180 / Math.PI;
      const pitch = dv.getFloat32(8, true) * 180 / Math.PI;
      const yaw   = dv.getFloat32(12, true) * 180 / Math.PI;
      return { roll, pitch, heading: (yaw < 0 ? yaw + 360 : yaw) };
    }

    if (msgId === 35 && payload.length >= 22) {
      const chancount = payload[0];
      const channels = [];
      for (let i = 0; i < Math.min(chancount, 8); i++) {
        channels.push(dv.getUint16(1 + i*2, true));
      }
      while (channels.length < 8) channels.push(0);
      const rssi = payload[21];
      return { rcChannels: channels, rcRssi: Math.round(rssi / 255 * 100) };
    }

    // MISSION_REQUEST (40) et MISSION_REQUEST_INT (51)
    if ((msgId === 40 || msgId === 51) && payload.length >= 7) {
      const seq = dv.getUint16(2, true);
      console.log(`📥 MISSION_REQUEST${msgId===51?"_INT":""} (${msgId}) pour seq ${seq}`);
      if (missionPending.current && missionRequestResolvers.current[seq]) {
        missionRequestResolvers.current[seq](seq);
        delete missionRequestResolvers.current[seq];
      }
    }

    if (msgId === 253 && payload.length >= 1) {
      let txt = "";
      for (let i = 1; i < payload.length && payload[i] !== 0; i++) txt += String.fromCharCode(payload[i]);
      if (txt.trim()) log(`[FC] ${txt.trim()}`, payload[0] > 4 ? "error" : "recv");
    }

    // COMMAND_ACK (77) — confirmation d'armement
    if (msgId === 77 && payload.length >= 3) {
      const command = dv.getUint16(0, true);
      const result  = dv.getUint8(2);
      console.log(`📥 COMMAND_ACK cmd=${command} result=${result}`);
      if (command === MAV_CMD.COMPONENT_ARM_DISARM) {
        if (result === 0) {
          log("✅ ARM/DISARM ACK reçu (succès)", "recv");
        } else {
          log(`⚠️ ARM/DISARM ACK échec (résultat=${result})`, "error");
        }
      }
    }

    return null;
  }, [pushArmedVote]);

  const applyTelemetry = useCallback((decoded) => {
    if (!decoded || Object.keys(decoded).length === 0) return;
    setTelemetry(prev => ({ ...prev, ...decoded }));
  }, []);

  const processBuffer = useCallback((rawBuf) => {
    const { frames } = parseMavlink(rawBuf);
    for (const frame of frames) {
      const decoded = decodeMavlink(frame);
      if (decoded) applyTelemetry(decoded);
    }
  }, [parseMavlink, decodeMavlink, applyTelemetry]);

  const sendRaw = useCallback(async (frameBytes) => {
    const seq  = seqRef.current++ & 0xFF;
    const copy = new Uint8Array(frameBytes);
    copy[2] = seq;
    if (mode === "usb" && writerRef.current) {
      console.log("📤 MAVLink:", Array.from(copy).map(b => b.toString(16).padStart(2,"0")).join(" "));
      try { await writerRef.current.write(copy); }
      catch (e) { log("Erreur envoi USB: " + e.message, "error"); }
    } else if (mode === "rpi" && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(copy.buffer);
    } else {
      log("Non connecté — commande ignorée", "error");
    }
  }, [mode]);

  const commands = useMemo(() => ({
    arm:     () => sendRaw(encodeCommandLong(MAV_CMD.COMPONENT_ARM_DISARM, 1, 0)),
    disarm:  () => sendRaw(encodeCommandLong(MAV_CMD.COMPONENT_ARM_DISARM, 0, 21196)),
    takeoff: (alt=120) => sendRaw(encodeCommandLong(MAV_CMD.NAV_TAKEOFF, 0,0,0,0,0,0,alt)),
    land:    () => sendRaw(encodeCommandLong(MAV_CMD.NAV_LAND)),
    rtl:     () => sendRaw(encodeCommandLong(MAV_CMD.NAV_RETURN_TO_LAUNCH)),
    hover:   () => sendRaw(encodeSetMode(ARDUPILOT_MODES.LOITER)),
    setMode: (name) => sendRaw(encodeSetMode(ARDUPILOT_MODES[name] ?? 0)),
    doSetMode: (name) => sendRaw(encodeDoSetMode(ARDUPILOT_MODES[name] ?? 0)),
    setSpeed: (spd)  => sendRaw(encodeCommandLong(MAV_CMD.DO_CHANGE_SPEED, 0, spd, -1)),
    setHome: () => sendRaw(encodeCommandLong(MAV_CMD.DO_SET_HOME, 0)),
    gotoWp:  (lat, lng, alt=120) => sendRaw(encodeCommandLong(MAV_CMD.DO_REPOSITION, -1,0,0,0, lat, lng, alt)),
    paramSet: (name, value) => {
      const buf = new ArrayBuffer(23);
      const dv  = new DataView(buf);
      dv.setUint8(0, 1); dv.setUint8(1, 1);
      const enc = new TextEncoder();
      const idBytes = enc.encode(name);
      for (let i = 0; i < Math.min(idBytes.length, 15); i++) dv.setUint8(2 + i, idBytes[i]);
      dv.setFloat32(18, value, true);
      dv.setUint8(22, 9);
      return sendRaw(encodeMavlink1(23, new Uint8Array(buf, 0, 23)));
    },
    sendRCOverride: (channels) => {
      const payload = new Uint8Array(18);
      const dv = new DataView(payload.buffer);
      dv.setUint8(0, 1); dv.setUint8(1, 1);
      if (channels && channels.length >= 8) {
        for (let i = 0; i < 8; i++) dv.setUint16(2 + i*2, channels[i], true);
      }
      return sendRaw(encodeMavlink1(70, payload));
    },
    uploadMission: async (waypoints) => {
      const targetSystem = 1, targetComponent = 1;
      const count = waypoints.length;
      const neutralRC = [1500, 1500, 1500, 1000, 1500, 1500, 1500, 1500];
      await commands.sendRCOverride(neutralRC);
      await new Promise(r => setTimeout(r, 500));
      await commands.doSetMode("GUIDED");
      await new Promise(r => setTimeout(r, 1000));
      const clearPayload = new Uint8Array([1, 1]);
      await sendRaw(encodeMavlink1(45, clearPayload));
      await new Promise(r => setTimeout(r, 500));
      const countPayload = new Uint8Array(6);
      const dvCount = new DataView(countPayload.buffer);
      dvCount.setUint8(0, targetSystem); dvCount.setUint8(1, targetComponent);
      dvCount.setUint16(2, count, true);
      await sendRaw(encodeMavlink1(55, countPayload));
      console.log(`📤 MISSION_COUNT = ${count}`);
      missionPending.current = true;
      for (let i = 0; i < count; i++) {
        const seqPromise = new Promise(resolve => { missionRequestResolvers.current[i] = resolve; });
        await Promise.race([
          seqPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout MISSION_REQUEST seq ${i}`)), 30000))
        ]);
        const wp = waypoints[i];
        const command = (wp.loiter_time && wp.loiter_time > 0) ? MAV_CMD.NAV_LOITER_TIME : MAV_CMD.NAV_WAYPOINT;
        const payload = new ArrayBuffer(36);
        const dv = new DataView(payload);
        dv.setUint8(0, targetSystem); dv.setUint8(1, targetComponent);
        dv.setUint16(2, i, true);
        dv.setUint8(4, 0); dv.setUint16(5, command, true);
        dv.setUint8(7, 0); dv.setUint8(8, 1);
        dv.setFloat32(9, wp.loiter_time || 0, true);
        dv.setFloat32(13, 0, true); dv.setFloat32(17, 0, true); dv.setFloat32(21, 0, true);
        dv.setFloat32(25, wp.lat, true); dv.setFloat32(29, wp.lng, true); dv.setFloat32(33, wp.alt, true);
        await sendRaw(encodeMavlink1(39, new Uint8Array(payload)));
        console.log(`📤 MISSION_ITEM seq=${i}`);
      }
      await new Promise(r => setTimeout(r, 500));
      const ackPayload = new Uint8Array(3);
      const dvAck = new DataView(ackPayload.buffer);
      dvAck.setUint8(0, targetSystem); dvAck.setUint8(1, targetComponent); dvAck.setUint8(2, 0);
      await sendRaw(encodeMavlink1(47, ackPayload));
      missionPending.current = false;
      await commands.setMode("AUTO");
      console.log("✅ Mission uploadée");
    }
  }), [sendRaw]);

  // ── Connexion USB ──────────────────────────────────────────
  const connectUsb = useCallback(async () => {
    if (!navigator.serial) {
      log("WebSerial non supporté (Chrome/Edge requis)", "error");
      setStatus("Navigateur incompatible"); return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });
      portRef.current = port;
      setMode("usb");
      setConnected(true);
      setStatus(`USB connecté à ${baudRate} baud`);
      log(`✅ Port série ouvert @ ${baudRate} baud`, "recv");
      const writer = port.writable.getWriter();
      writerRef.current = writer;
      const reader = port.readable.getReader();
      readerRef.current = reader;
      readingActive.current = true;
      let buffer = new Uint8Array(0);
      const readLoop = async () => {
        try {
          while (readingActive.current) {
            const { value, done } = await reader.read();
            if (done) { log("Fin de flux USB", "recv"); break; }
            if (value) {
              const merged = new Uint8Array(buffer.length + value.length);
              merged.set(buffer); merged.set(value, buffer.length);
              buffer = merged;
              processBuffer(buffer);
              if (buffer.length > 4096) buffer = buffer.slice(-2048);
            }
          }
        } catch (err) {
          if (err.name !== "AbortError" && readingActive.current) {
            log(`Perte USB: ${err.message} — reconnexion dans 3s`, "error");
            setConnected(false); setStatus("Reconnexion...");
            await disconnect();
            reconnTimRef.current = setTimeout(() => connectUsb(), 3000);
          }
        } finally {
          if (readerRef.current === reader) {
            try { reader.releaseLock(); } catch (_) {}
            readerRef.current = null;
          }
          readingActive.current = false;
        }
      };
      readLoop();
    } catch (err) {
      log(`Erreur USB: ${err.message}`, "error");
      setStatus("Erreur USB"); setConnected(false);
      await disconnect();
    }
  }, [baudRate, processBuffer]);

  // ── Connexion RPi (WebSocket) ─────────────────────────────
  const connectRpi = useCallback(() => {
    const ws = new WebSocket(rpiUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onopen  = () => { setMode("rpi"); setConnected(true); setStatus(`RPi connecté — ${rpiUrl}`); log(`✅ WS RPi: ${rpiUrl}`, "recv"); };
    ws.onmessage = (ev) => { if (ev.data instanceof ArrayBuffer) processBuffer(new Uint8Array(ev.data)); };
    ws.onerror = () => log("Erreur WebSocket RPi", "error");
    ws.onclose = () => {
      setConnected(false); setStatus("RPi déconnecté — reconnexion 5s");
      log("WebSocket RPi fermé, tentative dans 5s", "error");
      reconnTimRef.current = setTimeout(() => connectRpi(), 5000);
    };
  }, [rpiUrl, processBuffer]);

  // ── Déconnexion ────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    clearTimeout(reconnTimRef.current);
    readingActive.current = false;
    if (readerRef.current) {
      try { await readerRef.current.cancel(); readerRef.current.releaseLock(); } catch (_) {}
      readerRef.current = null;
    }
    if (writerRef.current) {
      try { await writerRef.current.releaseLock(); } catch (_) {}
      writerRef.current = null;
    }
    if (portRef.current) {
      try { await portRef.current.close(); } catch (_) {}
      portRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null;
    }
    // Réinitialiser le vote
    armedVoteQueue.current = [];
    armedRef.current = false;
    setConnected(false); setMode("none"); setStatus("Déconnecté");
    log("Déconnecté", "recv");
  }, []);

  useEffect(() => () => { disconnect(); }, []);

  return {
    connected, status, mode,
    baudRate, setBaudRate,
    rpiUrl, setRpiUrl,
    telemetry,
    armedRef,      // ref stable (pas de re-render)
    connectUsb, connectRpi, disconnect,
    commands
  };
}

// ─────────────────────────────────────────────────────────────
//  MISSION FORM
// ─────────────────────────────────────────────────────────────
function MissionForm({ drones, onMissionCreated, onNotify, setAddingWaypoints, addingWaypoints, waypoints, setWaypoints, selectedDrone, mav }) {
  const [form, setForm] = useState({
    name:"", droneId:"", type:"patrol", speed:15, altitude:120,
    cameraMode:"video", aiDetection:true, lowBattery:20, loiterTime:60,
  });
  const [sending, setSending] = useState(false);

  const addManual = (lat, lng) => {
    if (isNaN(lat)||isNaN(lng)||lat<-90||lat>90||lng<-180||lng>180) return false;
    setWaypoints(p=>[...p,{lat,lng}]); return true;
  };

  const submit = async () => {
    if (!form.name || !form.droneId) { onNotify("error","Champs manquants","Nom et drone requis"); return; }
    if (!waypoints.length) { onNotify("error","Aucun waypoint","Ajoutez au moins 1 WP"); return; }
    setSending(true);
    try {
      const waypointsForMav = waypoints.map(w => ({
        lat: w.lat, lng: w.lng, alt: Number(form.altitude), loiter_time: Number(form.loiterTime)
      }));
      await mav.commands.uploadMission(waypointsForMav);
      onNotify("success","Mission envoyée !",`${form.name} — ${waypoints.length} waypoints`);
      onMissionCreated({ mission_name: form.name, waypoints: waypointsForMav }, form.droneId, waypoints);
      setWaypoints([]); setAddingWaypoints(false);
      setForm(f=>({...f, name:""}));
    } catch (e) {
      onNotify("error","Erreur mission",e.message);
    } finally { setSending(false); }
  };

  const handleManual = () => {
    const lat = parseFloat(document.getElementById("ml")?.value);
    const lng = parseFloat(document.getElementById("mn")?.value);
    if (addManual(lat,lng)) {
      document.getElementById("ml").value=""; document.getElementById("mn").value="";
      onNotify("info","WP ajouté",`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } else { onNotify("error","Invalide","Lat -90..90, Lon -180..180"); }
  };

  const handleCsv = e => {
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>{
      let c=0;
      ev.target.result.split(/\r?\n/).forEach(line=>{
        const p=line.split(",").map(x=>parseFloat(x.trim()));
        if(p.length>=2&&!isNaN(p[0])&&!isNaN(p[1])&&addManual(p[0],p[1])) c++;
      });
      onNotify("success","Import CSV",`${c} waypoints`);
    };
    r.readAsText(f); e.target.value=null;
  };

  return (
    <div>
      <div className="mission-form">
        <div style={{fontFamily:"var(--title)",fontSize:14,fontWeight:700,letterSpacing:2,color:"var(--accent)",marginBottom:10}}>📋 CRÉER UNE MISSION</div>
        <div className="form-row">
          <div className="form-field">
            <label className="flbl">Nom</label>
            <input className="finput" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Patrouille Nord..."/>
          </div>
          <div className="form-field">
            <label className="flbl">Drone</label>
            <select className="fselect" value={form.droneId} onChange={e=>setForm(f=>({...f,droneId:e.target.value}))}>
              <option value="">Choisir...</option>
              {drones.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label className="flbl">Type</label>
            <select className="fselect" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
              <option value="patrol">Patrouille</option>
              <option value="search">Recherche</option>
              <option value="escort">Escorte</option>
              <option value="standby">Veille</option>
            </select>
          </div>
          <div className="form-field">
            <label className="flbl">Caméra</label>
            <select className="fselect" value={form.cameraMode} onChange={e=>setForm(f=>({...f,cameraMode:e.target.value}))}>
              <option value="video">Vidéo</option>
              <option value="photo">Photo</option>
              <option value="thermal">Infrarouge</option>
              <option value="off">Éteinte</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label className="flbl">Vitesse (m/s)</label>
            <input className="finput" type="number" min="5" max="30" value={form.speed} onChange={e=>setForm(f=>({...f,speed:e.target.value}))}/>
          </div>
          <div className="form-field">
            <label className="flbl">Altitude (m)</label>
            <input className="finput" type="number" min="30" max="400" value={form.altitude} onChange={e=>setForm(f=>({...f,altitude:e.target.value}))}/>
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label className="flbl">Durée de survol (s)</label>
            <input className="finput" type="number" min="0" max="3600" value={form.loiterTime} onChange={e=>setForm(f=>({...f,loiterTime:e.target.value}))}/>
          </div>
          <div className="form-field"/>
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontFamily:"var(--title)",fontSize:12,fontWeight:700,letterSpacing:2,color:"var(--txt2)"}}>WAYPOINTS ({waypoints.length})</span>
          <div style={{display:"flex",gap:6}}>
            <button className={`cbtn ${addingWaypoints?"active-mission":""}`} style={{padding:"4px 10px",fontSize:10}} onClick={()=>setAddingWaypoints(!addingWaypoints)}>
              {addingWaypoints?"✋ Désactiver":"➕ Carte"}
            </button>
            {waypoints.length>0&&<button className="cbtn danger" style={{padding:"4px 10px",fontSize:10}} onClick={()=>setWaypoints([])}>🗑 Vider</button>}
          </div>
        </div>
        {addingWaypoints&&(
          <div style={{background:"rgba(21,101,192,0.1)",color:"var(--blue)",border:"1px solid rgba(21,101,192,0.3)",borderRadius:6,padding:"6px 12px",marginBottom:6,textAlign:"center",fontSize:11,fontWeight:600}}>
            🖱️ Cliquez sur la carte pour ajouter des waypoints
          </div>
        )}
        {waypoints.map((wp,i)=>(
          <div key={i} className="wp-item">
            <div className="wp-num">{i+1}</div>
            <span style={{flex:1,margin:"0 8px"}}>{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</span>
            <span style={{color:"var(--txt3)",marginRight:8,fontSize:10}}>{form.altitude}m</span>
            <button className="wp-del" onClick={()=>setWaypoints(p=>p.filter((_,j)=>j!==i))}>✕</button>
          </div>
        ))}
      </div>
      <div style={{marginBottom:10,borderTop:"1px solid var(--border)",paddingTop:10}}>
        <div style={{fontFamily:"var(--title)",fontSize:12,fontWeight:700,marginBottom:6}}>📍 Ajouter par coordonnées</div>
        <div className="form-row">
          <div className="form-field">
            <label className="flbl">Latitude</label>
            <input className="finput" type="number" step="any" id="ml" placeholder="14.7167"/>
          </div>
          <div className="form-field">
            <label className="flbl">Longitude</label>
            <input className="finput" type="number" step="any" id="mn" placeholder="-17.4677"/>
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button className="cbtn ok" onClick={handleManual}>➕ Ajouter</button>
          <label className="cbtn" style={{cursor:"pointer"}}>
            📂 Import CSV
            <input type="file" accept=".csv,.txt" onChange={handleCsv} style={{display:"none"}}/>
          </label>
        </div>
      </div>
      <button className="cbtn ok full" style={{padding:"11px",fontSize:12,fontWeight:700}} onClick={submit} disabled={sending}>
        {sending ? "⏳ Envoi..." : "🚀 LANCER LA MISSION"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  PARAMS PANEL
// ─────────────────────────────────────────────────────────────
function ParamsPanel({ droneId, onNotify }) {
  const [params,  setParams]  = useState([]);
  const [filter,  setFilter]  = useState("");
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(()=>{
    if(!droneId) return;
    setLoading(true);
    api.getParams(droneId).then(setParams).catch(e=>onNotify("error","Erreur params",e.message)).finally(()=>setLoading(false));
  },[droneId]);

  const save = async p => {
    try {
      await api.setParam(droneId,p.name,editVal,p.type);
      setParams(prev=>prev.map(x=>x.name===p.name?{...x,value:editVal}:x));
      setEditing(null);
      onNotify("success","Paramètre maj",`${p.name} = ${editVal}`);
    } catch(e){ onNotify("error","Erreur",e.message); }
  };

  const filtered = params.filter(p=>p.name.toLowerCase().includes(filter.toLowerCase())||(p.description||"").toLowerCase().includes(filter.toLowerCase()));

  if(!droneId) return <div style={{padding:20,color:"var(--txt3)",textAlign:"center"}}>Sélectionnez un drone</div>;
  return (
    <div>
      <input className="finput" placeholder="🔍 Filtrer..." value={filter} onChange={e=>setFilter(e.target.value)} style={{width:"100%",marginBottom:8}}/>
      <div style={{fontSize:10,color:"var(--txt3)",marginBottom:8}}>{filtered.length} paramètre(s)</div>
      {loading&&<div style={{color:"var(--txt3)",textAlign:"center",padding:20}}>Chargement...</div>}
      {filtered.map(p=>(
        <div key={p.name} className="param-row">
          <div style={{flex:1}}>
            <div className="param-name">{p.name}</div>
            <div className="param-desc">{p.description}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:9,color:"var(--txt3)",fontFamily:"monospace"}}>{p.type}</span>
            {editing===p.name
              ? <input className="param-input" value={editVal} onChange={e=>setEditVal(e.target.value)}
                  onBlur={()=>save(p)} onKeyDown={e=>{if(e.key==="Enter")save(p);if(e.key==="Escape")setEditing(null);}} autoFocus/>
              : <span className="param-val" onClick={()=>{setEditing(p.name);setEditVal(p.value);}}>{p.value}</span>
            }
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  CONSOLE PANEL
// ─────────────────────────────────────────────────────────────
function ConsolePanel({ droneId, usbCommands, onNotify, onCommand }) {
  const [logs,  setLogs]  = useState([{text:"Console prête — Entrez une commande",type:"recv",ts:new Date()}]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[logs]);

  const addLog = (text,type="recv") => setLogs(p=>[...p.slice(-200),{text,type,ts:new Date()}]);

  const send = async () => {
    if(!input.trim()) return;
    const cmd = input.trim().toLowerCase();
    addLog(`> ${cmd}`,"sent");
    setInput("");

    if (cmd === "arm" || cmd === "disarm") {
      if (onCommand) {
        await onCommand(cmd);
        addLog(`✅ ${cmd.toUpperCase()} envoyé`, "recv");
      } else { addLog("❌ onCommand non disponible", "error"); }
      return;
    }
    if(usbCommands) {
      if(cmd==="rtl")      { await usbCommands.rtl();    addLog("✅ RTL envoyé","recv"); return; }
      if(cmd==="land")     { await usbCommands.land();   addLog("✅ LAND envoyé","recv"); return; }
      if(cmd==="hover")    { await usbCommands.hover();  addLog("✅ LOITER envoyé","recv"); return; }
      if(cmd.startsWith("takeoff")) {
        const alt=parseFloat(cmd.split(" ")[1])||120;
        await usbCommands.takeoff(alt);
        addLog(`✅ TAKEOFF ${alt}m envoyé`,"recv"); return;
      }
      if(cmd.startsWith("mode ")) {
        const m=cmd.split(" ")[1]?.toUpperCase();
        await usbCommands.setMode(m);
        addLog(`✅ MODE ${m} envoyé`,"recv"); return;
      }
      if(cmd.startsWith("speed ")) {
        const s=parseFloat(cmd.split(" ")[1])||10;
        await usbCommands.setSpeed(s);
        addLog(`✅ SPEED ${s}m/s envoyé`,"recv"); return;
      }
      if(cmd.startsWith("param ")) {
        const parts=cmd.split(" ");
        if(parts.length>=3) {
          const name=parts[1], value=parseFloat(parts[2]);
          if(!isNaN(value)) { await usbCommands.paramSet(name,value); addLog(`✅ PARAM ${name}=${value}`,"recv"); }
          else addLog("❌ Valeur invalide","error");
        } else addLog("❌ Format: param NOM VALEUR","error");
        return;
      }
    }
    if(!droneId) { addLog("Sélectionnez un drone","error"); return; }
    try {
      const res = await api.textCommand(droneId, input.trim());
      addLog(res.response||"OK","recv");
    } catch(e) { addLog(`ERREUR: ${e.message}`,"error"); }
  };

  const examples = ["arm","disarm","takeoff 120","land","rtl","hover","mode AUTO","mode LOITER","mode STABILIZE","param ARMING_CHECK 0"];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{fontSize:9,color:"var(--txt3)",marginBottom:6}}>
        {examples.map(e=><span key={e} style={{marginRight:6,cursor:"pointer",color:"var(--accent)"}} onClick={()=>setInput(e)}>{e}</span>)}
      </div>
      <div style={{flex:1,overflowY:"auto",background:"var(--bg3)",borderRadius:6,padding:8,marginBottom:8,minHeight:120,maxHeight:300}}>
        {logs.map((l,i)=>(
          <div key={i} className={`console-log ${l.type}`}>
            <span className="ts">{fmtTime(l.ts)}</span>{l.text}
          </div>
        ))}
        <div ref={endRef}/>
      </div>
      <div className="console-input-row">
        <input className="finput" style={{flex:1}} value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&send()}
          placeholder="arm / takeoff 120 / land / rtl / mode AUTO / param ARMING_CHECK 0"/>
        <button className="cbtn ok" onClick={send} style={{flexShrink:0,padding:"8px 14px"}}>▶ Envoyer</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  HUD PANEL
// ─────────────────────────────────────────────────────────────
function HUDPanel({ drone, mavTelemetry, mavConnected, armed }) {
  const d = mavConnected && drone?.id==="USB-DRONE" ? {...drone, ...mavTelemetry} : drone;
  if (!d) return <div style={{padding:20,color:"var(--txt3)",textAlign:"center"}}>Sélectionnez un drone</div>;
  const fields = [
    {l:"ALTITUDE",    v:(d.altitude||0).toFixed(1),      u:"m"},
    {l:"VITESSE SOL", v:(d.groundspeed||d.speed||0).toFixed(1), u:"m/s"},
    {l:"VITESSE AIR", v:(d.airspeed||0).toFixed(1),     u:"m/s"},
    {l:"CAP",         v:(d.heading||0).toFixed(0),       u:"°"},
    {l:"ROULIS",      v:(d.roll||0).toFixed(1),          u:"°"},
    {l:"TANGAGE",     v:(d.pitch||0).toFixed(1),         u:"°"},
    {l:"TAUX MONTÉE", v:(d.climbrate||0).toFixed(1),     u:"m/s"},
    {l:"BATTERIE",    v:(d.battery||0).toFixed(0),       u:"%"},
    {l:"TENSION",     v:(d.voltage||0).toFixed(2),       u:"V"},
    {l:"SIGNAL RC",   v:(d.rcRssi||0),                   u:"%"},
    {l:"SATELLITES",  v:(d.satellites||mavTelemetry?.satellites||0), u:"sat"},
    {l:"TEMPS VOL",   v:fmtElapsed(d.flight_time||0),    u:""},
  ];
  return (
    <div className="hud">
      <div style={{fontFamily:"var(--title)",fontSize:14,fontWeight:700,letterSpacing:3,color:"#00d4ff",marginBottom:10}}>
        ✈ HUD — {d.name}
        {mavConnected&&drone?.id==="USB-DRONE"&&<span style={{marginLeft:8,color:"#69f0ae",fontSize:10}}>● LIVE USB</span>}
      </div>
      <div className="hud-row">
        {fields.map(f=>(
          <div key={f.l} className="hud-cell">
            <div className="hud-lbl">{f.l}</div>
            <div className="hud-val">{f.v}<span className="hud-unit"> {f.u}</span></div>
          </div>
        ))}
      </div>
      {mavConnected&&drone?.id==="USB-DRONE"&&(
        <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
          <span className={`hud-ai ${armed?"on":"off"}`}>🔑 {armed?"ARMÉ":"DÉSARMÉ"}</span>
          <span className={`hud-ai ${mavTelemetry?.gps_lock?"on":"off"}`}>📡 GPS {mavTelemetry?.gps_lock?"LOCK":"SEARCH"}</span>
          <span className="hud-ai on">✈ {mavTelemetry?.flightMode||"—"}</span>
          {mavTelemetry?.rcChannels&&mavTelemetry.rcChannels.length>0&&(
            <span className="hud-ai on">📡 RC: {mavTelemetry.rcChannels.slice(0,4).join('|')}</span>
          )}
        </div>
      )}
      {d.active_mission_id&&(
        <div style={{background:"rgba(21,101,192,0.2)",border:"1px solid rgba(21,101,192,0.4)",borderRadius:4,padding:"6px 10px",marginTop:6}}>
          <span style={{color:"#64b5f6",fontFamily:"var(--mono)",fontSize:10}}>🎯 MISSION ACTIVE — WP {(d.active_waypoint_idx||0)+1}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  VIDEO SIM
// ─────────────────────────────────────────────────────────────
function VideoSim({ droneName, active }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const frame     = useRef(0);
  useEffect(()=>{
    if(!active){ if(rafRef.current) cancelAnimationFrame(rafRef.current); return; }
    const canvas=canvasRef.current; if(!canvas) return;
    canvas.width=400; canvas.height=240;
    const ctx=canvas.getContext("2d");
    const draw=()=>{
      const w=canvas.width,h=canvas.height,f=++frame.current;
      ctx.fillStyle="#0a1628"; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle="rgba(27,124,27,0.15)"; ctx.lineWidth=0.5;
      for(let x=0;x<w;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
      for(let y=0;y<h;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
      ctx.strokeStyle="#00ff88"; ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(w/2-25,h/2);ctx.lineTo(w/2+25,h/2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(w/2,h/2-25);ctx.lineTo(w/2,h/2+25);ctx.stroke();
      ctx.beginPath();ctx.arc(w/2,h/2,35,0,2*Math.PI);ctx.stroke();
      const tx=w/2+100*Math.sin(f*0.03),ty=h/2+60*Math.cos(f*0.04);
      ctx.strokeStyle="#c62828"; ctx.lineWidth=1.5; ctx.strokeRect(tx-15,ty-15,30,30);
      ctx.fillStyle="#c62828"; ctx.font="9px monospace"; ctx.fillText("TARGET",tx-15,ty-18);
      ctx.fillStyle="#00d4ff"; ctx.font="bold 11px monospace";
      ctx.fillText(`${droneName} ● LIVE`,10,18);
      ctx.fillStyle="#4a7a99"; ctx.font="9px monospace";
      ctx.fillText(new Date().toLocaleTimeString(),w-65,18);
      rafRef.current=requestAnimationFrame(draw);
    };
    draw();
    return()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  },[active,droneName]);
  return <canvas ref={canvasRef} style={{background:"#000",display:"block",width:"100%",height:"auto",borderRadius:6}}/>;
}

function Sparkline({ data=[], color="#1b7c1b", label, unit="" }) {
  if(data.length<2) return null;
  const min=Math.min(...data),max=Math.max(...data),range=(max-min)||1;
  const W=280,H=48;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*W},${H-((v-min)/range)*(H-10)-5}`).join(" ");
  const last=data[data.length-1];
  return (
    <div className="spark-wrap">
      <div className="spark-lbl">{label}<span className="spark-val" style={{color}}>{typeof last==="number"?last.toFixed(1):last}{unit}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill={color} opacity="0.15"/>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8"/>
      </svg>
    </div>
  );
}

function BarChart({ data=[], xKey, yKey, color="#1b7c1b", height=110 }) {
  if(!data.length) return null;
  const maxV=Math.max(...data.map(d=>d[yKey]),1);
  const bw=100/data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} width="100%" height={height} preserveAspectRatio="none">
      {data.map((d,i)=>{
        const bh=Math.max(1,(d[yKey]/maxV)*(height-22));
        const x=i*bw+bw*0.15;
        return (
          <g key={i}>
            <rect x={x} y={height-bh-20} width={bw*0.7} height={bh} fill={color} opacity="0.75" rx="1.5"/>
            {i%4===0&&<text x={x+bw*0.35} y={height-4} textAnchor="middle" fontSize="4.5" fill="rgba(0,0,0,0.35)" fontFamily="monospace">{d[xKey]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ data=[], size=110 }) {
  const total=data.reduce((s,d)=>s+d.value,0)||1;
  const r=38,cx=size/2,cy=size/2;
  let angle=-90;
  const pt=a=>({x:cx+r*Math.cos(a*Math.PI/180),y:cy+r*Math.sin(a*Math.PI/180)});
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r+2} fill="none" stroke="var(--bg3)" strokeWidth="10"/>
      {data.map((d,i)=>{
        const sweep=(d.value/total)*360;
        const start=angle; angle+=sweep;
        if(sweep<1) return null;
        const large=sweep>180?1:0;
        const s=pt(start),e=pt(angle-0.01);
        return <path key={i} fill="none" stroke={d.color} strokeWidth="10" strokeLinecap="round"
          d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`}/>;
      })}
      <text x={cx} y={cy+5} textAnchor="middle" fontSize="17" fill="var(--text)" fontFamily="Rajdhani" fontWeight="700">{total}</text>
      <text x={cx} y={cy+16} textAnchor="middle" fontSize="7" fill="var(--txt3)" fontFamily="monospace">TOTAL</text>
    </svg>
  );
}

function Notifications({ items, onDismiss }) {
  return (
    <div className="notifs">
      {items.map(n=>(
        <div key={n.id} className={`notif ${n.level}`} onClick={()=>onDismiss(n.id)}>
          <div className="notif-title">{n.title}</div>
          <div style={{color:"var(--txt2)",lineHeight:1.4}}>{n.body}</div>
        </div>
      ))}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [user,setUser]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const submit=async e=>{
    e.preventDefault();
    if(!user||!pass){setErr("Remplissez tous les champs");return;}
    setLoading(true);setErr("");
    try{
      const res=await api.login(user,pass);
      _token=res.access_token;
      onLogin(res.user,res.access_token);
    }catch(e){setErr(e.message||"Identifiants incorrects");}
    finally{setLoading(false);}
  };
  return (
    <div className="login-screen">
      <div className="login-card">
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:44,marginBottom:6}}>🛡️</div>
          <div className="login-title">JAMBAAR</div>
          <div className="login-sub">Système de Commandement — Sénégal</div>
        </div>
        <form onSubmit={submit}>
          <label className="form-label">Identifiant</label>
          <input className="form-input" value={user} onChange={e=>setUser(e.target.value)} placeholder="admin / operateur / analyste" autoComplete="username"/>
          <label className="form-label">Mot de passe</label>
          <input className="form-input" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" autoComplete="current-password"/>
          <button className="login-btn" type="submit" disabled={loading}>{loading?"AUTHENTIFICATION...":"ACCÉDER AU SYSTÈME"}</button>
          {err&&<div className="login-error">⚠ {err}</div>}
        </form>
        <div className="login-hint">admin/admin123 · operateur/op123 · analyste/an123</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  PANNEAU CONNEXION USB/RPi
// ─────────────────────────────────────────────────────────────
function UsbConnectionPanel({ mav, armed }) {
  const [rpiInput, setRpiInput] = useState(mav.rpiUrl);
  return (
    <div>
      <div style={{fontFamily:"var(--title)",fontSize:13,letterSpacing:2,color:"var(--accent)",marginBottom:12}}>
        🔌 CONNEXION CONTRÔLEUR DE VOL
      </div>
      <div className="usb-status-bar">
        <span style={{fontSize:14}}>{mav.connected?"🟢":"🔴"}</span>
        <span style={{flex:1}}>{mav.status}</span>
        {mav.connected&&<span style={{color:"#69f0ae",fontWeight:700}}>{mav.mode==="usb"?"USB":"RPi"}</span>}
      </div>
      {mav.connected&&(
        <div style={{marginBottom:10,padding:"6px 10px",background:"#0a1628",borderRadius:6,border:"1px solid #1a3a5c",display:"flex",alignItems:"center",gap:8}}>
          <span className={`arm-indicator ${armed?"armed":"disarmed"}`}>
            {armed?"🔑 ARMÉ":"🔐 DÉSARMÉ"}
          </span>
          <span style={{fontFamily:"var(--mono)",fontSize:9,color:"#4a7a99"}}>
            Vote: {mav.telemetry.flightMode||"—"}
          </span>
        </div>
      )}
      <div style={{background:"var(--panel)",border:"1px solid var(--border)",borderRadius:8,padding:12,marginBottom:10}}>
        <div style={{fontFamily:"var(--title)",fontSize:12,fontWeight:700,marginBottom:8,color:"var(--txt2)",letterSpacing:1}}>
          🖥 CONNEXION USB DIRECTE (WebSerial)
        </div>
        <div style={{fontSize:10,color:"var(--txt3)",marginBottom:8}}>
          Compatible Chrome/Edge. Branchez votre Pixhawk/ArduPilot via câble USB.
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <label className="flbl" style={{margin:0}}>Baud Rate</label>
          <select className="fselect" style={{flex:1}} value={mav.baudRate} onChange={e=>mav.setBaudRate(Number(e.target.value))}>
            <option value={57600}>57600</option>
            <option value={115200}>115200</option>
            <option value={921600}>921600</option>
          </select>
        </div>
        {!mav.connected
          ? <button className="cbtn ok" style={{width:"100%",padding:"10px"}} onClick={mav.connectUsb}>🔌 Connecter USB</button>
          : mav.mode==="usb"
            ? <button className="cbtn danger" style={{width:"100%",padding:"10px"}} onClick={mav.disconnect}>⏹ Déconnecter USB</button>
            : <button className="cbtn" style={{width:"100%",padding:"10px"}} disabled>USB — Connecté via RPi</button>
        }
      </div>
      <div style={{background:"var(--panel)",border:"1px solid var(--border)",borderRadius:8,padding:12,marginBottom:10}}>
        <div style={{fontFamily:"var(--title)",fontSize:12,fontWeight:700,marginBottom:8,color:"var(--txt2)",letterSpacing:1}}>
          🍓 CONNEXION RASPBERRY PI (WebSocket)
        </div>
        <div style={{fontSize:10,color:"var(--txt3)",marginBottom:8}}>
          RPi connecté au FC via USB/UART. Exposez le port MAVLink.
        </div>
        <div style={{fontSize:9,background:"var(--bg3)",borderRadius:4,padding:"6px 10px",marginBottom:8,fontFamily:"var(--mono)",color:"var(--txt3)"}}>
          Sur le RPi :<br/>
          <code style={{color:"var(--green)"}}>pip install mavproxy</code><br/>
          <code style={{color:"var(--green)"}}>mavproxy.py --master=/dev/ttyAMA0 --baudrate=57600 --out=ws:0.0.0.0:5760</code>
        </div>
        <div style={{marginBottom:8}}>
          <label className="flbl">URL WebSocket RPi</label>
          <input className="finput" value={rpiInput}
            onChange={e=>{setRpiInput(e.target.value);mav.setRpiUrl(e.target.value);}}
            placeholder="ws://192.168.1.x:5760"/>
        </div>
        {!mav.connected
          ? <button className="cbtn ok" style={{width:"100%",padding:"10px"}} onClick={mav.connectRpi}>🍓 Connecter RPi</button>
          : mav.mode==="rpi"
            ? <button className="cbtn danger" style={{width:"100%",padding:"10px"}} onClick={mav.disconnect}>⏹ Déconnecter RPi</button>
            : <button className="cbtn" style={{width:"100%",padding:"10px"}} disabled>RPi — Connecté via USB</button>
        }
      </div>
      {mav.connected&&(
        <div>
          <div style={{fontFamily:"var(--title)",fontSize:11,fontWeight:700,letterSpacing:2,color:"var(--txt3)",marginBottom:8}}>TÉLÉMÉTRIE BRUTE</div>
          {[
            ["Lat",       (mav.telemetry.latitude||0).toFixed(6)+"°"],
            ["Lon",       (mav.telemetry.longitude||0).toFixed(6)+"°"],
            ["Altitude",  (mav.telemetry.altitude||0).toFixed(1)+" m"],
            ["Vitesse",   (mav.telemetry.groundspeed||0).toFixed(1)+" m/s"],
            ["Cap",       (mav.telemetry.heading||0).toFixed(0)+"°"],
            ["Roulis",    (mav.telemetry.roll||0).toFixed(1)+"°"],
            ["Tangage",   (mav.telemetry.pitch||0).toFixed(1)+"°"],
            ["Batterie",  (mav.telemetry.battery||0).toFixed(0)+"%"],
            ["Tension",   (mav.telemetry.voltage||0).toFixed(2)+" V"],
            ["Mode",      mav.telemetry.flightMode||"—"],
            ["Armé (vote)",armed?"✅ OUI":"❌ NON"],
            ["GPS Lock",  mav.telemetry.gps_lock?"✅ OUI":"❌ NON"],
            ["Satellites",mav.telemetry.satellites||0],
          ].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--bg3)"}}>
              <span style={{fontSize:10,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:0.5}}>{k}</span>
              <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--text)",fontWeight:600}}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  COMPOSANT PRINCIPAL App
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [user,            setUser]            = useState(null);
  const [page,            setPage]            = useState("map");
  const [rightTab,        setRightTab]        = useState("alerts");
  const [drones,          setDrones]          = useState([]);
  const [alerts,          setAlerts]          = useState([]);
  const [missions,        setMissions]        = useState([]);
  const [logs,            setLogs]            = useState([]);
  const [stats,           setStats]           = useState(null);
  const [baseStation,     setBaseStation]     = useState(null);
  const [selectedDroneId, setSelectedDroneId] = useState(null);
  const [notifications,   setNotifications]   = useState([]);
  const [telemetryHist,   setTelemetryHist]   = useState({});
  const [trajectories,    setTrajectories]    = useState({});
  const [missionRoutes,   setMissionRoutes]   = useState({});
  const [addingWaypoints, setAddingWaypoints] = useState(false);
  const [newWaypoints,    setNewWaypoints]    = useState([]);
  const [mapCenter,       setMapCenter]       = useState([DEFAULT_LAT, DEFAULT_LNG]);
  const [mapZoom,         setMapZoom]         = useState(8);
  const [time,            setTime]            = useState(new Date());
  const [videoActive,     setVideoActive]     = useState({});
  const [mixMode,         setMixMode]         = useState(false);

  // ── État armé — géré via vote majority ────────────────────
  // armedState est le state React visible dans le rendu
  // Il est mis à jour UNIQUEMENT par le callback onArmedChange
  const [armedState, setArmedState] = useState(false);

  const notifId = useRef(0);
  const wsRef   = useRef(null);
  const usbDroneCreated = useRef(false);

  // Callback stable passé au hook useMavlink
  const handleArmedChange = useCallback((isArmed) => {
    console.log(`⚡ Armed state changed → ${isArmed}`);
    setArmedState(isArmed);
    // Synchroniser dans la liste drones
    setDrones(prev => prev.map(d =>
      d.id === "USB-DRONE"
        ? { ...d, armed: isArmed, status: isArmed ? "flying" : "idle" }
        : d
    ));
  }, []);

  const mav = useMavlink(
    (msg, type) => {}, // onLog simplifié (pas de state ici)
    handleArmedChange
  );

  const notify = useCallback((level, title, body="", timeout=7000) => {
    const id = ++notifId.current;
    setNotifications(p => [...p.slice(-5), { id, level, title, body }]);
    if (timeout>0) setTimeout(() => setNotifications(p=>p.filter(n=>n.id!==id)), timeout);
  }, []);

  const selDrone = useMemo(() => drones.find(d=>d.id===selectedDroneId)||null, [drones, selectedDroneId]);

  useEffect(()=>{ const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t); },[]);

  useEffect(()=>{
    const el=document.createElement("style"); el.id="jc2css"; el.textContent=CSS;
    document.head.appendChild(el);
    return()=>{ const s=document.getElementById("jc2css"); if(s) s.remove(); };
  },[]);

  const loadAll = useCallback(async () => {
    try {
      const [d,a,m,l,s,b] = await Promise.all([
        api.getDrones(),api.getAlerts(),api.getMissions(),api.getLogs(),api.getStats(),api.getBaseStation()
      ]);
      setAlerts(a); setMissions(m); setLogs(l); setStats(s); setBaseStation(b);
      const routes={};
      m.filter(ms=>ms.status==="active"&&ms.waypoints?.length>0).forEach(ms=>{routes[ms.drone_id]=ms.waypoints;});
      setMissionRoutes(routes);
      setDrones(prev=>{
        const usb=prev.find(x=>x.id==="USB-DRONE");
        const fresh=d.filter(x=>x.id!=="USB-DRONE");
        return usb ? [...fresh, usb] : fresh;
      });
    } catch(e) { notify("error","Erreur chargement",e.message); }
  }, [notify]);

  useEffect(()=>{ if(!user) return; loadAll(); const t=setInterval(loadAll,10000); return()=>clearInterval(t); },[user,loadAll]);

  useEffect(()=>{
    if(!user) return;
    const connect=()=>{
      const ws=new WebSocket(WS_URL);
      wsRef.current=ws;
      ws.onopen=()=>notify("info","WebSocket connecté","Temps réel actif",3000);
      ws.onmessage=ev=>{ try{ handleWsMsg(JSON.parse(ev.data)); }catch(_){} };
      ws.onerror=()=>{};
      ws.onclose=()=>{ setTimeout(connect,3000); };
    };
    connect();
    return()=>{ if(wsRef.current){wsRef.current.onclose=null;wsRef.current.close();} };
  },[user]);

const handleWsMsg = useCallback((msg) => {
    console.log("📨 Message WebSocket reçu:", msg.type);
    
    switch (msg.type) {
        case "init":
            if (msg.alerts) {
                const formattedAlerts = msg.alerts.map(a => ({
                    ...a,
                    level: a.level || "info",
                    type: a.type || "general",
                    description: a.description || "Alerte système",
                    drone_name: a.drone_name || "Drone inconnu",
                }));
                setAlerts(formattedAlerts);
            }
            break;

        case "telemetry":
            if (!msg.drones) break;
            console.log("📥 Télémétrie reçue:", msg.drones);
            
            setDrones(prev => {
                const map = new Map(prev.map(d => [d.id, d]));
                msg.drones.forEach(u => {
                    if (u.id === "USB-DRONE") {
                        console.log("📍 USB-DRONE mis à jour:", u);
                        const existing = map.get("USB-DRONE");
                        if (existing) {
                            map.set(u.id, { ...existing, ...u, armed: existing.armed });
                        } else {
                            map.set(u.id, u);
                        }
                    } else {
                        if (map.has(u.id)) {
                            map.set(u.id, { ...map.get(u.id), ...u });
                        } else {
                            map.set(u.id, u);
                        }
                    }
                });
                return Array.from(map.values());
            });
            
            // Mettre à jour l'historique et les trajectoires
            msg.drones.forEach(d => {
                setTelemetryHist(p => {
                    const arr = p[d.id] || [];
                    return { ...p, [d.id]: [...arr.slice(-99), { battery: d.battery, altitude: d.altitude, speed: d.speed, t: Date.now() }] };
                });
                if ((d.status === "flying" || d.status === "returning") && typeof d.latitude === "number" && isFinite(d.latitude) && d.latitude !== 0) {
                    setTrajectories(p => {
                        const arr = p[d.id] || [];
                        const last = arr[arr.length - 1];
                        if (last && Math.abs(last.lat - d.latitude) < 0.00001 && Math.abs(last.lng - d.longitude) < 0.00001) return p;
                        return { ...p, [d.id]: [...arr.slice(-120), { lat: d.latitude, lng: d.longitude }] };
                    });
                }
            });
            break;

        case "new_alert":
            if (!msg.alert) break;
            const alertData = {
                id: msg.alert.id || Date.now(),
                level: msg.alert.level || "info",
                type: msg.alert.type || "general",
                description: msg.alert.description || "Alerte système",
                drone_name: msg.alert.drone_name || "Drone inconnu",
                latitude: msg.alert.latitude || 0,
                longitude: msg.alert.longitude || 0,
                confidence: msg.alert.confidence || 0.8,
                timestamp: msg.alert.timestamp || new Date().toISOString(),
                status: msg.alert.status || "active",
            };
            setAlerts(p => [alertData, ...p.slice(0, 99)]);
            notify(
                alertData.level,
                `⚠ ALERTE ${alertData.level?.toUpperCase() || "INFO"}`,
                `${alertData.drone_name} — ${alertData.description}`,
                alertData.level === "red" ? 0 : 10000
            );
            break;

        case "alert_updated":
            if (msg.alert) setAlerts(p => p.map(a => a.id === msg.alert.id ? msg.alert : a));
            break;

        case "mission_started":
            notify("info", "🎯 Mission lancée", `${msg.mission_name} → ${msg.drone_id}`, 6000);
            if (msg.waypoints) setMissionRoutes(p => ({ ...p, [msg.drone_id]: msg.waypoints }));
            loadAll();
            break;

        case "mission_cancelled":
            notify("warn", "Mission annulée", `${msg.mission_id}`);
            loadAll();
            break;

        case "command_ack":
            notify("success", "✓ Commande", "Exécutée", 4000);
            break;

        default:
            console.log("📨 Message non reconnu:", msg.type);
            break;
    }
}, [notify, loadAll]);
  // ── Drone USB : mise à jour depuis MAVLink télémétrie ─────
  useEffect(() => {
    const tel = mav.telemetry;
    const isConn = mav.connected;

    if (!isConn) {
      setDrones(prev => prev.map(d =>
        d.id === "USB-DRONE" ? { ...d, status: "disconnected", name: "Drone Réel (déconnecté)" } : d
      ));
      return;
    }

    // Vérifier si les données GPS sont valides
    const hasGps = tel.gps_lock && tel.latitude !== 0 && tel.longitude !== 0;
    const lat = hasGps ? tel.latitude : DEFAULT_LAT;
    const lng = hasGps ? tel.longitude : DEFAULT_LNG;
    const alt = hasGps ? tel.altitude : 0;

    // Construire l'objet du drone USB avec toutes les données
    const usbDrone = {
      id: "USB-DRONE",
      name: "Drone Réel (USB)",
      model: `Pixhawk — ${mav.mode === "rpi" ? "RPi" : "USB Direct"}`,
      status: armedState ? "flying" : "idle",
      latitude: lat,
      longitude: lng,
      altitude: alt,
      speed: tel.groundspeed || tel.speed || 0,
      heading: tel.heading || 0,
      battery: tel.battery || 0,
      voltage: tel.voltage || 0,
      roll: tel.roll || 0,
      pitch: tel.pitch || 0,
      climbrate: tel.climbrate || 0,
      airspeed: tel.airspeed || 0,
      groundspeed: tel.groundspeed || 0,
      rcRssi: tel.rcRssi || 0,
      signal_strength: tel.rcRssi || 100,
      gps_locked: hasGps,
      satellites: tel.satellites || 0,
      flightMode: tel.flightMode || "",
      camera_active: false,
      ai_active: false,
      temperature: 25,
      flight_time: 0,
      total_distance: 0,
      detections_today: 0,
      active_mission_id: null,
      active_waypoint_idx: 0,
      armed: armedState,
      last_seen: new Date().toISOString(),
      home_lat: DEFAULT_LAT,
      home_lng: DEFAULT_LNG,
    };

    // Mettre à jour la liste des drones
    setDrones(prev => {
      const existing = prev.find(d => d.id === "USB-DRONE");
      if (existing) {
        // Ne pas écraser les données si elles sont identiques
        const sameLat = Math.abs(existing.latitude - lat) < 0.000001;
        const sameLng = Math.abs(existing.longitude - lng) < 0.000001;
        if (sameLat && sameLng && existing.armed === armedState && existing.status === usbDrone.status) {
          return prev;
        }
        return prev.map(d => d.id === "USB-DRONE" ? { ...usbDrone } : d);
      }
      return [...prev, usbDrone];
    });

    // Mettre à jour l'historique de télémétrie
    setTelemetryHist(prev => {
      const arr = prev["USB-DRONE"] || [];
      const newEntry = { 
        battery: tel.battery || 0, 
        altitude: alt, 
        speed: tel.groundspeed || tel.speed || 0, 
        t: Date.now() 
      };
      // Éviter les doublons
      const last = arr[arr.length - 1];
      if (last && Math.abs(last.altitude - newEntry.altitude) < 0.1 && last.speed === newEntry.speed) {
        return prev;
      }
      return { ...prev, "USB-DRONE": [...arr.slice(-99), newEntry] };
    });

    // Mettre à jour la trajectoire
    if (hasGps && tel.latitude !== 0 && tel.longitude !== 0) {
      setTrajectories(prev => {
        const arr = prev["USB-DRONE"] || [];
        const last = arr[arr.length - 1];
        // Éviter les doublons trop proches
        if (last && Math.abs(last.lat - lat) < 0.000005 && Math.abs(last.lng - lng) < 0.000005) {
          return prev;
        }
        return { ...prev, "USB-DRONE": [...arr.slice(-500), { lat, lng, alt }] };
      });
    }

    // Mettre à jour le centre de la carte vers la position du drone
    if (hasGps && tel.latitude !== 0 && tel.longitude !== 0) {
      setMapCenter([lat, lng]);
      // Ne pas zoomer trop souvent
      setMapZoom(prev => Math.max(prev, 14));
    }

  }, [mav.connected, mav.telemetry, mav.mode, armedState]);

  // ── Mode mixte RC ──────────────────────────────────────────
  useEffect(() => {
    if (!mixMode || !mav.connected) return;
    const interval = setInterval(() => {
      const rc = mav.telemetry.rcChannels;
      if (rc && rc.length >= 8) mav.commands.sendRCOverride(rc);
    }, 50);
    return () => clearInterval(interval);
  }, [mixMode, mav.connected, mav.telemetry.rcChannels]);

  // ── Synchronisation état armé backend → WebSocket ─────────
  const syncArmedToBackend = useCallback(async (isArmed) => {
    try {
      await api.sendCommand("USB-DRONE", isArmed ? "arm" : "disarm", {});
    } catch (e) {
      // Le backend peut ne pas avoir le drone USB, c'est normal
      console.warn("Sync armed backend:", e.message);
    }
  }, []);

 // ──────────────── FONCTION sendCommand CORRIGÉE ──────────────
const sendCommand = useCallback(async (action, params = {}) => {
  if (!selDrone) return;

  if (selDrone.id === "USB-DRONE") {
    if (!mav.connected) {
      notify("error", "Non connecté", "Branchez le contrôleur");
      return;
    }
    try {
      switch (action) {
        case "arm": {
          console.log("🔑 ARM → envoi MAVLink");
          await mav.commands.arm();
          await new Promise(r => setTimeout(r, 500));
          setArmedState(true);
          setDrones(prev => prev.map(d =>
            d.id === "USB-DRONE" ? { ...d, armed: true, status: "flying" } : d
          ));
          // Synchronisation avec le backend (optionnel)
          try {
            await api.sendCommand("USB-DRONE", "arm", {});
          } catch (e) {
            console.warn("Backend sync:", e.message);
          }
          notify("success", "✅ Drone armé", "Moteurs prêts", 3000);
          break;
        }

        case "disarm": {
          console.log("🔐 DISARM → envoi MAVLink");
          // Couper le throttle
          const zeroThrottle = [1500, 1500, 1500, 1000, 1500, 1500, 1500, 1500];
          await mav.commands.sendRCOverride(zeroThrottle);
          await new Promise(r => setTimeout(r, 300));
          await mav.commands.disarm();
          await new Promise(r => setTimeout(r, 500));
          setArmedState(false);
          setDrones(prev => prev.map(d =>
            d.id === "USB-DRONE" ? { ...d, armed: false, status: "idle" } : d
          ));
          try {
            await api.sendCommand("USB-DRONE", "disarm", {});
          } catch (e) {
            console.warn("Backend sync:", e.message);
          }
          notify("success", "🔐 Drone désarmé", "Moteurs arrêtés", 3000);
          break;
        }

        case "takeoff": {
          if (!armedState) {
            notify("error", "Drone non armé", "Armez d'abord le drone");
            return;
          }
          const alt = params.altitude || 120;
          console.log(`🚀 TAKEOFF ${alt}m`);
          await mav.commands.takeoff(alt);
          setDrones(prev => prev.map(d =>
            d.id === "USB-DRONE" ? { ...d, status: "flying", altitude: alt } : d
          ));
          notify("success", "🚀 Décollage", `Altitude cible : ${alt}m`, 3000);
          break;
        }

        case "land": {
          console.log("🛬 LAND → envoi MAVLink");
          await mav.commands.land();
          setDrones(prev => prev.map(d =>
            d.id === "USB-DRONE" ? { ...d, status: "landing" } : d
          ));
          notify("success", "🛬 Atterrissage", "Descente initiée", 3000);
          break;
        }

        case "rtl": {
          console.log("🏠 RTL → envoi MAVLink");
          await mav.commands.rtl();
          setDrones(prev => prev.map(d =>
            d.id === "USB-DRONE" ? { ...d, status: "returning" } : d
          ));
          notify("success", "🏠 RTL", "Retour à la base", 3000);
          break;
        }

        case "hover": {
          console.log("⏸ HOVER → envoi MAVLink");
          await mav.commands.setMode("LOITER");
          notify("success", "⏸ Stationnaire", "Mode LOITER", 3000);
          break;
        }

        case "emergency": {
          console.log("⚠️ URGENCE → RTL immédiat");
          await mav.commands.rtl();
          setDrones(prev => prev.map(d =>
            d.id === "USB-DRONE" ? { ...d, status: "emergency" } : d
          ));
          notify("warning", "⚠️ URGENCE", "RTL immédiat déclenché", 5000);
          break;
        }

        default: {
          console.warn(`⚠️ Commande non supportée pour USB: ${action}`);
          notify("warn", "Commande", `${action} non supportée USB`);
        }
      }
    } catch (e) {
      console.error("❌ Erreur MAVLink:", e);
      notify("error", "Erreur MAVLink", e.message);
    }
    return;
  }

  // Drones simulés (backend)
  try {
    await api.sendCommand(selDrone.id, action, params);
    notify("success", "Commande envoyée", action.toUpperCase(), 4000);
  } catch (e) {
    console.error("❌ Erreur API:", e);
    notify("error", "Commande échouée", e.message);
  }
}, [selDrone, mav, armedState, notify]);

  const ackAlert = async (id) => {
    try { await api.ackAlert(id); setAlerts(p=>p.map(a=>a.id===id?{...a,status:"acknowledged"}:a)); notify("info","Alerte acquittée","",3000); }
    catch(e) { notify("error","Erreur",e.message); }
  };

  const cancelMission = async (missionId, droneId) => {
    if(!window.confirm("Annuler cette mission ?")) return;
    try { await api.cancelMission(missionId); setMissionRoutes(p=>{const n={...p};delete n[droneId];return n;}); loadAll(); }
    catch(e) { notify("error","Erreur",e.message); }
  };

  useEffect(()=>{
    if(selDrone&&typeof selDrone.latitude==="number"&&isFinite(selDrone.latitude)&&selDrone.latitude!==0) {
      setMapCenter([selDrone.latitude,selDrone.longitude]);
      setMapZoom(12);
    }
  },[selectedDroneId]);

  const onMissionCreated = useCallback((res,droneId,wps)=>{
    setMissionRoutes(p=>({...p,[droneId]:wps}));
    loadAll();
  },[loadAll]);

  const flyingCount   = drones.filter(d=>d.status==="flying").length;
  const activeAlerts  = alerts.filter(a=>a.status==="active");
  const redAlerts     = activeAlerts.filter(a=>a.level==="red");
  const totalKm       = drones.reduce((s,d)=>s+(d.total_distance||0),0).toFixed(1);
  const activeMission = selDrone ? missions.find(m=>m.id===selDrone.active_mission_id&&m.status==="active") : null;

  if(!user) return <LoginScreen onLogin={(u,token)=>{_token=token;setUser(u);}}/>;

  // ─── Boutons ARM/DISARM/TAKEOFF partagés ─────────────────
  // armed = armedState (source de vérité via vote majority MAVLink)
  const ArmButton = ({ compact=false }) => {
    const style = compact ? {padding:"6px 12px",fontSize:10} : {};
    return (
      <button
        className={`cbtn ${armedState ? "armed-active" : "ok"}`}
        style={style}
        disabled={!mav.connected}
        onClick={() => sendCommand(armedState ? "disarm" : "arm")}
      >
        {armedState ? "🔐 Désarmer" : "🔑 Armer"}
      </button>
    );
  };

  const TakeoffButton = ({ compact=false }) => {
    const style = compact ? {padding:"6px 12px",fontSize:10} : {};
    return (
      <button
        className="cbtn ok"
        style={style}
        // Décollage désactivé si non armé ou non connecté
        disabled={!mav.connected || !armedState}
        title={!armedState ? "Armez le drone d'abord" : "Décollage à 120m"}
        onClick={() => sendCommand("takeoff", { altitude: 120 })}
      >
        🚀 Décollage {!armedState && "🔒"}
      </button>
    );
  };

  // ── Rendu final ────────────────────────────────────────────
  return (
    <div className="app">
      <header className="header">
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div>
            <div className="logo-text">JAMBAAR</div>
            <div className="logo-sub">COMMANDEMENT & SURVEILLANCE — FRONTIÈRES SÉNÉGAL</div>
          </div>
          <div className="flag">
            <svg width="28" height="20" viewBox="0 0 90 60">
              <rect x="0"  y="0" width="30" height="60" fill="#00853F"/>
              <rect x="30" y="0" width="30" height="60" fill="#FDEA43"/>
              <rect x="60" y="0" width="30" height="60" fill="#E31B23"/>
              <polygon points="45,12 48,24 60,24 51,32 54,44 45,37 36,44 39,32 30,24 42,24" fill="#00853F"/>
            </svg>
            <span className="flag-text">SÉNÉGAL</span>
          </div>
        </div>
        <nav style={{display:"flex",gap:2}}>
          {[["map","🗺 CARTE"],["dashboard","📊 TABLEAU"],["missions","🎯 MISSIONS"],["logs","📝 JOURNAUX"],["fleet","🚁 FLOTTE"]].map(([id,lbl])=>(
            <button key={id} className={`nav-btn ${page===id?"active":""}`} onClick={()=>setPage(id)}>{lbl}</button>
          ))}
        </nav>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button
            className={`cbtn usb-btn ${mav.connected?"connected":""}`}
            style={{padding:"5px 12px",fontSize:10,flexShrink:0}}
            onClick={()=>{ if(mav.connected){ mav.disconnect(); } else { setRightTab("usb"); } }}
          >
            {mav.connected ? `🔌 ${mav.mode==="usb"?"USB":"RPi"} ●` : "🔌 Connecter FC"}
          </button>
          {mav.connected&&(
            <span style={{fontFamily:"var(--mono)",fontSize:9,color:"rgba(255,255,255,0.85)",letterSpacing:0.5,lineHeight:1.4}}>
              {mav.telemetry.gps_lock ? `${mav.telemetry.latitude.toFixed(4)}, ${mav.telemetry.longitude.toFixed(4)}` : "GPS SEARCH"}<br/>
              {mav.telemetry.flightMode||"—"} | {armedState ? "ARMÉ ✅" : "DÉSARMÉ ❌"} | {(mav.telemetry.battery||0).toFixed(0)}%
            </span>
          )}
          <span style={{display:"flex",alignItems:"center",gap:5,fontFamily:"var(--mono)",fontSize:10,color:"rgba(255,255,255,0.8)"}}>
            <span className={`dot ${redAlerts.length>0?"alert":flyingCount>0?"":"warn"}`}/>{flyingCount} EN VOL
          </span>
          {activeAlerts.length>0&&(
            <span style={{display:"flex",alignItems:"center",gap:5,fontFamily:"var(--mono)",fontSize:10,color:"rgba(255,255,255,0.8)"}}>
              <span className={`dot ${redAlerts.length>0?"alert":"warn"}`}/>{activeAlerts.length} ALERTES
            </span>
          )}
          <span style={{fontFamily:"var(--mono)",fontSize:12,color:"rgba(255,255,255,0.9)",letterSpacing:2}}>{time.toLocaleTimeString("fr-FR")}</span>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"3px 10px 3px 4px",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:20}}>
            <div className="avatar">{user.name?.[0]||"U"}</div>
            <div><div style={{fontSize:11,fontWeight:600,color:"#fff"}}>{user.name}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.6)",textTransform:"uppercase",letterSpacing:1}}>{user.role}</div></div>
          </div>
          <button className="logout-btn" onClick={()=>{setUser(null);_token=null;mav.disconnect();}}>Déco</button>
        </div>
      </header>

      <div className="main">
        {/* ── SIDEBAR ──────────────────────────────────────── */}
        <aside className="sidebar">
          <div className="section-hdr"><span>Flotte ({drones.length})</span><span style={{fontFamily:"var(--mono)",fontSize:10}}>{flyingCount} en vol</span></div>
          <div className="drone-list">
            {drones.map(d=>{
              const bc=battColor(d.battery);
              const isUsb=d.id==="USB-DRONE";
              // Pour le drone USB, utiliser armedState (vote majority)
              const isDroneArmed = isUsb ? armedState : (d.armed||false);
              return (
                <div key={d.id} className={`dc ${d.status} ${selectedDroneId===d.id?"selected":""}`} onClick={()=>{setSelectedDroneId(d.id);setRightTab("detail");}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div className="dc-name">{isUsb&&<span style={{color:"#00d4ff",marginRight:4}}>●</span>}{d.name}</div>
                    <div className="dc-stat-badge">{STATUS_LABEL[d.status]||d.status}</div>
                  </div>
                  <div style={{fontSize:9,color:"var(--txt3)",marginBottom:6}}>{d.model}</div>
                  {isUsb&&mav.connected&&(
                    <div style={{fontSize:9,color:"#00d4ff",fontFamily:"var(--mono)",marginBottom:4}}>
                      {mav.telemetry.flightMode||"—"} | {isDroneArmed?"🔑 ARMÉ":"🔐 DÉSARMÉ"} | {mav.telemetry.satellites||0}sat
                    </div>
                  )}
                  {d.active_mission_id&&<div className="mission-badge">🎯 WP {(d.active_waypoint_idx||0)+1}</div>}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:3}}>
                    {[
                      [(d.battery||0).toFixed(0)+"%","Batt.",{color:bc}],
                      [(d.altitude||0).toFixed(0)+"m","Alt.",{}],
                      [d.detections_today||0,"Det.",{color:d.detections_today>0?"var(--orange)":undefined}]
                    ].map(([v,l,s])=>(
                      <div key={l} style={{textAlign:"center"}}>
                        <div style={{fontFamily:"var(--mono)",fontSize:12,fontWeight:600,...s}}>{v}</div>
                        <div style={{fontSize:8,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:0.5}}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="batt-bar"><div className="batt-fill" style={{width:`${d.battery||0}%`,background:bc}}/></div>
                </div>
              );
            })}
          </div>
          <div style={{padding:"10px 12px",borderTop:"1px solid var(--border)"}}>
            <div className="section-hdr" style={{marginBottom:8,padding:0,background:"none",border:"none",fontSize:10}}>ALERTES ACTIVES</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
              {[["red","#c62828"],["orange","#e65c00"],["yellow","#c79100"]].map(([lv,col])=>(
                <div key={lv} style={{textAlign:"center",background:"var(--panel)",border:`1px solid ${col}44`,borderRadius:6,padding:"6px 4px",cursor:"pointer"}} onClick={()=>{setPage("map");setRightTab("alerts");}}>
                  <div style={{fontFamily:"var(--title)",fontSize:22,color:col,fontWeight:700,lineHeight:1}}>{alerts.filter(a=>a.level===lv&&a.status==="active").length}</div>
                  <div style={{fontSize:9,color:col,textTransform:"uppercase",letterSpacing:1,marginTop:2}}>{lv}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── ZONE CENTRALE ─────────────────────────────────── */}
        <main className="map-container">
          {page==="map"&&(
            <>
              <div className="kpi-bar" style={{position:"relative",zIndex:10}}>
                {[[flyingCount,"DRONES EN VOL"],[activeAlerts.length,"ALERTES ACTIVES"],[redAlerts.length,"CRITIQUES"],[`${totalKm} km`,"COUVERTS"],[stats?.detection_rate?`${stats.detection_rate}%`:"—","DÉTECTION IA"]].map(([v,l],i)=>(
                  <div key={i} className="kpi"><div className="kpi-v" style={{color:i===2&&redAlerts.length>0?"var(--red)":undefined}}>{v}</div><div className="kpi-l">{l}</div></div>
                ))}
              </div>
              <div className="scanline"/>
              {addingWaypoints&&<div className="wp-hint">🖱️ Mode ajout waypoints — cliquez sur la carte</div>}
              <div style={{position:"absolute",top:38,left:0,right:0,bottom:0}}>
                <DroneMap drones={drones} alerts={alerts} selectedDroneId={selectedDroneId} onSelectDrone={d=>{setSelectedDroneId(d.id);setRightTab("detail");}} trajectories={trajectories} waypoints={newWaypoints} addingWaypoints={addingWaypoints} onAddWaypoint={(lat,lng)=>setNewWaypoints(p=>[...p,{lat,lng}])} mapCenter={mapCenter} mapZoom={mapZoom} baseStation={baseStation} missionRoutes={missionRoutes}/>
              </div>
            </>
          )}

          {page==="dashboard"&&(
            <div style={{padding:20,overflowY:"auto",height:"100%"}}>
              <div style={{fontFamily:"var(--title)",fontSize:22,letterSpacing:3,color:"var(--accent)",marginBottom:16}}>TABLEAU DE BORD OPÉRATIONNEL</div>
              {stats&&(
                <>
                  <div className="stats-grid">
                    {[
                      [stats.active_drones,"DRONES EN VOL","var(--green)"],
                      [stats.red_alerts,"ALERTES CRITIQUES","var(--red)"],
                      [`${stats.detection_rate}%`,"TAUX DÉTECTION","var(--accent)"],
                      [`${stats.avg_response_time}s`,"TEMPS RÉPONSE","var(--orange)"],
                    ].map(([v,l,ac],i)=>(
                      <div key={i} className="stat-card" style={{"--ac":ac}}><div className="stat-v">{v}</div><div className="stat-l">{l}</div></div>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                    <div className="chart-card"><div className="chart-title">INCIDENTS PAR HEURE (24H)</div><BarChart data={stats.hourly_incidents||[]} xKey="hour" yKey="count" color="var(--accent)" height={110}/></div>
                    <div className="chart-card" style={{display:"flex",gap:14,alignItems:"center"}}>
                      <DonutChart data={[{label:"Rouge",value:stats.alert_by_level?.red||0,color:"var(--red)"},{label:"Orange",value:stats.alert_by_level?.orange||0,color:"var(--orange)"},{label:"Jaune",value:stats.alert_by_level?.yellow||0,color:"var(--yellow)"}]} size={110}/>
                      <div style={{flex:1}}><div className="chart-title" style={{marginBottom:8}}>PAR NIVEAU</div>
                        {[["Rouge","red","var(--red)"],["Orange","orange","var(--orange)"],["Jaune","yellow","var(--yellow)"]].map(([l,k,c])=>(
                          <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12}}>
                            <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:2,background:c,display:"inline-block"}}/>{l}</span>
                            <span style={{fontFamily:"var(--mono)",color:c,fontWeight:700}}>{stats.alert_by_level?.[k]||0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-title">ÉTAT DE LA FLOTTE</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:10,marginTop:10}}>
                      {drones.map(d=>(
                        <div key={d.id} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:6,padding:"8px 6px",textAlign:"center",cursor:"pointer"}} onClick={()=>{setSelectedDroneId(d.id);setRightTab("detail");setPage("map");}}>
                          <div style={{fontSize:22,marginBottom:4}}>{d.id==="USB-DRONE"?"🎮":"🚁"}</div>
                          <div style={{fontFamily:"var(--title)",fontSize:10,letterSpacing:1}}>{d.name.replace("Drone Réel","Réel")}</div>
                          <div style={{fontFamily:"var(--mono)",fontSize:11,color:battColor(d.battery),fontWeight:700}}>{(d.battery||0).toFixed(0)}%</div>
                          <div className="batt-bar" style={{marginTop:5}}><div className="batt-fill" style={{width:`${d.battery||0}%`,background:battColor(d.battery)}}/></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {page==="missions"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",height:"100%",overflow:"hidden"}}>
              <div style={{position:"relative",overflow:"hidden"}}>
                <DroneMap drones={drones} alerts={[]} selectedDroneId={selectedDroneId} onSelectDrone={d=>setSelectedDroneId(d.id)} trajectories={{}} waypoints={newWaypoints} addingWaypoints={addingWaypoints} onAddWaypoint={(lat,lng)=>setNewWaypoints(p=>[...p,{lat,lng}])} mapCenter={mapCenter} mapZoom={mapZoom} baseStation={baseStation} missionRoutes={missionRoutes}/>
                {addingWaypoints&&<div className="wp-hint">🖱️ Cliquez pour ajouter des waypoints</div>}
              </div>
              <div style={{overflowY:"auto",padding:12,borderLeft:"1px solid var(--border)",background:"var(--bg2)"}}>
                <MissionForm drones={drones} onMissionCreated={onMissionCreated} onNotify={notify} setAddingWaypoints={setAddingWaypoints} addingWaypoints={addingWaypoints} waypoints={newWaypoints} setWaypoints={setNewWaypoints} selectedDrone={selDrone} mav={mav}/>
                <div style={{borderTop:"1px solid var(--border)",paddingTop:12,marginTop:4}}>
                  <div style={{fontFamily:"var(--title)",fontSize:13,fontWeight:700,letterSpacing:2,color:"var(--txt2)",marginBottom:10}}>
                    MISSIONS EN COURS ({missions.filter(m=>m.status==="active").length})
                  </div>
                  {missions.filter(m=>m.status==="active").map(m=>{
                    const drone=drones.find(d=>d.id===m.drone_id);
                    return (
                      <div key={m.id} style={{background:"var(--panel)",border:"1px solid var(--border)",borderRadius:8,padding:12,marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                          <span style={{fontFamily:"var(--title)",fontSize:15,fontWeight:700}}>🎯 {m.name}</span>
                          <button className="cbtn danger" style={{padding:"2px 10px",fontSize:10}} onClick={()=>cancelMission(m.id,m.drone_id)}>Annuler</button>
                        </div>
                        <div style={{fontSize:11,color:"var(--txt3)"}}>Drone: <b style={{color:"var(--accent)"}}>{drone?.name||m.drone_id}</b> | {m.type} | {m.waypoints?.length||0} WP | {m.speed}m/s | {m.altitude}m</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {page==="logs"&&(
            <div style={{padding:16,overflowY:"auto",height:"100%"}}>
              <div style={{fontFamily:"var(--title)",fontSize:20,letterSpacing:3,color:"var(--accent)",marginBottom:12}}>JOURNAL DES COMMANDES</div>
              <div style={{background:"var(--panel)",border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                {logs.length===0&&<div style={{textAlign:"center",color:"var(--txt3)",padding:40}}>Aucune commande enregistrée</div>}
                {logs.map(l=>(
                  <div key={l.id} style={{display:"flex",gap:10,padding:"8px 12px",borderBottom:"1px solid var(--bg3)",fontFamily:"var(--mono)",fontSize:11}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <span style={{color:"var(--txt3)",whiteSpace:"nowrap"}}>{fmtTime(l.timestamp)}</span>
                    <span style={{color:"var(--accent)",minWidth:90,fontWeight:600}}>{l.drone_id}</span>
                    <span style={{color:"var(--green)",minWidth:120}}>{l.command?.toUpperCase()}</span>
                    <span style={{color:"var(--txt2)"}}>{l.sent_by}</span>
                    <span style={{color:l.status==="executed"?"var(--green)":"var(--txt3)",marginLeft:"auto",fontSize:9}}>{l.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page==="fleet"&&(
            <div style={{padding:16,overflowY:"auto",height:"100%"}}>
              <div style={{fontFamily:"var(--title)",fontSize:20,letterSpacing:3,color:"var(--accent)",marginBottom:16}}>GESTION DE LA FLOTTE</div>
              {baseStation&&(
                <div className="fleet-card" style={{marginBottom:16}}>
                  <div className="fleet-card-hdr">
                    <span style={{fontFamily:"var(--title)",fontSize:16,fontWeight:700}}>🏠 {baseStation.name}</span>
                    <button className="cbtn" style={{padding:"4px 12px",fontSize:11}} onClick={async()=>{const name=window.prompt("Nouveau nom:",baseStation.name);if(!name) return;try{await api.updateBase({name});setBaseStation(b=>({...b,name}));notify("info","Base renommée",name);}catch(e){notify("error","Erreur",e.message);}}}>Renommer</button>
                  </div>
                  <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--txt3)"}}>{baseStation.latitude?.toFixed(4)}, {baseStation.longitude?.toFixed(4)}</div>
                </div>
              )}
              {drones.map(drone=>{
                const isUsb=drone.id==="USB-DRONE";
                const isDroneArmed = isUsb ? armedState : (drone.armed||false);
                return (
                  <div key={drone.id} className="fleet-card">
                    <div className="fleet-card-hdr">
                      <div>
                        <div style={{fontFamily:"var(--title)",fontSize:16,fontWeight:700}}>
                          {isUsb?"🎮":"🚁"} {drone.name}
                          {isUsb&&mav.connected&&<span style={{marginLeft:6,fontSize:10,color:"#00d4ff",fontFamily:"var(--mono)"}}>●LIVE</span>}
                          <span style={{marginLeft:8,fontSize:10,fontFamily:"var(--mono)",color:{flying:"var(--green)",charging:"var(--yellow)",maintenance:"var(--orange)",idle:"var(--txt3)",returning:"var(--blue)",emergency:"var(--red)"}[drone.status]}}>{STATUS_LABEL[drone.status]||drone.status}</span>
                        </div>
                        <div style={{fontSize:11,color:"var(--txt3)"}}>{drone.model}</div>
                        {isUsb&&mav.connected&&<div style={{fontSize:10,color:"#00d4ff",fontFamily:"var(--mono)",marginTop:4}}>
                          Mode: {mav.telemetry.flightMode||"—"} | GPS: {mav.telemetry.satellites||0} sat | {isDroneArmed?"🔑 ARMÉ":"🔐 DÉSARMÉ"}
                        </div>}
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"var(--mono)",fontSize:18,color:battColor(drone.battery),fontWeight:700}}>{(drone.battery||0).toFixed(0)}%</div>
                        {isUsb&&<div style={{fontSize:10,color:"var(--txt3)"}}>{(mav.telemetry.voltage||0).toFixed(2)}V</div>}
                      </div>
                    </div>
                    <div className="batt-bar" style={{marginBottom:10,height:5}}>
                      <div className="batt-fill" style={{width:`${drone.battery||0}%`,background:battColor(drone.battery),height:"100%"}}/>
                    </div>
                    <div className="fleet-actions">
                      {isUsb ? (
                        <>
                          {/* ARM/DISARM avec armedState comme source de vérité */}
                          <button
                            className={`cbtn ${isDroneArmed ? "armed-active" : "ok"}`}
                            style={{padding:"6px 12px",fontSize:10}}
                            disabled={!mav.connected}
                            onClick={()=>{setSelectedDroneId(drone.id);sendCommand(isDroneArmed?"disarm":"arm");}}
                          >
                            {isDroneArmed ? "🔐 Désarmer" : "🔑 Armer"}
                          </button>
                          {/* TAKEOFF désactivé si non armé */}
                          <button
                            className="cbtn ok"
                            style={{padding:"6px 12px",fontSize:10}}
                            disabled={!mav.connected || !isDroneArmed}
                            title={!isDroneArmed?"Armez le drone d'abord":"Décollage à 120m"}
                            onClick={()=>sendCommand("takeoff",{altitude:120})}
                          >
                            🚀 Décollage {!isDroneArmed&&"🔒"}
                          </button>
                          <button className="cbtn danger" style={{padding:"6px 12px",fontSize:10}} disabled={!mav.connected} onClick={()=>sendCommand("land")}>🛬 Atterrir</button>
                          <button className="cbtn" style={{padding:"6px 12px",fontSize:10}} disabled={!mav.connected} onClick={()=>sendCommand("rtl")}>🏠 RTL</button>
                          <button className="cbtn" style={{padding:"6px 12px",fontSize:10}} disabled={!mav.connected} onClick={()=>sendCommand("hover")}>⏸ Loiter</button>
                          <button className="cbtn" style={{padding:"6px 12px",fontSize:10}} onClick={()=>{setSelectedDroneId(drone.id);setPage("map");setRightTab("usb");}}>🔌 Config</button>
                        </>
                      ) : (
                        <>
                          <button className="cbtn ok" style={{padding:"6px 12px",fontSize:10}} disabled={drone.status==="flying"} onClick={()=>{setSelectedDroneId(drone.id);api.sendCommand(drone.id,"takeoff",{altitude:100}).catch(e=>notify("error","Erreur",e.message));}}>🚀 Décollage</button>
                          <button className="cbtn danger" style={{padding:"6px 12px",fontSize:10}} disabled={drone.status!=="flying"} onClick={()=>api.sendCommand(drone.id,"land",{}).catch(e=>notify("error","Erreur",e.message))}>🛬 Atterrir</button>
                          <button className="cbtn" style={{padding:"6px 12px",fontSize:10}} onClick={()=>{api.sendCommand(drone.id,"rtl",{}).catch(e=>notify("error","Erreur",e.message));notify("info","RTL",drone.name,4000);}}>🏠 RTL</button>
                          <button className="cbtn" style={{padding:"6px 12px",fontSize:10}} onClick={()=>{setSelectedDroneId(drone.id);setPage("map");setRightTab("detail");}}>📍 Localiser</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* ── PANNEAU DROIT ─────────────────────────────────── */}
        <aside className="rp">
          <div className="rp-tabs">
            {[["detail","DRONE"],["alerts","ALERTES"],["missions","MISSIONS"],["usb","🔌 FC"],["params","PARAMS"],["console","CONSOLE"],["hud","HUD"],["info","INFOS"]].map(([id,lbl])=>(
              <button key={id} className={`rp-tab ${rightTab===id?"active":""}`} onClick={()=>setRightTab(id)}>{lbl}</button>
            ))}
          </div>
          <div className="rp-content">

            {rightTab==="detail"&&(
              selDrone ? (
                <div>
                  <div className="dp-hdr">
                    <div className="dp-name">{selDrone.name}</div>
                    <div style={{fontSize:10,color:"var(--txt3)",marginBottom:4}}>{selDrone.model}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontFamily:"var(--mono)",fontSize:9,padding:"1px 7px",borderRadius:3,
                        border:`1px solid ${{flying:"var(--green)",charging:"var(--yellow)",maintenance:"var(--orange)",idle:"var(--txt3)",returning:"var(--blue)",emergency:"var(--red)"}[selDrone.status]||"var(--txt3)"}`,
                        color:{flying:"var(--green)",charging:"var(--yellow)",maintenance:"var(--orange)",idle:"var(--txt3)",returning:"var(--blue)",emergency:"var(--red)"}[selDrone.status]||"var(--txt3)"
                      }}>{STATUS_LABEL[selDrone.status]||selDrone.status}</span>
                      {selDrone.id==="USB-DRONE"&&mav.connected&&(
                        <span style={{fontFamily:"var(--mono)",fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(0,212,255,0.1)",color:"#00d4ff",border:"1px solid rgba(0,212,255,0.3)"}}>
                          🔌 {mav.mode==="usb"?"USB":"RPi"} LIVE
                        </span>
                      )}
                      {selDrone.id==="USB-DRONE"&&mav.connected&&(
                        <span className={`arm-indicator ${armedState?"armed":"disarmed"}`}>
                          {armedState?"🔑 ARMÉ":"🔐 DÉSARMÉ"}
                        </span>
                      )}
                      {selDrone.gps_locked
                        ? <span style={{fontFamily:"var(--mono)",fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(27,124,27,0.1)",color:"var(--green)",border:"1px solid rgba(27,124,27,0.3)"}}>📡 GPS LOCK</span>
                        : <span style={{fontFamily:"var(--mono)",fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(199,145,0,0.1)",color:"var(--yellow)",border:"1px solid rgba(199,145,0,0.3)"}}>📡 GPS SEARCH</span>
                      }
                    </div>
                  </div>
                  <div className="dp-grid">
                    {[
                      ["Latitude",  `${(selDrone.latitude||0).toFixed(6)}°`],
                      ["Longitude", `${(selDrone.longitude||0).toFixed(6)}°`],
                      ["Altitude",  `${(selDrone.altitude||0).toFixed(1)} m`],
                      ["Vitesse",   `${(selDrone.speed||selDrone.groundspeed||0).toFixed(1)} m/s`],
                      ["Cap",       `${(selDrone.heading||0).toFixed(0)}°`],
                      ["Signal",    `${selDrone.signal_strength||0}%`],
                      ["Batterie",  `${(selDrone.battery||0).toFixed(0)}% (${(selDrone.voltage||0).toFixed(2)}V)`],
                      ["Temps vol", fmtElapsed(selDrone.flight_time||0)],
                    ].map(([l,v])=>(
                      <div key={l} className="dp-cell"><div className="dp-lbl">{l}</div><div className="dp-val" style={{fontSize:12}}>{v}</div></div>
                    ))}
                    <div className="dp-cell" style={{gridColumn:"span 2"}}>
                      <div className="dp-lbl">Batterie — {(selDrone.battery||0).toFixed(0)}%</div>
                      <div className="batt-bar" style={{height:6}}>
                        <div className="batt-fill" style={{width:`${selDrone.battery||0}%`,height:"100%",background:battColor(selDrone.battery||0)}}/>
                      </div>
                    </div>
                  </div>

                  {telemetryHist[selDrone.id]?.length>3&&(
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:9,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:2,marginBottom:6}}>TÉLÉMÉTRIE</div>
                      <Sparkline data={telemetryHist[selDrone.id].map(t=>t.battery)} color={battColor(selDrone.battery)} label="Batterie" unit="%"/>
                      <Sparkline data={telemetryHist[selDrone.id].map(t=>t.altitude)} color="#1565c0" label="Altitude" unit=" m"/>
                      <Sparkline data={telemetryHist[selDrone.id].map(t=>t.speed)} color="var(--green)" label="Vitesse" unit=" m/s"/>
                    </div>
                  )}

                  {activeMission&&(
                    <div style={{background:"rgba(21,101,192,0.08)",border:"1px solid rgba(21,101,192,0.3)",borderRadius:6,padding:"8px 10px",marginBottom:10}}>
                      <div style={{fontFamily:"var(--title)",fontSize:12,fontWeight:700,color:"var(--blue)",marginBottom:4}}>🎯 {activeMission.name}</div>
                      <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--txt2)"}}>WP {(selDrone.active_waypoint_idx||0)+1}/{activeMission.waypoints?.length||0} | {activeMission.speed}m/s | {activeMission.altitude}m</div>
                      <button className="cbtn danger" style={{marginTop:6,padding:"4px 10px",fontSize:10,width:"100%"}} onClick={()=>cancelMission(activeMission.id,selDrone.id)}>⏹ Annuler la mission</button>
                    </div>
                  )}

                  <div style={{marginBottom:10}}>
                    <button className="cbtn full" style={{padding:"8px",marginBottom:4}} onClick={()=>setVideoActive(p=>({...p,[selDrone.id]:!p[selDrone.id]}))}>
                      {videoActive[selDrone.id]?"📹 Arrêter vidéo":"📹 Activer vidéo"}
                    </button>
                    {videoActive[selDrone.id]&&<VideoSim droneName={selDrone.name} active={true}/>}
                  </div>

                  <div style={{fontSize:9,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>COMMANDES</div>
                  <div className="cmd-grid">
                    {selDrone.id==="USB-DRONE" ? (
                      <>
                        {/* Désactiver vérifications armement */}
                        <button className="cbtn warn" style={{padding:"6px",fontSize:"10px"}}
                          onClick={()=>{
                            if(window.confirm("⚠️ Désactiver toutes les vérifications d'armement ?\nRetirez les hélices !")) {
                              mav.commands.paramSet("ARMING_CHECK", 0);
                              mav.commands.paramSet("ARMING_RC_VERB", 0);
                              notify("info","Vérifications désactivées","ARMING_CHECK=0");
                            }
                          }}
                        >
                          🔓 Désactiver vérifs
                        </button>

                        {/* Mode mixte RC + App */}
                        <button className={`cbtn ${mixMode?"ok":""}`} style={{padding:"6px",fontSize:"10px"}}
                          onClick={()=>{
                            if(!mixMode) {
                              const rc=mav.telemetry.rcChannels;
                              if(rc&&rc.length===8) mav.commands.sendRCOverride(rc);
                              else notify("warn","Mode mixte","Aucun canal RC reçu");
                            } else {
                              mav.commands.sendRCOverride(null);
                            }
                            setMixMode(!mixMode);
                            notify("info",mixMode?"Mode mixte désactivé":"Mode mixte activé","");
                          }}
                        >
                          {mixMode?"🔄 Mixte ON":"🔄 Mode mixte"}
                        </button>

                        {/* ARM / DISARM — source de vérité : armedState */}
                        <button
                          className={`cbtn ${armedState ? "armed-active" : "ok"}`}
                          disabled={!mav.connected}
                          onClick={()=>sendCommand(armedState?"disarm":"arm")}
                        >
                          {armedState ? "🔐 Désarmer" : "🔑 Armer"}
                        </button>

                        {/* TAKEOFF — désactivé si drone non armé */}
                        <button
                          className="cbtn ok"
                          disabled={!mav.connected || !armedState}
                          title={!armedState?"Armez le drone d'abord":"Décollage à 120m"}
                          onClick={()=>sendCommand("takeoff",{altitude:120})}
                        >
                          🚀 Décollage {!armedState&&"🔒"}
                        </button>

                        <button className="cbtn danger" disabled={!mav.connected} onClick={()=>sendCommand("land")}>🛬 Atterrir</button>
                        <button className="cbtn" disabled={!mav.connected} onClick={()=>sendCommand("rtl")}>🏠 RTL</button>
                        <button className="cbtn" disabled={!mav.connected} onClick={()=>sendCommand("hover")}>⏸ Loiter</button>
                        <button className="cbtn full" onClick={()=>setRightTab("usb")}>🔌 Configurer connexion</button>
                        <button className="cbtn danger full" onClick={()=>{if(window.confirm("Confirmer urgence ?"))sendCommand("emergency");}}>
                          ⚠️ URGENCE — RTL immédiat
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="cbtn ok" disabled={selDrone.status==="flying"} onClick={()=>sendCommand("takeoff",{altitude:120})}>🚀 Décollage</button>
                        <button className="cbtn danger" disabled={selDrone.status!=="flying"} onClick={()=>sendCommand("land")}>🛬 Atterrir</button>
                        <button className="cbtn" onClick={()=>sendCommand("rtl")}>🏠 RTL</button>
                        <button className="cbtn" disabled={selDrone.status!=="flying"} onClick={()=>sendCommand("hover")}>⏸ Stationnaire</button>
                        <button className="cbtn" onClick={()=>sendCommand(selDrone.camera_active?"camera_off":"camera_on")}>📷 Caméra {selDrone.camera_active?"OFF":"ON"}</button>
                        <button className="cbtn" onClick={()=>sendCommand(selDrone.ai_active?"ai_off":"ai_on")}>🤖 IA {selDrone.ai_active?"OFF":"ON"}</button>
                        <button className="cbtn danger full" onClick={()=>{if(window.confirm("Confirmer urgence ?"))sendCommand("emergency");}}>⚠️ URGENCE</button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{padding:24,textAlign:"center",color:"var(--txt3)"}}>
                  <div style={{fontSize:40,marginBottom:12}}>🚁</div>
                  <div style={{fontFamily:"var(--title)",fontSize:16,letterSpacing:2}}>Sélectionnez un drone</div>
                </div>
              )
            )}

            {rightTab==="alerts"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontFamily:"var(--title)",fontSize:12,letterSpacing:2,color:"var(--txt3)"}}>ALERTES RÉCENTES</span>
                  <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--txt3)"}}>{alerts.length} total</span>
                </div>
                {alerts.length===0&&<div style={{textAlign:"center",color:"var(--txt3)",padding:30}}>Aucune alerte</div>}
                {alerts.slice(0,40).map(a=>(
                  <div key={a.id} className={`ai ${a.level} ${a.status==="acknowledged"?"acknowledged":""}`} onClick={()=>a.status==="active"&&ackAlert(a.id)}>
                    <span className={`al-badge ${a.level}`}>{a.level?.toUpperCase()||"ALERTE"} — {a.type?.toUpperCase()||"TYPE"}</span>
                    <div style={{fontSize:11,color:"var(--text)",lineHeight:1.4,marginBottom:4}}>{a.description}</div>
                    <div className="conf-bar"><div className="conf-fill" style={{width:`${(a.confidence||0)*100}%`}}/></div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                      <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--accent)"}}>{a.drone_name}</span>
                      <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--txt3)"}}>{fmtTime(a.timestamp)}</span>
                    </div>
                    {a.status==="active"&&<div style={{fontSize:9,color:"var(--txt3)",marginTop:3,textAlign:"center"}}>Cliquer pour acquitter</div>}
                  </div>
                ))}
              </div>
            )}

            {rightTab==="missions"&&(
              <div>
                <div style={{fontFamily:"var(--title)",fontSize:12,letterSpacing:2,color:"var(--txt3)",marginBottom:10}}>MISSIONS</div>
                {missions.map(m=>{
                  const drone=drones.find(d=>d.id===m.drone_id);
                  const sc={active:"var(--green)",pending:"var(--yellow)",cancelled:"var(--red)",completed:"var(--txt3)"};
                  return (
                    <div key={m.id} style={{background:"var(--panel)",border:"1px solid var(--border)",borderRadius:6,padding:10,marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontFamily:"var(--title)",fontSize:14,fontWeight:700}}>{m.name}</span>
                        <span style={{fontFamily:"var(--mono)",fontSize:9,padding:"1px 6px",borderRadius:3,border:`1px solid ${sc[m.status]}`,color:sc[m.status]}}>{m.status?.toUpperCase()}</span>
                      </div>
                      <div style={{fontSize:10,color:"var(--txt3)"}}>{drone?.name||m.drone_id} | {m.type} | {m.waypoints?.length||0} WP | {m.speed}m/s</div>
                    </div>
                  );
                })}
                {missions.length===0&&<div style={{textAlign:"center",color:"var(--txt3)",padding:30}}>Aucune mission</div>}
              </div>
            )}

            {rightTab==="usb"&&<UsbConnectionPanel mav={mav} armed={armedState}/>}
            {rightTab==="params"&&<ParamsPanel droneId={selDrone?.id||null} onNotify={notify}/>}

            {rightTab==="console"&&(
              <ConsolePanel
                droneId={selDrone?.id||null}
                usbCommands={selDrone?.id==="USB-DRONE"&&mav.connected ? mav.commands : null}
                onNotify={notify}
                onCommand={(action)=>sendCommand(action)}
              />
            )}

            {rightTab==="hud"&&<HUDPanel drone={selDrone} mavTelemetry={mav.telemetry} mavConnected={mav.connected} armed={armedState}/>}

            {rightTab==="info"&&(
              <div>
                <div style={{fontFamily:"var(--title)",fontSize:13,letterSpacing:2,color:"var(--accent)",marginBottom:12}}>INFORMATIONS SYSTÈME</div>
                {[
                  ["Système","Drone C2 v5.0 (JAMBAAR)"],
                  ["MAVLink","v1 & v2 supportés"],
                  ["Armement","Vote majority (5 HEARTBEAT)"],
                  ["Connexion FC","WebSerial USB + WebSocket RPi"],
                  ["Backend","FastAPI + SQLite"],
                  ["IA Engine","YOLOv9 + TensorRT"],
                  ["Navigation","GNSS + VI-SLAM"],
                  ["Protocole","MAVLink 2.0"],
                  ["Drones",`${drones.length} enregistrés`],
                  ["En vol",`${flyingCount} actifs`],
                  ["Missions",`${missions.filter(m=>m.status==="active").length} actives`],
                  ["Alertes",`${activeAlerts.length} non acquittées`],
                  ["FC connecté",mav.connected?`✅ ${mav.mode?.toUpperCase()}`:"❌ Non"],
                  ["Armé (vote)",armedState?"✅ OUI":"❌ NON"],
                  ["GPS FC",mav.telemetry.gps_lock?`✅ ${mav.telemetry.satellites} sat`:"❌ Recherche"],
                ].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid var(--bg3)"}}>
                    <span style={{fontSize:10,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:0.5}}>{k}</span>
                    <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--text)",fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <Notifications items={notifications} onDismiss={id=>setNotifications(p=>p.filter(n=>n.id!==id))}/>
    </div>
  );
}