import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/layout/Header";
import Navigation from "../components/layout/Navigation";
import HomepageSection from "../components/sections/HomepageSection";
import SyllabusSection from "../components/sections/SyllabusSection";
import OldQuestionsSection from "../components/sections/OldQuestionSection";
import MCQSection from "../components/sections/MCQSectionPaginated";
import SubjectiveSection from "../components/sections/SubjectiveSection";
import TakeExamSection from "../components/sections/TakeExamSection";
import Footer from "../components/layout/Footer";
import { useBranch } from "../context/BranchContext";
import { useAuth } from "../context/AuthContext";

function AccessRequired({ title }) {
  return (
    <section className="section active">
      <h2 className="section-title">
        <i className="fas fa-lock"></i> {title}
      </h2>
      <p>Login or register to access this section.</p>
      <div style={{ display: "flex", gap: "12px", marginTop: "1rem" }}>
        <Link className="btn btn-primary" to="/login">Login</Link>
        <Link className="btn btn-secondary" to="/register">Register</Link>
      </div>
    </section>
  );
}

export default function Home() {
  const { branch } = useBranch();
  const { isAuthenticated } = useAuth();
  const branchTheme = useMemo(() => branch.toLowerCase().replace(/\s+/g, "-"), [branch]);
  const validSections = useMemo(
    () => ["homepage", "syllabus", "old-questions", "objective-mcqs", "library", "exam-hall"],
    []
  );
  const [activeSection, setActiveSection] = useState("homepage");
  const authRequiredSections = new Set(["syllabus", "old-questions", "objective-mcqs", "library", "exam-hall"]);

  useEffect(() => {
    const updateFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      setActiveSection(validSections.includes(hash) ? hash : "homepage");
    };
    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);
    return () => window.removeEventListener("hashchange", updateFromHash);
  }, [validSections]);

  useEffect(() => {
    document.body.setAttribute("data-branch-theme", branchTheme);
    return () => {
      document.body.removeAttribute("data-branch-theme");
    };
  }, [branchTheme]);

  return (
    <>
      <Header />
      <Navigation activeSection={activeSection} />
      <main className="container">
        <HomepageSection branch={branch} isActive={activeSection === "homepage"} />

        {activeSection === "syllabus" && authRequiredSections.has("syllabus") && !isAuthenticated ? (
          <AccessRequired title="Syllabus" />
        ) : (
          <SyllabusSection branch={branch} isActive={activeSection === "syllabus"} />
        )}

        {activeSection === "old-questions" && authRequiredSections.has("old-questions") && !isAuthenticated ? (
          <AccessRequired title="Old Questions" />
        ) : (
          <OldQuestionsSection branch={branch} isActive={activeSection === "old-questions"} />
        )}

        {activeSection === "objective-mcqs" && authRequiredSections.has("objective-mcqs") && !isAuthenticated ? (
          <AccessRequired title="Objective MCQs" />
        ) : (
          <MCQSection branch={branch} isActive={activeSection === "objective-mcqs"} />
        )}

        {activeSection === "library" && authRequiredSections.has("library") && !isAuthenticated ? (
          <AccessRequired title="Library" />
        ) : (
          <SubjectiveSection branch={branch} isActive={activeSection === "library"} />
        )}

        {activeSection === "exam-hall" && authRequiredSections.has("exam-hall") && !isAuthenticated ? (
          <AccessRequired title="Exam Hall" />
        ) : (
          <TakeExamSection branch={branch} isActive={activeSection === "exam-hall"} />
        )}
      </main>
      <Footer />
    </>
  );
}
