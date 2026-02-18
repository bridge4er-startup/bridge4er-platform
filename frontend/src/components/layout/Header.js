import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBranch } from "../../context/BranchContext";
import { useAuth } from "../../context/AuthContext";

export default function Header() {
  const navigate = useNavigate();
  const { branch, setBranch, branches, setBranchFromProfile } = useBranch();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user?.field_of_study) {
      setBranchFromProfile(user.field_of_study);
    }
  }, [isAuthenticated, user, setBranchFromProfile]);

  const fieldIcon = {
    "Civil Engineering": "fas fa-building",
    "Mechanical Engineering": "fas fa-cogs",
    "Electrical Engineering": "fas fa-bolt",
    "Electronics Engineering": "fas fa-microchip",
    "Computer Engineering": "fas fa-laptop-code",
  };

  const profileSubtext = user?.username || "Guest";

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="main-header">
      <div className="container header-container">
        <div className="logo">
          <i className="fas fa-university"></i>
          <div>
            <h1>Bridge4ER Platform</h1>
            <span>Engineering study resources, library, and exam hall</span>
          </div>
        </div>

        <div className="field-selector-container">
          <span className="field-label">Field:</span>
          <div className="field-dropdown">
            <button
              className="field-dropdown-btn"
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
              type="button"
            >
              <span>
                <i className={fieldIcon[branch] || "fas fa-building"}></i> {branch}
              </span>
              <i className="fas fa-chevron-down"></i>
            </button>
            <div className={`field-dropdown-content ${open ? "show" : ""}`}>
              {branches.map((field) => (
                <button
                  key={field}
                  type="button"
                  className="field-option"
                  onClick={() => {
                    setBranch(field);
                    setOpen(false);
                  }}
                >
                  <i className={fieldIcon[field] || "fas fa-building"}></i> {field}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="header-actions">
          {!isAuthenticated ? (
            <>
              <Link className="btn btn-secondary" to="/login">Login</Link>
              <Link className="btn btn-primary" to="/register">Register</Link>
              <button className="btn header-profile-btn header-profile-btn-disabled" disabled title="Profile works after login">
                <i className="fas fa-user-circle"></i>
                <span className="header-profile-btn-text">
                  <span>Profile</span>
                  <small>{profileSubtext}</small>
                </span>
              </button>
            </>
          ) : (
            <>
              <Link className="btn header-profile-btn" to="/profile">
                <i className="fas fa-user-circle"></i>
                <span className="header-profile-btn-text">
                  <span>Profile</span>
                  <small>{profileSubtext}</small>
                </span>
              </Link>
              {isAdmin ? <Link className="btn btn-secondary" to="/admin/dashboard">Admin</Link> : null}
              <button className="btn btn-primary" onClick={handleLogout}>Logout</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
