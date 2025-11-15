from django.db import models

from accounts.models import CustomUser


class FriendRequest(models.Model):
    from_user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="sent_requests"
    )

    to_user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="received_requests"
    )

    is_accepted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["from_user", "to_user"], name="unique_friend_requests")
        ]

    def __str__(self):
        status = "Accepted" if self.is_accepted else "Pending"
        return f"{self.from_user} -> {self.to_user}: {status}"
