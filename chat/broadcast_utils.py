"""
Broadcast utilities for WebSocket notifications.

This module provides reusable functions for broadcasting events to chat rooms
and user notification groups, eliminating code duplication across views.
"""

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone


def get_channel():
    """Get the channel layer instance."""
    return get_channel_layer()


def broadcast_to_room(room_name, event_type, data):
    """
    Broadcast an event to all users in a chat room.

    Args:
        room_name: The hashed room name
        event_type: Event type (e.g., 'chat_message', 'chat_activity', 'group_update')
        data: Dictionary of event data
    """
    channel_layer = get_channel()
    async_to_sync(channel_layer.group_send)(
        f"chat_{room_name}",
        {
            "type": event_type,
            "data": data
        }
    )


def broadcast_to_user(user_id, event, data):
    """
    Broadcast a notification to a specific user's notification group.

    Args:
        user_id: The user's ID
        event: Event name (e.g., 'new_message', 'status_change', 'kicked_from_group')
        data: Dictionary of event data (must include 'event' key)
    """
    channel_layer = get_channel()
    data['event'] = event  # Ensure event is in data
    async_to_sync(channel_layer.group_send)(
        f"notification_{user_id}",
        {
            "type": "notify",
            "data": data
        }
    )


def broadcast_to_room_users(room, event, data):
    """
    Broadcast a notification to all users in a room via their notification groups.

    Args:
        room: ChatRoom instance
        event: Event name
        data: Dictionary of event data (will be merged with event key)
    """
    for user in room.users.all():
        broadcast_to_user(user.id, event, data.copy())


def broadcast_message_update(room, event, content, sender, is_delete, is_group=None):
    """
    Broadcast a message update (edit/delete) to all users in a room.

    Args:
        room: ChatRoom instance
        event: Event name ('message_updated')
        content: New message content
        sender: User who made the change
        is_group: Whether this is a group chat (auto-detected if None)
    """
    if is_group is None:
        is_group = hasattr(room, 'group_chat')

    data = {
        "room_id": str(room.room_id),
        "content": content,
        "from": sender.username,
        "from_user_id": sender.id,
        "from_full_name": sender.full_name or sender.username,
        "is_group": is_group,
        "is_delete": is_delete,
    }

    broadcast_to_room_users(room, event, data)


def broadcast_chat_message(room_name, message_id, content, sender, timestamp, is_file=False):
    """
    Broadcast a chat message to the room.

    Args:
        room_name: The hashed room name
        message_id: Message ID
        content: Message content
        sender: Dictionary with sender info (username, id, full_name)
        timestamp: Message timestamp (ISO format string)
        is_file: Whether this is a file message
    """
    broadcast_to_room(
        room_name,
        "chat_message",
        {
            "id": message_id,
            "message": content,
            "sender": sender,
            "timestamp": timestamp,
            "is_file": is_file
        }
    )


def broadcast_message_edited(room_name, message_id, content, sender_id):
    """
    Broadcast a message edit event to the room.

    Args:
        room_name: The hashed room name
        message_id: Message ID
        content: New message content
        sender_id: ID of user who edited the message
    """
    broadcast_to_room(
        room_name,
        "chat_message_edited",
        {
            "event": "message_edited",
            "message_id": message_id,
            "content": content,
            "sender_id": sender_id
        }
    )


def broadcast_message_deleted(room_name, message_id):
    """
    Broadcast a message delete event to the room.

    Args:
        room_name: The hashed room name
        message_id: Message ID
    """
    broadcast_to_room(
        room_name,
        "chat_message_deleted",
        {
            "event": "message_deleted",
            "message_id": message_id
        }
    )


def broadcast_group_update(room_name, event_type, **kwargs):
    """
    Broadcast a group management update to the room.

    Args:
        room_name: The hashed room name
        event_type: Type of group update ('member_left', 'member_kicked', 'admin_transferred')
        **kwargs: Additional data (user_id, new_admin_id, old_admin_id, etc.)
    """
    data = {
        "event": "group_update",
        "event_type": event_type
    }
    data.update(kwargs)

    broadcast_to_room(room_name, "group_update", data)


def broadcast_system_message(room_name, message):
    """
    Broadcast a system message to the room.

    Args:
        room_name: The hashed room name
        message: System message text
    """
    broadcast_to_room(
        room_name,
        "chat_message",
        {
            "message": message,
            "sender": {"username": "System", "id": 0},
            "timestamp": timezone.now().isoformat(),
            "is_file": False
        }
    )
