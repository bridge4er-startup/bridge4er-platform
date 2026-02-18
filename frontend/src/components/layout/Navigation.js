import React from "react";

export default function Navigation({ activeSection }) {
  const linkClass = (section) => `nav-link ${activeSection === section ? "active" : ""}`;

  return (
    <nav className="main-nav">
      <div className="container nav-container">
        <ul className="nav-links">
          <li><a href="#homepage" className={linkClass("homepage")} data-section="homepage"><i className="fas fa-house"></i> Homepage</a></li>
          <li><a href="#syllabus" className={linkClass("syllabus")} data-section="syllabus"><i className="fas fa-book"></i> Syllabus</a></li>
          <li><a href="#old-questions" className={linkClass("old-questions")} data-section="old-questions"><i className="fas fa-file-alt"></i> Old Questions</a></li>
          <li><a href="#objective-mcqs" className={linkClass("objective-mcqs")} data-section="objective-mcqs"><i className="fas fa-question-circle"></i> Objective MCQs</a></li>
          <li><a href="#library" className={linkClass("library")} data-section="library"><i className="fas fa-book-open"></i> Library</a></li>
          <li><a href="#exam-hall" className={linkClass("exam-hall")} data-section="exam-hall"><i className="fas fa-clock"></i> Exam Hall</a></li>
        </ul>
      </div>
    </nav>
  );
}
