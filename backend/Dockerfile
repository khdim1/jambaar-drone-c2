FROM python:3.11-slim

# Installer les dépendances système nécessaires
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier et installer les dépendances Python
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier le code source
COPY backend/ .

# Exposer le port
EXPOSE 8000

# Démarrer l'application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]