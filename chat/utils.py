from django.db import transaction
from django.db.models import Q

from .models import ChatRoom, PrivateChat
from friends.models import FriendRequest
import hashlib


def serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
    }


def get_sorted_pair(u1, u2):
    return (u1, u2) if u1.id < u2.id else (u2, u1)


@transaction.atomic
def get_or_create_private_room(user, friend):
    """
    Returns (room, created_bool). Ensures private chat exists for the pair.
    Uses sorted ids so pair order doesn't matter.
    """
    u_small, u_big = get_sorted_pair(user, friend)

    # Try to find existing PrivateChat
    try:
        pc = PrivateChat.objects.select_related(
            "room").get(user_a=u_small, user_b=u_big)
        return pc.room, False
    except PrivateChat.DoesNotExist:
        # create new ChatRoom and PrivateChat
        # TODO: maybe we use a hash to make the room name more cryptic
        room = ChatRoom.objects.create(
            name=private_room_name(u_small, u_big), display_name=friend.full_name)
        # attach both users to the room.users M2M
        room.users.add(user, friend)
        pc = PrivateChat.objects.create(
            user_a=u_small, user_b=u_big, room=room)
        return room, True


def are_friends(user1, user2):
    return FriendRequest.objects.filter(
        (Q(from_user=user1, to_user=user2) | Q(from_user=user2, to_user=user1)),
        is_accepted=True
    ).exists()


def private_room_name(user1, user2):
    base = f"{min(user1.id, user2.id)}:{max(user1.id, user2.id)}"
    return hashlib.sha256(base.encode()).hexdigest()


def group_room_name(room_id, admin_id):
    """Generate unique group room name using UUID if room_id not provided"""
    import uuid
    if room_id is None:
        # Generate unique identifier for new groups
        room_id = str(uuid.uuid4())
    base = f"group:{room_id}:{admin_id}"
    return hashlib.sha256(base.encode()).hexdigest()
