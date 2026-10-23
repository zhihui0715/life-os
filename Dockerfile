# Production image (Stage 9): one container serves the API and the built app on $PORT.
#   docker build -t lifeos .
#   docker run --env-file .env.production -p 8000:8000 lifeos
# See docs/04-deployment.md. The database is NOT in this image — use a managed PostgreSQL with backups.

# ---- 1. build the frontend ----
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. the server ----
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_ENV=production \
    FRONTEND_DIST=/app/frontend_dist \
    PORT=8000
WORKDIR /app

COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install ".[prod]"
COPY backend/migrations ./migrations
COPY backend/wsgi.py backend/docker-entrypoint.sh ./
COPY --from=frontend /src/frontend/dist ./frontend_dist

# Never run as root inside the container.
RUN useradd --create-home --uid 10001 lifeos && chmod +x docker-entrypoint.sh
USER lifeos

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/v1/health', timeout=4)"
ENTRYPOINT ["./docker-entrypoint.sh"]
