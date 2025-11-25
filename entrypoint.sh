#!/bin/bash
set -e

echo "Starting entrypoint…"

# ============================================
# Parse Redis config
# ============================================

if [ -n "$REDIS_URL" ]; then
    echo "Using REDIS_URL from environment..."

    redis_host=$(python3 - << END
import os
from urllib.parse import urlparse
u = urlparse(os.environ["REDIS_URL"])
print(u.hostname)
END
)

    redis_port=$(python3 - << END
import os
from urllib.parse import urlparse
u = urlparse(os.environ["REDIS_URL"])
print(u.port)
END
)
else
    echo "Using REDIS_HOST + REDIS_PORT fallback..."
    redis_host=${REDIS_HOST:-redis}
    redis_port=${REDIS_PORT:-6379}
fi

echo "Redis host: $redis_host"
echo "Redis port: $redis_port"

# ============================================
# Wait for Redis
# ============================================

echo "Waiting for Redis…"

python3 << END
import socket, time, sys, os

host = "$redis_host"
port = int("$redis_port")

while True:
    try:
        s = socket.socket()
        s.settimeout(1)
        s.connect((host, port))
        s.close()
        break
    except Exception:
        time.sleep(0.2)
END

echo "Redis is up!"

# ============================================
# Django setup
# ============================================

echo "Creating media directories..."
mkdir -p /app/media/chat_uploads
chmod -R 755 /app/media

echo "Running migrations..."
python3 manage.py migrate --noinput

echo "Collecting static files..."
python3 manage.py collectstatic --noinput --clear

# ============================================
# Start Daphne
# ============================================

PORT=${PORT:-8000}
echo "Starting Daphne on port $PORT..."

exec daphne -b 0.0.0.0 -p "$PORT" config.asgi:application