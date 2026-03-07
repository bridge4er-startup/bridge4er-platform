import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { resendStudentVerification } from "../services/authService";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  const redirectPath = location.state?.from?.pathname || "/";

  useEffect(() => {
    if (location.state?.notice) {
      toast.success(String(location.state.notice));
    }
  }, [location.state]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      toast.error("Enter username, mobile, or email and password.");
      return;
    }

    try {
      setSubmitting(true);
      await login({ identifier: identifier.trim(), password });
      toast.success("Welcome back.");
      navigate(redirectPath, { replace: true });
    } catch (error) {
      const message = error?.response?.data?.non_field_errors?.[0]
        || error?.response?.data?.error
        || "Login failed.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const resendVerification = async () => {
    const value = String(identifier || "").trim();
    if (!value) {
      toast.error("Enter your username, mobile, or email first.");
      return;
    }
    try {
      setResendingVerification(true);
      const response = await resendStudentVerification(value);
      toast.success(response?.message || "Verification email sent.");
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to resend verification email.";
      toast.error(message);
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div className="auth-page auth-clean-hero">
      <div className="auth-panel">
        <div className="auth-hero" aria-hidden="true" />
        <form className="auth-form" onSubmit={onSubmit}>
          <h2>Student Login</h2>
          <label htmlFor="identifier">Username, Mobile Number, or Email</label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Enter username, mobile, or email"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
          />

          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={submitting}>
            {submitting ? "Signing in..." : "Login"}
          </button>

          <p className="auth-alt-link">
            No account yet? <Link to="/register">Register now</Link>
          </p>
          <p className="auth-alt-link">
            Email not verified?{" "}
            <button
              type="button"
              className="auth-inline-btn"
              onClick={resendVerification}
              disabled={resendingVerification}
            >
              {resendingVerification ? "Sending..." : "Resend verification link"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
