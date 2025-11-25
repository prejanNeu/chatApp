import json
from channels.generic.websocket import AsyncWebsocketConsumer
from .utils import update_user_online_status


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope['user']
        self.group_name = f"notification_{self.user.id}"

        if not self.user.is_authenticated:
            await self.close()
            return

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()

        # Update online status
        await update_user_online_status(self.user, True)

    async def disconnect(self, close_code):
        # Update online status
        if self.user.is_authenticated:
            await update_user_online_status(self.user, False)

        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )

    async def notify(self, event):
        await self.send(
            text_data=json.dumps(event["data"])
        )
