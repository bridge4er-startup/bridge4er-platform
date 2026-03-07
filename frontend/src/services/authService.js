import API, { warmupBackendConnection } from "./api";

const parsePositiveInt = (value, fallback, minValue = 5000) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(minValue, parsed);
};

const AUTH_REQUEST_TIMEOUT_MS = parsePositiveInt(process.env.REACT_APP_AUTH_REQUEST_TIMEOUT_MS, 120000, 10000);

const ensureBackendReady = async () => {
  try {
    await warmupBackendConnection();
  } catch (_error) {
    // Continue with the request even if warmup fails.
  }
};

const postAuth = async (path, payload) => {
  await ensureBackendReady();
  const res = await API.post(path, payload, { timeout: AUTH_REQUEST_TIMEOUT_MS });
  return res.data;
};

export const registerStudent = async (payload) => {
  return postAuth("accounts/auth/register/", payload);
};

export const verifyStudentEmail = async (token) => {
  const res = await API.get("accounts/auth/email/verify/", {
    params: { token },
  });
  return res.data;
};

export const resendStudentVerification = async (identifier) => {
  return postAuth("accounts/auth/email/resend-verification/", {
    identifier,
  });
};

export const loginStudent = async (identifier, password) => {
  return postAuth("accounts/auth/login/", {
    identifier,
    password,
  });
};

export const getMyProfile = async () => {
  const res = await API.get("accounts/auth/me/");
  return res.data;
};

export const updateMyProfile = async (payload) => {
  const res = await API.patch("accounts/auth/me/", payload);
  return res.data;
};
