from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

def health(request):
    return JsonResponse({"status": "ok"})

urlpatterns = [
    path('', health),
    path('admin/', admin.site.urls),
    # Frontend auth service uses /api/accounts/auth/* endpoints.
    path('api/accounts/', include('accounts.urls')),
    # Keep legacy auth prefix for backward compatibility.
    path('api/auth/', include('accounts.urls')),
    path('api/exams/', include('exams.urls')),
    path('api/storage/', include('storage.urls')),
    path('api/payments/', include('payments.urls')),
]
