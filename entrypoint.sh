#!/bin/bash

# Exit on error
set -e

echo "Waiting for Redis..."
python << END
import socket
import time
import os

redis_host = os.environ.get('REDIS_HOST', 'redis')
redis_port = int(os.environ.get('REDIS_PORT', 6379))

while True:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        sock.connect((redis_host, redis_port))
        sock.close()
        break
    except:
        time.sleep(0.1)
END
echo "Redis started"

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "Starting server..."
# Use PORT environment variable if set (Railway), otherwise default to 8000
PORT=${PORT:-8000}
echo "Binding to 0.0.0.0:$PORT"

# Start daphne directly with the PORT variable
exec daphne -b 0.0.0.0 -p $PORT config.asgi:application
