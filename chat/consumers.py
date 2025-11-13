import json

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone
from .models import ChatRoom, Message, MessageReadStatus
from accounts.models import CustomUser
from .utils import serialize_user


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"chat_{self.room_name}"

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        room = await sync_to_async(ChatRoom.objects.get)(name=self.room_name)

        await mark_messages_as_read(self.scope['user'], room)

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
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
        room = await sync_to_async(ChatRoom.objects.get)(name=self.room_name)

        msg = await sync_to_async(Message.objects.create)(
            user=user,
            room=room,
            content=message
        )

        room_users = await sync_to_async(lambda: list(room.users.exclude(id=user.id)))()
        for u in room_users:
            await sync_to_async(MessageReadStatus.objects.create)(
                user=u, message=message, is_read=False
            )
            await sync_to_async(Notification.objects.create)(
                user=u,
                type='MESSAGE',
                message=f"New message from {message.user.username}",
                link=f"/chat/{message.room.room_id}/",
            )

        # Send message to room group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat.message",
                "message": message,
                "user": serialize_user(user),
                "timestamp": msg.timestamp.isoformat(),
            },
        )

    # Receive message from room group
    async def chat_message(self, event):

        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            "message": event["message"],
            "user": event['user'],
            "timestamp": event['timestamp'],
        }))


@sync_to_async
def mark_messages_as_read(user, room):
    MessageReadStatus.objects.filter(
        user=user, message__room=room, is_read=False
    ).update(is_read=True, read_at=timezone.now())
