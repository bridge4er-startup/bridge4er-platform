import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const redirectPath = location.state?.from?.pathname || "/";

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      toast.error("Enter username/mobile and password.");
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

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-hero">
          <h1>Bridge4ER</h1>
          <p>Engineering resources, library access, and exam hall in one place.</p>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <h2>Student Login</h2>
          <label htmlFor="identifier">Username or Mobile Number</label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Enter username or mobile"
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
        </form>
      </div>
    </div>
  );
}
