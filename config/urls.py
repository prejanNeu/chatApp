from django.conf.urls.static import static
from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from django.views.static import serve as static_serve

from chat import views as chat_views

urlpatterns = [
    path("", chat_views.landing_view, name="landing"),
    path("chat/", include("chat.urls")),
    path("accounts/", include("accounts.urls")),
    path("friends/", include("friends.urls")),

    path("admin/", admin.site.urls),
]


# Serve static and media files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL,
                          document_root=settings.STATIC_ROOT)

# TODO: Need a dedicated static file server
urlpatterns += [
    path("media/<path:path>", static_serve,
         {"document_root": settings.MEDIA_ROOT}),
]
