from django.shortcuts import redirect, render
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

from datetime import timedelta

from django.utils.autoreload import is_django_module

from accounts.models import CustomUser
from .models import ChatRoom, Message, MessageReadStatus, GroupChat
from .forms import MessageFileForm
from .utils import group_room_name
from .broadcast_utils import (
    broadcast_message_edited,
    broadcast_message_deleted,
    broadcast_message_update,
    broadcast_system_message,
    broadcast_group_update,
    broadcast_to_user,
)


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
        avatar_url = None
        is_group = False

        if hasattr(room, 'group_chat'):
            display_name = room.group_chat.name
            is_group = True
            if room.group_chat.icon:
                avatar_url = room.group_chat.icon.url
        elif hasattr(room, 'private_chat'):
            private_chat = room.private_chat
            other_user = private_chat.user_a if private_chat.user_b == user else private_chat.user_b
            display_name = other_user.full_name if other_user.full_name else other_user.username
            is_online = other_user.is_online
            other_user_id = other_user.id
            avatar_url = other_user.avatar.url if other_user.avatar else None

        room_data.append(
            {
                'room': room,
                'display_name': display_name,
                'is_online': is_online,
                'other_user_id': other_user_id,
                'last_message': last_message,
                'unread_count': unread_count,
                # Fallback to room creation
                'last_message_timestamp': last_message.timestamp if last_message else room.created_at,
                'avatar_url': avatar_url,
                'is_group': is_group,
                'group_chat': getattr(room, 'group_chat', None)
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

    # Get friends list for group creation
    friends = []
    accepted_requests = FriendRequest.objects.filter(
        (Q(from_user=user) | Q(to_user=user)) & Q(is_accepted=True)
    ).select_related('from_user', 'to_user')

    for req in accepted_requests:
        if req.from_user == user:
            friends.append(req.to_user)
        else:
            friends.append(req.from_user)

    return {
        'rooms': room_data,
        # TODO: we could probably use a context_processor for this
        # as this is something that is shared among all pages
        'pending_requests_count': pending_requests_count,
        'friends': friends
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

    messages_qs = Message.objects.filter(room=room).select_related(
        "user").order_by('-timestamp')[:20]
    # Reverse to show oldest first in the template
    messages_qs = reversed(messages_qs)

    # Get sidebar data
    # TODO: okay this is not used
    room_data = get_rooms_context(request.user)

    # Calculate display name for the current room
    display_name = room.display_name
    other_user = None
    are_friends = False
    is_group = False

    if hasattr(room, 'group_chat'):
        display_name = room.group_chat.name
        is_group = True
    elif hasattr(room, 'private_chat'):
        private_chat = room.private_chat
        other_user = private_chat.user_a if private_chat.user_b == request.user else private_chat.user_b
        display_name = other_user.full_name if other_user.full_name else other_user.username

        # Check if users are still friends
        if other_user:
            from friends.models import FriendRequest
            # Check if there's an accepted friend request between the two users
            are_friends = FriendRequest.objects.filter(
                Q(from_user=request.user, to_user=other_user, is_accepted=True) |
                Q(from_user=other_user, to_user=request.user, is_accepted=True)
            ).exists()

    # Get other context data
    other_context = get_rooms_context(request.user)

    # Get room members for group chat
    room_members = []
    friends_not_in_group = []
    group_chat = None
    if is_group:
        room_members = room.users.all()
        group_chat = room.group_chat
        
        # Get user's friends who are not in the group
        from friends.models import FriendRequest
        
        # Get all accepted friend requests
        friend_requests = FriendRequest.objects.filter(
            Q(from_user=request.user, is_accepted=True) |
            Q(to_user=request.user, is_accepted=True)
        )
        
        friends = set()
        for fr in friend_requests:
            friend = fr.to_user if fr.from_user == request.user else fr.from_user
            if friend not in room.users.all():
                friends.add(friend)
        
        friends_not_in_group = list(friends)

    context = {
        "room_name": room_name,
        "display_name": display_name,
        "chat_messages": messages_qs,
        "are_friends": are_friends,
        "other_user": other_user,
        "is_group": is_group,
        "group_chat": group_chat,
        "room_id": room.room_id,
        "room_members": room_members,
        "friends_not_in_group": friends_not_in_group,
    }
    context.update(other_context)
    return render(request, "chat/room.html", context)


@login_required
def upload_file(request):
    # File upload limits
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB in bytes
    ALLOWED_TYPES = {
        # Images
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        # Documents
        'application/pdf', 'text/plain',
        'application/msword',  # .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # .docx
        # Archives
        'application/zip', 'application/x-zip-compressed',
        'application/x-rar-compressed', 'application/x-7z-compressed'
    }

    if request.method == 'POST':
        form = MessageFileForm(request.POST, request.FILES)
        if form.is_valid():
            file = request.FILES['file']

            # Validate file size
            if file.size > MAX_FILE_SIZE:
                size_mb = file.size / (1024 * 1024)
                return JsonResponse({
                    'error': f'File too large ({size_mb:.1f}MB). Maximum size is 10MB.'
                }, status=400)

            # Validate file type
            if file.content_type not in ALLOWED_TYPES:
                return JsonResponse({
                    'error': f'File type not allowed. Allowed types: images, PDFs, documents, archives.'
                }, status=400)

            # Just save the file using FileSystemStorage for simplicity
            file_name = default_storage.save(
                'chat_uploads/' + file.name, ContentFile(file.read()))
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

    messages = Message.objects.filter(room=room).select_related(
        'user').order_by('-timestamp')[offset:offset+limit]

    data = []
    for msg in messages:
        data.append({
            'id': msg.id,
            'sender': msg.user.username,
            'content': msg.content,
            'timestamp': msg.timestamp.isoformat(),
            'is_file': msg.is_file,
            'is_image': msg.is_image,
            'is_me': msg.user == request.user
        })

    return JsonResponse({'messages': data})


@login_required
def create_group(request):
    if request.method == 'POST':
        group_name = request.POST.get('group_name')
        user_ids = request.POST.getlist('users')

        if not group_name:
            messages.error(request, "Group name is required.")
            return redirect('chat:index')

        if not user_ids:
            messages.error(request, "Select at least one friend.")
            return redirect('chat:index')

        try:
            with transaction.atomic():
                # Create room (UUID is auto-generated by model)
                room = ChatRoom.objects.create(
                    name=group_room_name(None, request.user.id),
                    display_name=group_name,
                )

                GroupChat.objects.create(
                    room=room,
                    name=group_name,
                    admin=request.user
                )

                room.users.add(request.user)

                # Add selected users
                User = get_user_model()
                users_to_add = User.objects.filter(id__in=user_ids)
                room.users.add(*users_to_add)

                # Broadcast group creation to all members
                for user in room.users.all():
                    broadcast_to_user(
                        user.id,
                        "group_created",
                        {
                            "room_id": str(room.room_id),
                            "room_name": group_name,
                        }
                    )

                messages.success(request, f"Group '{group_name}' created!")
                return redirect('chat:room', room_name=room.name)

        except Exception as e:
            messages.error(request, f"Failed to create group: {str(e)}")
            return redirect('chat:index')

    return redirect('chat:index')


@login_required
def edit_message(request, message_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)

    try:
        message = Message.objects.get(id=message_id)

        # Permission check: only the author can edit
        if message.user != request.user:
            return JsonResponse({'error': 'Permission denied'}, status=403)

        # Can't edit deleted messages
        if message.is_delete:
            return JsonResponse({'error': 'Cannot edit deleted message'}, status=400)

        # Can't edit file messages
        if message.is_file:
            return JsonResponse({'error': 'Cannot edit file messages'}, status=400)

        # Check if message is within 15-minute edit window
        time_since_sent = timezone.now() - message.timestamp
        if time_since_sent > timedelta(minutes=15):
            return JsonResponse({'error': 'Edit window expired (15 minutes)'}, status=400)

        new_content = request.POST.get('content', '').strip()
        if not new_content:
            return JsonResponse({'error': 'Content cannot be empty'}, status=400)

        # Update message
        message.content = new_content
        message.edited_at = timezone.now()
        message.save()

        # Broadcast edit event to room
        broadcast_message_edited(
            message.room.name,
            message.id,
            new_content,
            request.user.id
        )

        # Send sidebar update to all users in the room
        broadcast_message_update(
            message.room,
            "message_updated",
            "Edited a message.",
            request.user,
            is_delete=False,
        )

        return JsonResponse({'success': True, 'content': new_content})

    except Message.DoesNotExist:
        return JsonResponse({'error': 'Message not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def delete_message(request, message_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)

    try:
        message = Message.objects.get(id=message_id)

        # Permission check
        if message.user != request.user:
            return JsonResponse({'error': 'Permission denied'}, status=403)

        # Soft delete
        message.is_delete = True
        message.save()

        # Broadcast delete event to room
        broadcast_message_deleted(message.room.name, message.id)

        # Send sidebar update (show "Message deleted")
        broadcast_message_update(
            message.room,
            "message_updated",
            "Deleted a message.",
            request.user,
            is_delete=True,
        )

        return JsonResponse({'success': True})

    except Message.DoesNotExist:
        return JsonResponse({'error': 'Message not found'}, status=404)


@login_required
def leave_group(request, room_id):
    """Allow a user to leave a group chat"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)

    try:
        room = ChatRoom.objects.get(room_id=room_id)
        if not hasattr(room, 'group_chat'):
            return JsonResponse({'error': 'Not a group chat'}, status=400)

        group = room.group_chat

        # Remove user
        if request.user in room.users.all():
            room.users.remove(request.user)

            new_admin_id = None
            # If user was admin, assign new admin or delete group if empty
            if group.admin == request.user:
                if room.users.exists():
                    new_admin = room.users.first()
                    group.admin = new_admin
                    group.save()
                    new_admin_id = new_admin.id
                else:
                    # No users left, delete group
                    room.delete()  # Cascades to GroupChat
                    return JsonResponse({'status': 'ok', 'action': 'deleted'})

            # Notify remaining members with user_leave event
            from .broadcast_utils import broadcast_to_room
            broadcast_to_room(
                room.name,
                "chat_activity",
                {
                    "event": "user_leave",
                    "username": request.user.username
                }
            )

            broadcast_group_update(
                room.name,
                "member_left",
                user_id=request.user.id,
                new_admin_id=new_admin_id
            )

            return JsonResponse({'status': 'ok'})

        return JsonResponse({'error': 'User not in group'}, status=400)

    except ChatRoom.DoesNotExist:
        return JsonResponse({'error': 'Room not found'}, status=404)


@login_required
def kick_member(request, room_id, user_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)

    try:
        room = ChatRoom.objects.get(room_id=room_id)
        if not hasattr(room, 'group_chat'):
            return JsonResponse({'error': 'Not a group chat'}, status=400)

        group = room.group_chat

        # Check if request user is admin
        if group.admin != request.user:
            return JsonResponse({'error': 'Only admin can kick members'}, status=403)

        target_user = CustomUser.objects.get(id=user_id)

        if target_user == request.user:
            return JsonResponse({'error': 'Cannot kick yourself'}, status=400)

        if target_user in room.users.all():
            room.users.remove(target_user)

            # Notify room
            broadcast_system_message(
                room.name,
                f"{target_user.username} was removed by admin"
            )

            broadcast_group_update(
                room.name,
                "member_kicked",
                user_id=target_user.id
            )

            # Notify kicked user specifically (to refresh their page/redirect)
            broadcast_to_user(
                target_user.id,
                "kicked_from_group",
                {
                    "room_id": str(room.room_id),
                    "room_name": group.name
                }
            )

            return JsonResponse({'status': 'ok'})

        return JsonResponse({'error': 'User not in group'}, status=400)

    except (ChatRoom.DoesNotExist, CustomUser.DoesNotExist):
        return JsonResponse({'error': 'Room or user not found'}, status=404)


@login_required
def transfer_admin(request, room_id, user_id):
    """Transfer admin rights to another member"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)

    try:
        room = ChatRoom.objects.get(room_id=room_id)
        if not hasattr(room, 'group_chat'):
            return JsonResponse({'error': 'Not a group chat'}, status=400)

        group = room.group_chat

        if group.admin != request.user:
            return JsonResponse({'error': 'Only admin can transfer rights'}, status=403)

        target_user = CustomUser.objects.get(id=user_id)

        if target_user not in room.users.all():
            return JsonResponse({'error': 'User not in group'}, status=400)

        group.admin = target_user
        group.save()

        # Notify room
        broadcast_system_message(
            room.name,
            f"Admin rights transferred to {target_user.username}"
        )

        # Real-time UI update
        broadcast_group_update(
            room.name,
            "admin_transferred",
            new_admin_id=target_user.id,
            old_admin_id=request.user.id
        )
        
        # Notify new admin
        broadcast_to_user(
            target_user.id,
            "admin_transferred",
            {
                "room_id": str(room.room_id),
                "room_name": group.name
            }
        )

        return JsonResponse({'status': 'ok'})

    except (ChatRoom.DoesNotExist, CustomUser.DoesNotExist):
        return JsonResponse({'error': 'Room or user not found'}, status=404)


@login_required
def delete_group(request, room_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)

    try:
        room = ChatRoom.objects.get(room_id=room_id)
        if not hasattr(room, 'group_chat'):
            return JsonResponse({'error': 'Not a group chat'}, status=400)

        group = room.group_chat

        if group.admin != request.user:
            return JsonResponse({'error': 'Only admin can delete group'}, status=403)

        # Notify all members before deletion
        for user in room.users.all():
            broadcast_to_user(
                user.id,
                "group_deleted",
                {
                    "room_id": str(room.room_id),
                    "room_name": group.name
                }
            )

        room.delete()
        return JsonResponse({'status': 'ok'})

    except ChatRoom.DoesNotExist:
        return JsonResponse({'error': 'Room not found'}, status=404)


@login_required
def update_status(request):
    """Update user online status based on Page Visibility API"""
    if request.method == 'POST':
        import json
        try:
            data = json.loads(request.body)
            is_online = data.get('is_online', True)
        except:
            # Fallback for FormData from sendBeacon
            is_online = request.POST.get('is_online', 'true') == 'true'

        request.user.is_online = is_online
        request.user.save(update_fields=['is_online'])

        # Broadcast status change
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()

        # Get all rooms this user is part of
        rooms = request.user.chat_rooms.prefetch_related('users').all()
        notified_users = set()

        for room in rooms:
            for other_user in room.users.all():
                if other_user != request.user and other_user.id not in notified_users:
                    async_to_sync(channel_layer.group_send)(
                        f"notification_{other_user.id}",
                        {
                            "type": "notify",
                            "data": {
                                "event": "status_change",
                                "user_id": request.user.id,
                                "is_online": is_online
                            }
                        }
                    )
                    notified_users.add(other_user.id)

        return JsonResponse({'status': 'ok'})

    return JsonResponse({'error': 'POST required'}, status=400)


@login_required
def add_member(request, room_id, user_id):
    """Add a new member to the group (any member can do this)"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)
    
    try:
        room = ChatRoom.objects.get(room_id=room_id)
        if not hasattr(room, 'group_chat'):
            return JsonResponse({'error': 'Not a group chat'}, status=400)
        
        group = room.group_chat
        
        # Check if request user is a member
        if request.user not in room.users.all():
            return JsonResponse({'error': 'You are not a member'}, status=403)
        
        # Get target user
        target_user = CustomUser.objects.get(id=user_id)
        
        # Verify friendship
        from .utils import are_friends
        if not are_friends(request.user, target_user):
            return JsonResponse({'error': 'Can only add friends'}, status=400)
        
        if target_user in room.users.all():
            return JsonResponse({'error': 'User already in group'}, status=400)
        
        # Add user
        room.users.add(target_user)
        
        # Broadcast to room
        broadcast_system_message(
            room.name,
            f"{target_user.username} was added by {request.user.username}"
        )
        
        broadcast_group_update(
            room.name,
            "member_added",
            user_id=target_user.id,
            added_by=request.user.id
        )
        
        # Notify new member
        broadcast_to_user(
            target_user.id,
            "added_to_group",
            {
                "room_id": str(room.room_id),
                "room_name": group.name,
                "added_by": request.user.username
            }
        )
        
        return JsonResponse({'status': 'ok'})
    
    except (ChatRoom.DoesNotExist, CustomUser.DoesNotExist):
        return JsonResponse({'error': 'Room or user not found'}, status=404)
