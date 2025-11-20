from django.contrib import admin
from django.urls import include, path
from chat.views import landing_page

urlpatterns = [
    path("", landing_page, name="home"),
    path("chat/", include("chat.urls")),
    path("accounts/", include("accounts.urls")),
    path("friends/", include("friends.urls")),
    
    path("admin/", admin.site.urls),
]

from django.conf import settings
from django.conf.urls.static import static

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
