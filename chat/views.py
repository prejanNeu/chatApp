from django.shortcuts import redirect, render
from django.contrib.auth.decorators import login_required
from .models import ChatRoom, Message, MessageReadStatus
from django.contrib import messages


@login_required
def index(request):

    user = request.user
    rooms = user.chat_rooms.all()

    room_data = []
    for room in rooms:
        last_message = room.messages.last()
        unread_count = MessageReadStatus.objects.filter(
            user=user,
            message__room=room,
            is_read=False
        ).count()

        # Logic for dynamic display name
        display_name = room.display_name
        if hasattr(room, 'private_chat'):
            private_chat = room.private_chat
            other_user = private_chat.user_a if private_chat.user_b == user else private_chat.user_b
            display_name = other_user.full_name or other_user.username

        room_data.append(
            {
                'room': room,
                'display_name': display_name,
                'last_message': last_message,
                'unread_count': unread_count
            }
        )

    return render(request, "chat/index.html", {"rooms": room_data})


@login_required
def room(request, room_name):
    try:
        room = ChatRoom.objects.get(name=room_name)
    except ChatRoom.DoesNotExist:
        messages.error(request, "Chat room does not exist.")
        return redirect("chat:index")

    # permission check
    if request.user not in room.users.all():
        messages.error(request, "You are not allowed to join the chat.")
        return redirect("chat:index")

    # TODO: Don't send all the messages at once
    messages_qs = Message.objects.filter(room=room).select_related("user")

    return render(request, "chat/room.html", {
        "room_name": room_name,
        "messages": messages_qs
    })
