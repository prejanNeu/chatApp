import os
from django.core.asgi import get_asgi_application

# Set Django settings module FIRST
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

# NOW import routing modules after Django is initialized
import notifications.routing
import chat.routing
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator


application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(URLRouter(
                chat.routing.websocket_urlpatterns +
                notifications.routing.websocket_urlpatterns
            ))
        ),
    }
)

