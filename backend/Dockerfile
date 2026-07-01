FROM python:3.11-slim

# Forcer un nouveau cache
RUN echo "Force rebuild - $(date)"

RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Installer pyserial explicitement si absent
RUN pip install --no-cache-dir pyserial==3.5

COPY backend/ .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]