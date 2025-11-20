from .models import Message, MessageReadStatus
from friends.models import FriendRequest


def unread_count(request):
    if request.user.is_authenticated:
        total_unread = MessageReadStatus.objects.filter(
            user=request.user,
            is_read=False
        ).count()
        return {'unread_count': total_unread}
    return {'unread_count': 0}


def friend_requests_count(request):
    """
    Context processor to add pending friend request count to all templates
    """
    if request.user.is_authenticated:
        pending_requests_count = FriendRequest.objects.filter(
            to_user=request.user,
            is_accepted=False
        ).count()
        return {'pending_requests_count': pending_requests_count}
    return {'pending_requests_count': 0}
