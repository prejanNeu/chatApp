from django.shortcuts import redirect, render
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q
from django.http import JsonResponse

from .models import ChatRoom, Message, MessageReadStatus
from .forms import MessageFileForm


def landing_view(request):
    if request.user.is_authenticated:
        return redirect("chat:index")
    return render(request, "chat/landing.html")


def get_rooms_context(user):
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
        is_online = False
        other_user_id = None
        if hasattr(room, 'private_chat'):
            private_chat = room.private_chat
            other_user = private_chat.user_a if private_chat.user_b == user else private_chat.user_b
            display_name = other_user.full_name if other_user.full_name else other_user.username
            is_online = other_user.is_online
            other_user_id = other_user.id

        room_data.append(
            {
                'room': room,
                'display_name': display_name,
                'is_online': is_online,
                'other_user_id': other_user_id,
                'last_message': last_message,
                'unread_count': unread_count,
                'last_message_timestamp': last_message.timestamp if last_message else room.created_at, # Fallback to room creation
                'avatar_url': other_user.avatar.url if other_user and other_user.avatar else None
            }
        )
    
    # Sort by last message timestamp descending
    room_data.sort(key=lambda x: x['last_message_timestamp'], reverse=True)
    
    # Get pending friend request count
    from friends.models import FriendRequest
    pending_requests_count = FriendRequest.objects.filter(
        to_user=user,
        is_accepted=False
    ).count()
    
    return {
        'rooms': room_data,
        'pending_requests_count': pending_requests_count
    }


@login_required
def index(request):
    user = request.user
    context = get_rooms_context(user)
    return render(request, "chat/index.html", context)


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
    # Limit to last 20 messages
    messages_qs = Message.objects.filter(room=room).select_related("user").order_by('-timestamp')[:20]
    messages_qs = reversed(messages_qs) # Reverse to show oldest first in the template

    # Get sidebar data
    room_data = get_rooms_context(request.user)

    # Calculate display name for the current room
    display_name = room.display_name
    if hasattr(room, 'private_chat'):
        private_chat = room.private_chat
        other_user = private_chat.user_a if private_chat.user_b == request.user else private_chat.user_b
        display_name = other_user.full_name if other_user.full_name else other_user.username

    # Get the other user in the room
    other_user = room.users.exclude(id=request.user.id).first()
    
    # Check if users are still friends
    are_friends = False
    if other_user:
        from friends.models import FriendRequest
        # Check if there's an accepted friend request between the two users
        are_friends = FriendRequest.objects.filter(
            Q(from_user=request.user, to_user=other_user, is_accepted=True) |
            Q(from_user=other_user, to_user=request.user, is_accepted=True)
        ).exists()
    # Get other context data
    other_context = get_rooms_context(request.user)
    
    context = {
        "room_name": room_name,
        "display_name": display_name,
        "chat_messages": messages_qs,
        "are_friends": are_friends,
        "other_user": other_user,
    }
    context.update(other_context)
    return render(request, "chat/room.html", context)


@login_required
def upload_file(request):
    if request.method == 'POST':
        form = MessageFileForm(request.POST, request.FILES)
        if form.is_valid():
            # Just save the file using FileSystemStorage for simplicity
            from django.core.files.storage import default_storage
            from django.core.files.base import ContentFile
            
            file = request.FILES['file']
            file_name = default_storage.save('chat_uploads/' + file.name, ContentFile(file.read()))
            file_url = default_storage.url(file_name)
            
            return JsonResponse({'file_url': file_url})
            
    return JsonResponse({'error': 'Invalid request'}, status=400)


@login_required
def get_messages(request, room_name):
    try:
        room = ChatRoom.objects.get(name=room_name)
    except ChatRoom.DoesNotExist:
        return JsonResponse({'error': 'Room not found'}, status=404)

    if request.user not in room.users.all():
        return JsonResponse({'error': 'Not allowed'}, status=403)

    offset = int(request.GET.get('offset', 0))
    limit = 20

    messages = Message.objects.filter(room=room).select_related('user').order_by('-timestamp')[offset:offset+limit]
    
    data = []
    for msg in messages:
        data.append({
            'id': msg.id,
            'sender': msg.user.username,
            'content': msg.content,
            'timestamp': msg.timestamp.isoformat(),
            'is_file': msg.is_file,
            'is_image': msg.is_image, # We added this property to the model
            'is_me': msg.user == request.user
        })
    
    return JsonResponse({'messages': data})