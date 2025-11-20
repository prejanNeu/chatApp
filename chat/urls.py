from django.urls import path
from . import views

app_name = "chat"
urlpatterns = [
    path("", views.index, name="index"),
    path("upload/", views.upload_file, name="upload_file"),
    path("messages/<str:room_name>/", views.get_messages, name="get_messages"),
    path("<str:room_name>/", views.room, name="room"),
]
