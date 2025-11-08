import json

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from accounts.views import CustomUser


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"chat_{self.room_name}"

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name, self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name, self.channel_name
        )

    # Receive message from WebSocket
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message = text_data_json["message"]
        try:
            user_id = int(text_data_json['user'])  # id
        except ValueError as e:
            print("Error parsing int: ", e)

        user = await sync_to_async(CustomUser.objects.get)(pk=user_id)

        # Send message to room group
        await self.channel_layer.group_send(
            self.room_group_name, {"type": "chat.message",
                                   "message": message,
                                   "user": serialize_user(user)}
        )

    # Receive message from room group
    async def chat_message(self, event):
        message = event["message"]
        user = event['user']

        # Send message to WebSocket
        await self.send(text_data=json.dumps({"message": message, "user": user}))


def serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
    }

