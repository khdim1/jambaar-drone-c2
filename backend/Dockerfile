FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier les dépendances du backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier tout le backend
COPY backend/ .

# Copier le frontend buildé LOCALEMENT
# Ne pas rebuild, utiliser les fichiers déjà buildés
COPY frontend/dist/ /app/frontend/dist/

# Vérifier que le frontend est bien copié
RUN ls -la /app/frontend/dist/

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]