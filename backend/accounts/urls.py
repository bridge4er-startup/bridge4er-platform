from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, ProfileView, RegisterView, ResendEmailVerificationView, VerifyEmailView

urlpatterns = [
    path("auth/register/", RegisterView.as_view()),
    path("auth/login/", LoginView.as_view()),
    path("auth/email/verify/", VerifyEmailView.as_view()),
    path("auth/email/resend-verification/", ResendEmailVerificationView.as_view()),
    path("auth/token/refresh/", TokenRefreshView.as_view()),
    path("auth/me/", ProfileView.as_view()),
]
