from django.urls import path

from .views import (
    EsewaCallbackView,
    EsewaInitiatePayment,
    EsewaVerify,
    KhaltiCallbackView,
    KhaltiInitiatePayment,
    KhaltiVerify,
    ManualPaymentRequestAdminListView,
    ManualPaymentRequestAdminReviewView,
    ManualPaymentRequestCreateView,
    ManualPaymentRequestListView,
    PaymentStatusView,
    QRCodePaymentConfigView,
    VerifyPayment,
)

urlpatterns = [
    path("config/", QRCodePaymentConfigView.as_view()),
    path("requests/", ManualPaymentRequestCreateView.as_view()),
    path("requests/my/", ManualPaymentRequestListView.as_view()),
    path("requests/admin/", ManualPaymentRequestAdminListView.as_view()),
    path("requests/<uuid:reference_id>/review/", ManualPaymentRequestAdminReviewView.as_view()),
    path("verify/", VerifyPayment.as_view()),
    path("status/", PaymentStatusView.as_view()),
    # Legacy endpoints kept as HTTP 410 for backward compatibility.
    path("esewa/initiate/", EsewaInitiatePayment.as_view()),
    path("esewa/callback/", EsewaCallbackView.as_view()),
    path("khalti/initiate/", KhaltiInitiatePayment.as_view()),
    path("khalti/callback/", KhaltiCallbackView.as_view()),
    path("esewa/verify/", EsewaVerify.as_view()),
    path("khalti/verify/", KhaltiVerify.as_view()),
]
