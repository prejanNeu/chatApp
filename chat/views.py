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

        room_data.append(
            {
                'room': room,
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

    messages_qs = Message.objects.filter(room=room).select_related(
        "user").order_by("timestamp")[:50]

    return render(request, "chat/room.html", {
        "room_name": room_name,
        "messages": messages_qs
    })
