from django.db import models
from accounts.models import CustomUser
import uuid


class ChatRoom(models.Model):
    room_id = models.CharField(
        max_length=255, unique=True, editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    users = models.ManyToManyField(CustomUser, related_name="chat_rooms")

    is_delete = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):  # generate the unique room_id while creating the room
        if not self.room_id:
            self.room_id = str(uuid.uuid4())
        super().save(*args, **kwargs)


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
