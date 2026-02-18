import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  getMyProfile,
  loginStudent,
  registerStudent,
  requestOtp as requestOtpApi,
} from "../services/authService";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, clearTokens, storeTokens } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const access = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!access) {
        setLoading(false);
        return;
      }
      try {
        const profile = await getMyProfile();
        setUser(profile);
      } catch (_error) {
        clearTokens();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  const requestOtp = async (mobileNumber) => {
    return requestOtpApi(mobileNumber, "register");
  };

  const login = async ({ identifier, password }) => {
    const payload = await loginStudent(identifier, password);
    storeTokens(payload.tokens || {});
    setUser(payload.user || null);
    return payload;
  };

  const register = async (payload) => {
    const response = await registerStudent(payload);
    storeTokens(response.tokens || {});
    setUser(response.user || null);
    return response;
  };

  const refreshProfile = async () => {
    const profile = await getMyProfile();
    setUser(profile);
    return profile;
  };

  const logout = () => {
    clearTokens();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      isAdmin: !!user?.is_staff,
      requestOtp,
      login,
      register,
      refreshProfile,
      logout,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
