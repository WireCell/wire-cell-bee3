from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('', include('events.urls')),
    path('particles/', include('particles.urls')),
    
    path('admin/', admin.site.urls),
]
