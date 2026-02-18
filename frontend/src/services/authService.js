import API from "./api";

export const requestOtp = async (mobileNumber, purpose = "register") => {
  const res = await API.post("accounts/auth/request-otp/", {
    mobile_number: mobileNumber,
    purpose,
  });
  return res.data;
};

export const registerStudent = async (payload) => {
  const res = await API.post("accounts/auth/register/", payload);
  return res.data;
};

export const loginStudent = async (identifier, password) => {
  const res = await API.post("accounts/auth/login/", {
    identifier,
    password,
  });
  return res.data;
};

export const getMyProfile = async () => {
  const res = await API.get("accounts/auth/me/");
  return res.data;
};

export const updateMyProfile = async (payload) => {
  const res = await API.patch("accounts/auth/me/", payload);
  return res.data;
};
