@echo off
title JAMBAAR - Système de Contrôle Drone
color 0A
echo ============================================
echo 🚀 JAMBAAR - DÉMARRAGE AUTOMATIQUE
echo ============================================
echo.
echo 📡 Vérification du Jetson (192.168.1.109)...

ping -n 3 192.168.1.109 > nul
if errorlevel 1 (
    echo ❌ Jetson non accessible !
    echo.
    echo ⚠️  Vérifiez que le Jetson est allumé
    echo    et connecté au réseau.
    echo.
    echo Appuyez sur une touche pour réessayer...
    pause > nul
    goto start
)

:start
echo ✅ Jetson connecté !
echo.
echo 🔌 Démarrage du backend JAMBAAR...
cd /d C:\Users\hp\Desktop\drone-c2\backend
start "JAMBAAR-Backend" cmd /k "python main.py"

echo 🌉 Démarrage du bridge JAMBAAR...
cd /d C:\Users\hp\Desktop\drone-c2\backend
start "JAMBAAR-Bridge" cmd /k "python ws_bridge.py"

echo 🌐 Démarrage du frontend JAMBAAR...
cd /d C:\Users\hp\Desktop\drone-c2\frontend
start "JAMBAAR-Frontend" cmd /k "npm run dev"

echo.
echo ✅ JAMBAAR DÉMARRÉ AVEC SUCCÈS !
echo ============================================
echo 🌐 Frontend : http://localhost:5173
echo 🔗 Backend  : http://localhost:8000
echo 📡 Bridge   : ws://192.168.1.109:8765
echo ============================================
timeout /t 3