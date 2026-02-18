import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, requestOtp } = useAuth();
  const { branches, setBranchFromProfile } = useBranch();

  const [form, setForm] = useState({
    full_name: "",
    mobile_number: "",
    username: "",
    email: "",
    field_of_study: branches[0],
    password: "",
    otp_code: "",
  });
  const [otpInfo, setOtpInfo] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const sendOtp = async () => {
    if (!form.mobile_number.trim()) {
      toast.error("Enter mobile number first.");
      return;
    }
    try {
      setSendingOtp(true);
      await requestOtp(form.mobile_number);
      setOtpInfo(`OTP sent to ${form.mobile_number}.`);
      toast.success("OTP sent.");
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to send OTP.";
      toast.error(message);
    } finally {
      setSendingOtp(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      await register(form);
      setBranchFromProfile(form.field_of_study);
      toast.success("Enrollment complete.");
      navigate("/", { replace: true });
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
    <div className="auth-page register-theme">
      <div className="auth-panel">
        <div className="auth-hero">
          <h1>Enroll in Bridge4ER</h1>
          <p>Create your student account to unlock syllabus, library, and exam hall.</p>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <h2>Student Registration</h2>

          <label htmlFor="full_name">Full Name</label>
          <input
            id="full_name"
            value={form.full_name}
            onChange={(e) => setField("full_name", e.target.value)}
            placeholder="Your full name"
          />

          <label htmlFor="mobile_number">Mobile Number</label>
          <div className="otp-row">
            <input
              id="mobile_number"
              value={form.mobile_number}
              onChange={(e) => setField("mobile_number", e.target.value)}
              placeholder="Mobile number"
            />
            <button type="button" className="btn btn-secondary" onClick={sendOtp} disabled={sendingOtp}>
              {sendingOtp ? "Sending..." : "Send OTP"}
            </button>
          </div>
          {otpInfo ? <div className="otp-info">{otpInfo}</div> : null}

          <label htmlFor="otp_code">OTP Code</label>
          <input
            id="otp_code"
            value={form.otp_code}
            onChange={(e) => setField("otp_code", e.target.value)}
            placeholder="Enter OTP"
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
