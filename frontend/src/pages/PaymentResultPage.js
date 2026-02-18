import React from "react";
import { Link, useLocation } from "react-router-dom";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function PaymentResultPage() {
  const query = useQuery();
  const status = (query.get("status") || "").toLowerCase();
  const gateway = (query.get("gateway") || "").toLowerCase();
  const examSetId = query.get("exam_set_id") || "";
  const referenceId = query.get("reference_id") || "";
  const message = query.get("message") || "";

  const isSuccess = status === "success";
  const title = isSuccess ? "Payment Successful" : "Payment Failed";
  const description = isSuccess
    ? "Your exam set has been unlocked. You can now start the exam from Exam Hall."
    : message || "The payment could not be verified. Please try again.";

  return (
    <div className="auth-page register-theme">
      <div className="auth-panel">
        <div className="auth-hero">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <div className="auth-form">
          <h2>Payment Summary</h2>
          <p><strong>Status:</strong> {status || "unknown"}</p>
          <p><strong>Gateway:</strong> {gateway || "unknown"}</p>
          {examSetId ? <p><strong>Exam Set ID:</strong> {examSetId}</p> : null}
          {referenceId ? <p><strong>Reference:</strong> {referenceId}</p> : null}

          <Link className="btn btn-primary auth-submit-btn" to="/#exam-hall">
            Go To Exam Hall
          </Link>
        </div>
      </div>
    </div>
  );
}
