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
    display_name = models.CharField(max_length=255)

    is_delete = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.display_name


class Message(models.Model):
    user = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='messages')
    room = models.ForeignKey(
        ChatRoom, on_delete=models.CASCADE, related_name='messages')
    content = models.TextField(blank=True, null=True)
    file = models.FileField(upload_to='chat_uploads/', null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    is_file = models.BooleanField(default=False)
    is_delete = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.user.username}: {self.content[:20]}"

    @property
    def is_image(self):
        if not self.is_file or not self.content:
            return False
        ext = self.content.lower().split('.')[-1]
        return ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']


class MessageReadStatus(models.Model):
    user = models.ForeignKey(to=CustomUser, on_delete=models.CASCADE, related_name='read_receipts')
    message = models.ForeignKey(to=Message, on_delete=models.CASCADE, related_name='read_receipts')
    is_read = models.BooleanField(default=False)

    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "message"], name="unique_message_read_status")
        ]


class PrivateChat(models.Model):
    # smaller id
    user_a = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="private_chats_a")
    # bigger id
    user_b = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="private_chats_b")

    room = models.OneToOneField(
        ChatRoom, on_delete=models.CASCADE, related_name="private_chat")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user_a", "user_b"], name="uniqe_private_chatters")
        ]

    def __str__(self):
        return f"PrivateChat: {self.user_a.id} <-> {self.user_b.id}"
