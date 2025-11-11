from django.urls import path
from . import views

urlpatterns = [
    path("", views.friend_list, name="friend_list"),
    path("requests/", views.friend_requests, name="friend_requests"),
    path("add/<int:user_id>/", views.send_friend_request,
         name="send_friend_request"),
    path("accept/<int:request_id>/", views.accept_friend_request,
         name="accept_friend_request"),
    path("reject/<int:request_id>", views.reject_friend_request,
         name="reject_friend_request"),

]
