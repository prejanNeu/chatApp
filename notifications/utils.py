from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

@database_sync_to_async
def update_user_online_status(user, is_online):
    user.is_online = is_online
    user.save()

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
