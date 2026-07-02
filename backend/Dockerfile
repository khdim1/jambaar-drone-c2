FROM python:3.11-slim

# Installer Tailscale
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && apt-get clean

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY frontend/dist/ /app/frontend/dist/

COPY backend/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]