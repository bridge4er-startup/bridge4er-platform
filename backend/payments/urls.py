from django.urls import path

from .views import (
    EsewaCallbackView,
    EsewaInitiatePayment,
    EsewaVerify,
    KhaltiCallbackView,
    KhaltiInitiatePayment,
    KhaltiVerify,
    PaymentStatusView,
    VerifyPayment,
)

urlpatterns = [
    path("verify/", VerifyPayment.as_view()),
    path("status/", PaymentStatusView.as_view()),
    path("esewa/initiate/", EsewaInitiatePayment.as_view()),
    path("esewa/callback/", EsewaCallbackView.as_view()),
    path("khalti/initiate/", KhaltiInitiatePayment.as_view()),
    path("khalti/callback/", KhaltiCallbackView.as_view()),
    # Deprecated endpoints kept for backwards compatibility.
    path("esewa/verify/", EsewaVerify.as_view()),
    path("khalti/verify/", KhaltiVerify.as_view()),
]
