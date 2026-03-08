import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { branches, setBranchFromProfile } = useBranch();

  const [form, setForm] = useState({
    full_name: "",
    mobile_number: "",
    username: "",
    email: "",
    field_of_study: branches[0],
    password: "",
    confirm_password: "",
    robot_verified: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const cleanMobile = String(form.mobile_number || "").replace(/\D/g, "");
    const fullNameParts = String(form.full_name || "")
      .trim()
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (cleanMobile.length !== 10) {
      toast.error("Mobile number must be exactly 10 digits.");
      return;
    }
    if (fullNameParts.length < 2) {
      toast.error("Enter at least two names separated by a space.");
      return;
    }
    if (String(form.password || "").length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirm_password) {
      toast.error("Password and re-entered password do not match.");
      return;
    }
    if (!form.robot_verified) {
      toast.error('Please tick "I am not a robot" before enrolling.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        full_name: form.full_name,
        mobile_number: cleanMobile,
        username: form.username,
        email: form.email,
        field_of_study: form.field_of_study,
        password: form.password,
      };
      const response = await register(payload);
      setBranchFromProfile(form.field_of_study);
      toast.success(response?.message || "Enrollment complete.");

      if (response?.tokens?.access || response?.tokens?.refresh) {
        navigate("/", { replace: true });
        return;
      }

      navigate("/login", {
        replace: true,
        state: { notice: "Enrollment complete. Please login." },
      });
    } catch (error) {
      const apiErrors = error?.response?.data || {};
      const firstError =
        apiErrors.error
        || apiErrors.non_field_errors?.[0]
        || Object.values(apiErrors)[0]?.[0]
        || "Registration failed.";
      toast.error(firstError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page register-theme auth-clean-hero">
      <div className="auth-panel">
        <div className="auth-hero" aria-hidden="true" />
        <form className="auth-form" onSubmit={onSubmit}>
          <h2>Student Registration</h2>

          <label htmlFor="full_name">Full Name</label>
          <input
            id="full_name"
            value={form.full_name}
            onChange={(e) => setField("full_name", e.target.value)}
            placeholder="First Name Last Name"
          />

          <label htmlFor="mobile_number">Mobile Number</label>
          <input
            id="mobile_number"
            value={form.mobile_number}
            onChange={(e) => setField("mobile_number", e.target.value)}
            placeholder="Mobile number"
            maxLength={10}
          />

          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={form.username}
            onChange={(e) => setField("username", e.target.value)}
            placeholder="Unique username"
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="Email address"
          />

          <label htmlFor="field_of_study">Field of Study</label>
          <select
            id="field_of_study"
            value={form.field_of_study}
            onChange={(e) => setField("field_of_study", e.target.value)}
          >
            {branches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            placeholder="Create password"
          />

          <label htmlFor="confirm_password">Re-enter Password</label>
          <input
            id="confirm_password"
            type="password"
            value={form.confirm_password}
            onChange={(e) => setField("confirm_password", e.target.value)}
            placeholder="Re-enter password"
          />

          <label htmlFor="robot_verified" className="robot-check">
            <input
              id="robot_verified"
              type="checkbox"
              checked={form.robot_verified}
              onChange={(e) => setField("robot_verified", e.target.checked)}
            />
            <span>I am not a robot</span>
          </label>

          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={submitting}>
            {submitting ? "Enrolling..." : "Enroll"}
          </button>

          <p className="auth-alt-link">
            Already enrolled? <Link to="/login">Login here</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
