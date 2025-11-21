import json

from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone
from .models import ChatRoom, Message, MessageReadStatus
from .utils import serialize_user
from channels.exceptions import DenyConnection


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

        if self.user not in await database_sync_to_async(lambda: list(room.users.all()))():
            raise DenyConnection("Not allowed.")

        await mark_messages_as_read(self.user, room)

        await self.accept()

        # Broadcast user_join event
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_activity",
                "data": {
                    "event": "user_join",
                    "username": self.user.username
                }
            }
        )

        # Update online status
        await update_user_online_status(self.user, True)

    async def disconnect(self, close_code):
        # Update online status
        await update_user_online_status(self.user, False)

        # Broadcast user_leave event
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_activity",
                "data": {
                    "event": "user_leave",
                    "username": self.user.username
                }
            }
        )

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
                is_file = text_data_json["data"].get("is_file", False)
                user = self.user
                room = await sync_to_async(ChatRoom.objects.get)(name=self.room_name)

                # Save the message
                msg = await sync_to_async(Message.objects.create)(
                    user=user,
                    room=room,
                    content=message,
                    is_file=is_file
                )

                # Send message to room group
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "chat.message",
                        "data": {
                            "id": msg.id,
                            "message": msg.content,
                            "sender": serialize_user(msg.user),
                            "timestamp": msg.timestamp.isoformat(),
                            "is_file": msg.is_file
                        }
                    }
                )

                room_users = await sync_to_async(lambda: list(room.users.all()))()
                for u in room_users:
                    # is_read = (u == user)
                    # TODO: Maybe this should be false by default?
                    is_read = False
                    await sync_to_async(MessageReadStatus.objects.create)(
                        user=u, message=msg, is_read=is_read
                    )

                    # Send notification to each user (including sender for sidebar update)
                    await self.channel_layer.group_send(
                        f"notification_{u.id}",
                        {
                            "type": "notify",
                            "data": {
                                "event": "new_message",
                                "from": msg.user.username,
                                "from_user_id": msg.user.id,
                                "from_full_name": msg.user.full_name or msg.user.username,
                                "room_id": str(msg.room.room_id),
                                "room_name": msg.room.name,
                                "content": msg.content,
                                "is_file": msg.is_file,
                                "is_image": msg.is_image
                            }
                        }
                    )

            case "message_read":
                room = await sync_to_async(ChatRoom.objects.get)(name=self.room_name)
                # all users currently in the room will send this "receipt" acknowledging that they've "read" the message
                await mark_messages_as_read(self.user, room)

                await self.channel_layer.group_send(
                    f"notification_{self.user.id}",
                    {
                        "type": "notify",
                        "data": {
                            "event": "unread_cleared",
                            "room_id": str(room.room_id),
                        }
                    }
                )

            case "typing":
                # Broadcast typing status to room group
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "chat.activity",
                        "data": {
                            "event": "typing",
                            "username": self.user.username,
                            "is_typing": text_data_json["data"]["is_typing"]
                        }
                    }
                )

            case _:
                print("Unknown type")

    # Receive message from room group

    async def chat_message(self, event):

        # Send message to WebSocket
        await self.send(
            text_data=json.dumps(event["data"])
        )

    async def chat_activity(self, event):
        await self.send(
            text_data=json.dumps(event["data"])
        )

    async def group_update(self, event):
        """Handle group management updates"""
        await self.send(text_data=json.dumps(event['data']))

    async def chat_message_edited(self, event):
        """Handle message edit events"""
        await self.send(text_data=json.dumps({
            'event': 'message_edited',
            'message_id': event['data']['message_id'],
            'content': event['data']['content'],
            'sender_id': event['data']['sender_id']
        }))

    async def chat_message_deleted(self, event):
        """Handle message delete events"""
        await self.send(text_data=json.dumps({
            'event': 'message_deleted',
            'message_id': event['data']['message_id']
        }))


@database_sync_to_async
def mark_messages_as_read(user, room):
    MessageReadStatus.objects.filter(
        user=user, message__room=room, is_read=False
    ).update(is_read=True, read_at=timezone.now())


@database_sync_to_async
def update_user_online_status(user, is_online):
    user.is_online = is_online
    user.save()

    # Broadcast status change to all friends (users in shared rooms)
    # We need to import channel_layer here or pass it
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    channel_layer = get_channel_layer()

    # Get all rooms this user is part of with pre-fetched users
    rooms = user.chat_rooms.prefetch_related('users').all()
    notified_users = set()

    for room in rooms:
        for other_user in room.users.all():
            if other_user != user and other_user.id not in notified_users:
                # Send notification to this user
                async_to_sync(channel_layer.group_send)(
                    f"notification_{other_user.id}",
                    {
                        "type": "notify",
                        "data": {
                            "event": "status_change",
                            "user_id": user.id,
                            "is_online": is_online
                        }
                    }
                )
                notified_users.add(other_user.id)
