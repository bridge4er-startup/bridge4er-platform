import API from "./api";

export const initiateEsewaPayment = async (payload) => {
  const res = await API.post("payments/esewa/initiate/", payload);
  return res.data;
};

export const initiateKhaltiPayment = async (payload) => {
  const res = await API.post("payments/khalti/initiate/", payload);
  return res.data;
};

export const getPaymentStatus = async (referenceId) => {
  const res = await API.get("payments/status/", {
    params: { reference_id: referenceId },
  });
  return res.data;
};
