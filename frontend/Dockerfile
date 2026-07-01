# Étape 1 : Build de l'application
FROM node:20-alpine AS build

WORKDIR /app

# Copier les fichiers de dépendances
COPY frontend/package*.json ./
RUN npm ci --only=production

# Copier le code source et builder
COPY frontend/ .
RUN npm run build

# Étape 2 : Servir avec Nginx
FROM nginx:stable-alpine

# Copier les fichiers buildés
COPY --from=build /app/dist /usr/share/nginx/html

# Exposer le port 80
EXPOSE 80

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]