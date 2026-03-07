import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyStudentEmail } from "../services/authService";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const token = String(searchParams.get("token") || "").trim();
    if (!token) {
      setStatus("failed");
      setMessage("Verification token is missing.");
      return;
    }

    verifyStudentEmail(token)
      .then((response) => {
        setStatus("verified");
        setMessage(response?.message || "Email verified successfully.");
      })
      .catch((error) => {
        setStatus("failed");
        setMessage(error?.response?.data?.error || "Email verification failed.");
      });
  }, [searchParams]);

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-hero">
          <h1>Bridge4ER</h1>
          <p>Email Verification</p>
        </div>
        <div className="auth-form">
          <h2>{status === "verified" ? "Verification Complete" : "Verification Status"}</h2>
          <p>{message}</p>
          <p className="auth-alt-link">
            <Link to="/login">Go to Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
