import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { cachedGet } from "../services/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notRobot, setNotRobot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [heroImageUrl, setHeroImageUrl] = useState("");

  const redirectPath = location.state?.from?.pathname || "/";

  useEffect(() => {
    if (location.state?.notice) {
      toast.success(String(location.state.notice));
    }
  }, [location.state]);

  useEffect(() => {
    let mounted = true;
    cachedGet("storage/homepage/stats/", {
      persistCache: true,
    })
      .then((res) => {
        if (!mounted) return;
        const url = res?.data?.login_hero_image_url || res?.data?.motivational_image_url || "";
        setHeroImageUrl(url);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      toast.error("Enter username, mobile, or email and password.");
      return;
    }
    if (!notRobot) {
      toast.error("Please confirm you are not a robot.");
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
    <div className="auth-page auth-clean-hero">
      <div className="auth-panel auth-panel-login">
        <div
          className="auth-hero"
          aria-hidden="true"
          style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
        />
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
          <div className="auth-password-field">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <label htmlFor="robot_verified" className="robot-check">
            <input
              id="robot_verified"
              type="checkbox"
              checked={notRobot}
              onChange={(e) => setNotRobot(e.target.checked)}
            />
            <span>I am not a robot</span>
          </label>

          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={submitting || !notRobot}>
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
