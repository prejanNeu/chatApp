from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from .models import ChatRoom, Message, MessageReadStatus


def index(request):

    user = request.user
    rooms = ChatRoom.objects.filter(users=user)

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
    room, created = ChatRoom.objects.get_or_create(name=room_name)
    room.users.add(request.user)

    # TODO: how to retrieve more messages when the user scrolls up more
    messages = Message.objects.filter(room=room).select_related(
        "user").order_by("timestamp")[:50]
    return render(request, "chat/room.html", {
        "room_name": room_name,
        "messages": messages
    })
