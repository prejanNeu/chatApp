from django.shortcuts import render
from django.contrib.auth.decorators import login_required
import logging

logger = logging.getLogger(__name__)


def index(request):
    return render(request, "chat/index.html")


@login_required
def room(request, room_name):
    return render(request, "chat/room.html", {"room_name": room_name})
