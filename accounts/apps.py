from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'

    def ready(self):
        try:
            from .models import CustomUser
            # Reset is_online for all users on server startup
            CustomUser.objects.update(is_online=False)
        except Exception:
            # This might fail during migrations if table doesn't exist yet
            pass
