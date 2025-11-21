from django.urls import path
from . import views

app_name = "chat"
urlpatterns = [
    path("", views.index, name="index"),
    path("upload/", views.upload_file, name="upload_file"),
    path("messages/<str:room_name>/", views.get_messages, name="get_messages"),
    path("create-group/", views.create_group, name="create_group"),
    path("message/<int:message_id>/edit/", views.edit_message, name="edit_message"),
    path("message/<int:message_id>/delete/", views.delete_message, name="delete_message"),
    
    # Group Management
    path("group/<uuid:room_id>/leave/", views.leave_group, name="leave_group"),
    path("group/<uuid:room_id>/kick/<int:user_id>/", views.kick_member, name="kick_member"),
    path("group/<uuid:room_id>/transfer/<int:user_id>/", views.transfer_admin, name="transfer_admin"),
    path("group/<uuid:room_id>/delete/", views.delete_group, name="delete_group"),
    path("group/<uuid:room_id>/add/<int:user_id>/", views.add_member, name="add_member"),
    
    # User status
    path("update-status/", views.update_status, name="update_status"),

    # Generic room path must be last
    path("<str:room_name>/", views.room, name="room"),
]
