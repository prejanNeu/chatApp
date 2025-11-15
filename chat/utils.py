from django.db import transaction
from .models import ChatRoom, PrivateChat


def serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
    }


def get_sorted_pair(u1, u2):
    return (u1, u2) if u1.id < u2.id else (u2, u1)


@transaction.atomic
def get_or_create_private_room(user1, user2, room_name_prefix="private_chat"):
    """
    Returns (room, created_bool). Ensures private chat exists for the pair.
    Uses sorted ids so pair order doesn't matter.
    """
    u_small, u_big = get_sorted_pair(user1, user2)

    # Try to find existing PrivateChat
    try:
        pc = PrivateChat.objects.select_related(
            "room").get(user_a=u_small, user_b=u_big)
        return pc.room, False
    except PrivateChat.DoesNotExist:
        # create new ChatRoom and PrivateChat
        # TODO: maybe we use a hash to make the room name more cryptic
        room = ChatRoom.objects.create(
            name=f"{room_name_prefix}_{user1.username}_{user2.username}")
        # attach both users to the room.users M2M
        room.users.add(user1, user2)
        pc = PrivateChat.objects.create(
            user_a=u_small, user_b=u_big, room=room)
        return room, True
