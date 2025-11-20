from django.contrib import admin
from django.urls import include, path

from chat import views as chat_views

urlpatterns = [
    path("", chat_views.landing_view, name="landing"),
    path("chat/", include("chat.urls")),
    path("accounts/", include("accounts.urls")),
    path("friends/", include("friends.urls")),
    
    path("admin/", admin.site.urls),
]

from django.conf import settings
from django.conf.urls.static import static

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
