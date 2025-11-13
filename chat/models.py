from django.db import models
from accounts.models import CustomUser
import uuid


class ChatRoom(models.Model):
    room_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    users = models.ManyToManyField(CustomUser, related_name="chat_rooms")

    is_delete = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Message(models.Model):
    user = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True)
    room = models.ForeignKey(
        ChatRoom, on_delete=models.CASCADE, related_name='messages')
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    is_file = models.BooleanField(default=False)
    is_delete = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.user.username}: {self.content[:20]}"


class MessageReadStatus(models.Model):
    user = models.ForeignKey(to=CustomUser, on_delete=models.CASCADE)
    message = models.ForeignKey(to=Message, on_delete=models.CASCADE)
    is_read = models.BooleanField(default=False)

    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("user", "message")


class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('MESSAGE', 'Message'),
        ('FRIEND_REQUEST', 'Friend Request'),
        ('SYSTEM', 'System'),
    ]

    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    message = models.TextField(blank=True)
    link = models.URLField(blank=True)  # e.g., redirect to chat room
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
