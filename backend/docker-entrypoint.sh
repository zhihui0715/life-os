#!/bin/sh
# Container start: bring the database schema up to date, then serve.
set -e

echo "Applying database migrations…"
flask --app wsgi db upgrade

# One process with a few threads: the rate limiter keeps its counters in memory, so a single process keeps them
# accurate, and one person's traffic needs no more. --forwarded-allow-ips: the host's proxy is trusted via TRUST_PROXY.
exec gunicorn wsgi:app \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers 1 --threads "${GUNICORN_THREADS:-8}" \
  --timeout 90 \
  --access-logfile - \
  --forwarded-allow-ips "*"
