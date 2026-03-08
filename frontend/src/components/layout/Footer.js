import React, { useState } from "react";
import { useBranch } from "../../context/BranchContext";
import ReportProblemModal from "../common/ReportProblemModal";

export default function Footer() {
  const { branch } = useBranch();
  const [showReportModal, setShowReportModal] = useState(false);

  return (
    <footer>
      <div className="container">
        <div className="copyright footer-static-copy">
          <p>&copy; Nepal Engineering Academy, Jorpati, Kathmandu</p>
          <p>Education for free. All rights reserved.</p>
          <p>Contact us: 98400*****, 985400**** , Email: bridge4er@gmail.com for any queries</p>
          <p style={{ marginTop: "0.65rem" }}>
            <button
              type="button"
              className="btn btn-secondary footer-report-btn"
              onClick={() => setShowReportModal(true)}
            >
              Report a problem
            </button>
          </p>
        </div>
      </div>
      <ReportProblemModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        branch={branch}
      />
    </footer>
  );
}
