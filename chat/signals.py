from django.db.models.signals import post_delete
from django.dispatch import receiver
from .models import PrivateChat

@receiver(post_delete, sender=PrivateChat)
def delete_chat_room(sender, instance, **kwargs):
    if instance.room:
        instance.room.delete()
