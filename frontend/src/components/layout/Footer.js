import React, { useState } from "react";
import { useBranch } from "../../context/BranchContext";
import ReportProblemModal from "../common/ReportProblemModal";

const FOOTER_PRIMARY_LINKS = [
  { label: "Noticeboard", href: "#noticeboard" },
  { label: "Syllabus", href: "#syllabus" },
  { label: "Old Questions", href: "#old-questions" },
];

const FOOTER_SECONDARY_LINKS = [
  { label: "Objective MCQs", href: "#objective-mcqs" },
  { label: "Library", href: "#library" },
  { label: "Exam Hall", href: "#exam-hall" },
];

const ENGINEERING_FIELDS = [
  "Civil Engineering",
  "Mechanical Engineering",
  "Electrical Engineering",
  "Electronics Engineering",
  "Computer Engineering",
];

export default function Footer() {
  const { branch, setBranch } = useBranch();
  const [showReportModal, setShowReportModal] = useState(false);

  return (
    <footer>
      <div className="container">
        <div className="footer-content footer-links-layout">
          <section className="footer-section footer-link-column">
            <h3>Quick Links</h3>
            <ul>
              {FOOTER_PRIMARY_LINKS.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </section>

          <section className="footer-section footer-link-column">
            <h3>Exam Prep</h3>
            <ul>
              {FOOTER_SECONDARY_LINKS.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </section>

          <section className="footer-section footer-link-column">
            <h3>Engineering Fields</h3>
            <ul>
              {ENGINEERING_FIELDS.map((field) => (
                <li key={field}>
                  <a
                    href="#homepage"
                    className={field === branch ? "footer-field-active" : ""}
                    onClick={() => setBranch(field)}
                  >
                    {field}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>

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
