import React, { useEffect } from "react";
import { useBranch } from "../../context/BranchContext";

const SECTION_SHORTCUTS = {
  "1": "homepage",
  "2": "syllabus",
  "3": "old-questions",
  "4": "objective-mcqs",
  "5": "library",
  "6": "exam-hall",
};

const FIELD_BY_KEY = {
  c: "Civil Engineering",
  m: "Mechanical Engineering",
  e: "Electrical Engineering",
  l: "Electronics Engineering",
  p: "Computer Engineering",
};

export default function Footer() {
  const { setBranch } = useBranch();

  const jumpToSection = (sectionId) => {
    if (!sectionId) return;
    window.location.hash = sectionId;
    const sectionElement = document.getElementById(sectionId);
    if (sectionElement) {
      sectionElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSectionClick = (event, sectionId) => {
    event.preventDefault();
    jumpToSection(sectionId);
  };

  const handleFieldClick = (event, fieldName) => {
    event.preventDefault();
    setBranch(fieldName);
    jumpToSection("homepage");
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const targetTag = target?.tagName?.toLowerCase() || "";
      const isTypingElement = ["input", "textarea", "select"].includes(targetTag) || target?.isContentEditable;
      if (isTypingElement) return;

      if (event.altKey && !event.shiftKey) {
        const nextSection = SECTION_SHORTCUTS[event.key];
        if (!nextSection) return;
        event.preventDefault();
        jumpToSection(nextSection);
        return;
      }

      if (event.altKey && event.shiftKey) {
        const nextField = FIELD_BY_KEY[event.key.toLowerCase()];
        if (!nextField) return;
        event.preventDefault();
        setBranch(nextField);
        jumpToSection("homepage");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setBranch]);

  return (
    <footer>
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>Quick Links</h3>
            <ul>
              <li><a href="#homepage" className="footer-nav" data-section="homepage" onClick={(e) => handleSectionClick(e, "homepage")}>Homepage</a></li>
              <li><a href="#syllabus" className="footer-nav" data-section="syllabus" onClick={(e) => handleSectionClick(e, "syllabus")}>Syllabus</a></li>
              <li><a href="#old-questions" className="footer-nav" data-section="old-questions" onClick={(e) => handleSectionClick(e, "old-questions")}>Old Questions</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h3>Study Materials</h3>
            <ul>
              <li><a href="#objective-mcqs" className="footer-nav" data-section="objective-mcqs" onClick={(e) => handleSectionClick(e, "objective-mcqs")}>Objective MCQs</a></li>
              <li><a href="#library" className="footer-nav" data-section="library" onClick={(e) => handleSectionClick(e, "library")}>Library</a></li>
              <li><a href="#exam-hall" className="footer-nav" data-section="exam-hall" onClick={(e) => handleSectionClick(e, "exam-hall")}>Exam Hall</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h3>Engineering Fields</h3>
            <ul>
              <li><a href="#homepage" className="field-change" data-field="civil" onClick={(e) => handleFieldClick(e, "Civil Engineering")}>Civil Engineering</a></li>
              <li><a href="#homepage" className="field-change" data-field="mechanical" onClick={(e) => handleFieldClick(e, "Mechanical Engineering")}>Mechanical Engineering</a></li>
              <li><a href="#homepage" className="field-change" data-field="electrical" onClick={(e) => handleFieldClick(e, "Electrical Engineering")}>Electrical Engineering</a></li>
              <li><a href="#homepage" className="field-change" data-field="electronics" onClick={(e) => handleFieldClick(e, "Electronics Engineering")}>Electronics Engineering</a></li>
              <li><a href="#homepage" className="field-change" data-field="computer" onClick={(e) => handleFieldClick(e, "Computer Engineering")}>Computer Engineering</a></li>
            </ul>
          </div>
        </div>
        <div className="copyright">
          <p>&copy; Education for free. All rights reserved.</p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
            Contact us: 98400*****, 985400**** , Jorpati, Kathmandu , bridge4er@gmail.com
          </p>
        </div>
      </div>
    </footer>
  );
}
