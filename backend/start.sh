#!/bin/bash

# Démarrer Tailscale
tailscaled --state=/var/lib/tailscale/tailscaled.state &
sleep 5

# Se connecter avec la clé
tailscale up --authkey=${TAILSCALE_AUTHKEY} --accept-routes

# Démarrer l'application
uvicorn main:app --host 0.0.0.0 --port 8000