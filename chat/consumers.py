import json

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone
from .models import ChatRoom, Message, MessageReadStatus
from .utils import serialize_user


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"chat_{self.room_name}"
        self.user = self.scope["user"]

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        room = await sync_to_async(ChatRoom.objects.get)(name=self.room_name)

        await mark_messages_as_read(self.user, room)

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
        match text_data_json["type"]:
            case "message":

                message = text_data_json["data"]["message"]
                user = self.user
                room = await sync_to_async(ChatRoom.objects.get)(name=self.room_name)

                # Save the message
                msg = await sync_to_async(Message.objects.create)(
                    user=user,
                    room=room,
                    content=message
                )

                # Mark the message as unread by other users in the group
                room_users = await sync_to_async(lambda: list(room.users.exclude(id=user.id)))()
                for u in room_users:
                    await sync_to_async(MessageReadStatus.objects.create)(
                        user=u, message=msg, is_read=False
                    )

                    # Broadcast Message Notification
                    await self.channel_layer.group_send(
                        f"notification_{u.id}",
                        {

                            "type": "notify",
                            "data": {
                                "event": "new_message",
                                "from": msg.user.username,
                                "room_id": str(msg.room.room_id),
                                "room_name": msg.room.name,
                                "content": msg.content
                            }

                        }
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
            case "message_read":
                room = await sync_to_async(ChatRoom.objects.get)(name=self.room_name)
                await mark_messages_as_read(self.user, room)
            case _:
                print("Unkown type")

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
