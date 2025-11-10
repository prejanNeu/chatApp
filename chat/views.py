from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from .models import ChatRoom, Message


def index(request):
    return render(request, "chat/index.html")


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
