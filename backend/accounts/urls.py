from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, ProfileView, RegisterView, ReferralInviteView, ReferralUnlockView

urlpatterns = [
    path("auth/register/", RegisterView.as_view()),
    path("auth/login/", LoginView.as_view()),
    path("auth/token/refresh/", TokenRefreshView.as_view()),
    path("auth/me/", ProfileView.as_view()),
    path("referrals/", ReferralInviteView.as_view()),
    path("referrals/unlock/", ReferralUnlockView.as_view()),
]
