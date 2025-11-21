from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from accounts.models import CustomUser
from .models import FriendRequest
from chat.utils import get_or_create_private_room, are_friends 

@login_required
def friend_list(request):
    user = request.user
    friends_from = FriendRequest.objects.filter(
        from_user=user, is_accepted=True).values_list('to_user', flat=True)
    friends_to = FriendRequest.objects.filter(
        to_user=user, is_accepted=True).values_list('from_user', flat=True)
    friends = CustomUser.objects.filter(
        id__in=list(friends_from) + list(friends_to))
    
    # Get pending friend request count
    pending_requests_count = FriendRequest.objects.filter(
        to_user=user,
        is_accepted=False
    ).count()

    return render(request, "friends/friends.html", {
        "friends": friends,
        "pending_requests_count": pending_requests_count
    })


@login_required
def friend_requests(request):
    incoming = FriendRequest.objects.filter(
        to_user=request.user, is_accepted=False)
    outgoing = FriendRequest.objects.filter(
        from_user=request.user, is_accepted=False)
    pending_requests_count = incoming.count() # Count of incoming requests

    return render(request, "friends/friend_requests.html", {
        "incoming": incoming,
        "outgoing": outgoing,
        "pending_requests_count": pending_requests_count
    })


@login_required
def send_friend_request(request, user_id):
    to_user = CustomUser.objects.get(id=user_id)
    if to_user == request.user:
        messages.error(
            request, "You cannot send a friend request to yourself.")
        return redirect("friends:friend_list")

    friend_request, created = FriendRequest.objects.get_or_create(
        from_user=request.user,
        to_user=to_user
    )

    if not created:
        messages.info(request, "Friend request already sent.")
    else:
        to_user_name = to_user.full_name or to_user.username
        messages.success(
            request, f"Friend request sent to {to_user_name}!")
        
        # Send WebSocket notification to recipient
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"notification_{to_user.id}",
            {
                "type": "notify",
                "data": {
                    "event": "friend_request_received",
                    "from_user": request.user.username,
                    "from_user_id": request.user.id
                }
            }
        )
    return redirect("friends:friend_list")


@login_required
def accept_friend_request(request, request_id):
    friend_request = FriendRequest.objects.get(
        id=request_id, to_user=request.user)
    friend_request.is_accepted = True
    friend_request.save()
    
    # Auto-create chat room
    get_or_create_private_room(friend_request.from_user, friend_request.to_user)
    
    messages.success(
        request, f"You are now friends with {friend_request.from_user.full_name}!")
    
    # Send WebSocket notification to requester that request was accepted
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"notification_{friend_request.from_user.id}",
        {
            "type": "notify",
            "data": {
                "event": "friend_request_accepted",
                "from_user": request.user.username,
                "from_user_id": request.user.id
            }
        }
    )
    return redirect("friends:friend_requests")


@login_required
def reject_friend_request(request, request_id):
    friend_request = FriendRequest.objects.get(
        id=request_id, to_user=request.user)
    from_user_id = friend_request.from_user.id
    friend_request.delete()
    from_user_name = friend_request.from_user.full_name or friend_request.from_user.username
    messages.info(
        request, f"Declined friend request from {from_user_name}.")
    
    # Send WebSocket notification to requester that request was rejected
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"notification_{from_user_id}",
        {
            "type": "notify",
            "data": {
                "event": "friend_request_rejected",
                "from_user": request.user.username,
                "from_user_id": request.user.id
            }
        }
    )
    return redirect("friends:friend_requests")


@login_required
def remove_friend(request, friend_id):
    friend = CustomUser.objects.get(id=friend_id)
    
    # Find the friend request that established this friendship
    # It could be from user -> friend OR friend -> user
    FriendRequest.objects.filter(
        Q(from_user=request.user, to_user=friend) | 
        Q(from_user=friend, to_user=request.user),
        is_accepted=True
    ).delete()
    
    messages.success(request, f"You have unfriended {friend.full_name or friend.username}.")
    return redirect("friends:friend_list")


@login_required
def start_private_chat(request, friend_id):
    friend = CustomUser.objects.get(id=friend_id)

    if not are_friends(request.user, friend):
        messages.error(request, "You can only chat privately with friends.")
        return redirect("friends:friend_list")

    room, created = get_or_create_private_room(request.user, friend)
    # TODO: Maybe we can obfuscate the name better here
    # and have corresponding enforcement in the backend for truly private chats
    return redirect("chat:room", room_name=room.name)


@login_required
def cancel_friend_request(request, request_id):
    friend_request = FriendRequest.objects.get(id=request_id, from_user=request.user)
    to_user_id = friend_request.to_user.id
    friend_request.delete()
    messages.info(request, "Friend request cancelled.")
    
    # Send WebSocket notification to recipient that request was cancelled
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"notification_{to_user_id}",
        {
            "type": "notify",
            "data": {
                "event": "friend_request_cancelled",
                "from_user": request.user.username,
                "from_user_id": request.user.id
            }
        }
    )
    return redirect("friends:friend_requests")



@login_required
def search_users(request):

    current_user = request.user
    all_users = CustomUser.objects.exclude(id=current_user.id)

    requests = FriendRequest.objects.filter(
        Q(from_user=current_user) | Q(to_user=current_user)
    )

    sent_reqs = {fr.to_user_id: fr for fr in requests if fr.from_user_id == current_user.id}   # send request by user 
    received_reqs = {fr.from_user_id: fr for fr in requests if fr.to_user_id == current_user.id}
    adding = []

    for user in all_users:
        user_id = user.id

        if user_id in sent_reqs:
            fr = sent_reqs[user_id]
            adding.append({
                "request_id":fr.id,
                "user": user,
                "friend": fr.is_accepted,
                "is_pending": True,
                "requested": True,
            })

        elif user_id in received_reqs:
            fr = received_reqs[user_id]
            adding.append({
                "request_id": fr.id,
                "user": user,
                "friend": fr.is_accepted,
                "is_pending": False,
                "requested": True
            })

        else:
            
            adding.append({
                "request_id": None,
                "user": user,
                "friend": False,
                "is_pending": False,
                "requested": False
            }) 
            
    
            
    # Friend Recommendations (Friends of Friends)
    # 1. Get IDs of current friends
    friends_from = FriendRequest.objects.filter(
        from_user=current_user, is_accepted=True).values_list('to_user', flat=True)
    friends_to = FriendRequest.objects.filter(
        to_user=current_user, is_accepted=True).values_list('from_user', flat=True)
        
    friend_ids = list(friends_from) + list(friends_to)
    
    # 2. Find friends of my friends
    # We look for accepted requests where one user is in my friend_ids
    # and the other is NOT me and NOT in my friend_ids
    suggestions = []
    suggested_ids = set()
    
    potential_friends = FriendRequest.objects.filter(
        (Q(from_user__id__in=friend_ids) | Q(to_user__id__in=friend_ids)),
        is_accepted=True
    ).select_related('from_user', 'to_user')
    
    for pf in potential_friends:
        candidate = None
        if pf.from_user_id in friend_ids:
            candidate = pf.to_user
        else:
            candidate = pf.from_user
            
        if candidate.id != current_user.id and candidate.id not in friend_ids and candidate.id not in suggested_ids:
            # Check if I already sent a request to them (pending)
            if candidate.id not in sent_reqs and candidate.id not in received_reqs:
                suggestions.append(candidate)
                suggested_ids.add(candidate.id)
    
    # Get pending friend request count
    pending_requests_count = FriendRequest.objects.filter(
        to_user=request.user,
        is_accepted=False
    ).count()
    
    return render(request, "friends/search_friend_list.html", {
        "adding": adding,
        "suggestions": suggestions,
        "pending_requests_count": pending_requests_count
    })
            
