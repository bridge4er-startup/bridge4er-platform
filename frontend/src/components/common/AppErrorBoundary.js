import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Unexpected application error.",
    };
  }

  componentDidCatch(error) {
    // Keep diagnostics in console while preventing blank-screen crashes.
    console.error("AppErrorBoundary caught:", error);
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 720, margin: "4rem auto", padding: "1.5rem", textAlign: "center" }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#475569" }}>
            The app recovered from a data/runtime issue. Please reload and continue.
          </p>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>{this.state.errorMessage}</p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1rem" }}>
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              Reload
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleGoHome}>
              Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
