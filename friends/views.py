from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from .models import CustomUser, FriendRequest
from chat.utils import get_or_create_private_room, are_friends
from django.db.models import Q 

@login_required
def friend_list(request):
    user = request.user
    friends_from = FriendRequest.objects.filter(
        from_user=user, is_accepted=True).values_list('to_user', flat=True)
    friends_to = FriendRequest.objects.filter(
        to_user=user, is_accepted=True).values_list('from_user', flat=True)
    friends = CustomUser.objects.filter(
        id__in=list(friends_from) + list(friends_to))

    return render(request, "friends/friends.html", {"friends": friends})


@login_required
def friend_requests(request):
    incoming = FriendRequest.objects.filter(
        to_user=request.user, is_accepted=False)
    outgoing = FriendRequest.objects.filter(
        from_user=request.user, is_accepted=False)

    return render(request, "friends/friend_requests.html", {
        "incoming": incoming,
        "outgoing": outgoing,
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
        messages.info(request, "Friend Request is already sent.")
    else:
        messages.success(
            request, f"Friend Request Sent: {friend_request}")
    return redirect("friends:friend_list")


@login_required
def accept_friend_request(request, request_id):
    friend_request = FriendRequest.objects.get(
        id=request_id, to_user=request.user)
    friend_request.is_accepted = True
    friend_request.save()
    messages.success(
        request, f"You are now friends with {friend_request.from_user.full_name}!")
    return redirect("friends:friend_requests")


@login_required
def reject_friend_request(request, request_id):
    friend_request = FriendRequest.objects.get(
        id=request_id, to_user=request.user)
    friend_request.delete()
    messages.info(
        request, f"You rejected {friend_request.from_user.full_name}'s friend request!")
    return redirect("friends:friend_requests")


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
                "user": user,
                "friend": fr.is_accepted,
                "is_pending": True
            })

        elif user_id in received_reqs:
            fr = received_reqs[user_id]
            adding.append({
                "user": user,
                "friend": fr.is_accepted,
                "is_pending": False
            })

        else:
            adding.append({
                "user": user,
                "friend": False,
                "is_pending": False,
            })
            
            
            # is_pending -->True  is not accepted by other 
            # is_pending -->True  isnot accepted by current user 
            
    
            
    return render(request, "friends/search_friend_list.html", {"adding": adding})
            
