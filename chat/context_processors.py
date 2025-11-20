from .models import MessageReadStatus

def unread_count(request):
    if request.user.is_authenticated:
        count = MessageReadStatus.objects.filter(user=request.user, is_read=False).count()
        return {'unread_count': count}
    return {'unread_count': 0}
