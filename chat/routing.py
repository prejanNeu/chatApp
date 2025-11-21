from django.urls import re_path

from . import consumers
from notifications import consumers as notification_consumers

websocket_urlpatterns = [
    re_path(r"ws/chat/(?P<room_name>[^/]+)/$", consumers.ChatConsumer.as_asgi()),
    re_path(r"ws/notifications/$", notification_consumers.NotificationConsumer.as_asgi()),
]