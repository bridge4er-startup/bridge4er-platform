import API from "./api";

export const getQRCodePaymentConfig = async () => {
  const res = await API.get("payments/config/");
  return res.data;
};

export const saveQRCodePaymentConfig = async (payload) => {
  const res = await API.patch("payments/config/", payload);
  return res.data;
};

export const submitManualPaymentRequest = async (payload) => {
  const res = await API.post("payments/requests/", payload);
  return res.data;
};

export const getMyPaymentRequests = async (statusFilter = "all") => {
  const params = statusFilter && statusFilter !== "all" ? { status: statusFilter } : {};
  const res = await API.get("payments/requests/my/", { params });
  return res.data;
};

export const listManualPaymentRequestsForAdmin = async (statusFilter = "pending_approval") => {
  const params = statusFilter && statusFilter !== "all" ? { status: statusFilter } : { status: "all" };
  const res = await API.get("payments/requests/admin/", { params });
  return res.data;
};

export const reviewManualPaymentRequest = async (referenceId, payload) => {
  const res = await API.post(`payments/requests/${referenceId}/review/`, payload);
  return res.data;
};

export const getPaymentStatus = async (referenceId) => {
  const res = await API.get("payments/status/", {
    params: { reference_id: referenceId },
  });
  return res.data;
};
