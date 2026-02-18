import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import MCQExamPage from "./pages/MCQExamPage";
import SubjectiveExamPage from "./pages/SubjectiveExamPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfileAnalyticsPage from "./pages/ProfileAnalyticsPage";
import AdminDashboard from "./pages/AdminDashboard";
import PaymentResultPage from "./pages/PaymentResultPage";
import { Toaster } from "react-hot-toast";
import { useAuth } from "./context/AuthContext";

function ProtectedRoute({ children, adminOnly = false }) {
  const { loading, isAuthenticated, isAdmin } = useAuth();
  if (loading) {
    return <div style={{ padding: "2rem" }}>Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  return (
    <div className="App">
      <Toaster position="top-right" />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/payment/result" element={<PaymentResultPage />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfileAnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute adminOnly>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/exam/mcq/:branch/:setName"
          element={
            <ProtectedRoute>
              <MCQExamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/exam/subjective/:branch/:setName"
          element={
            <ProtectedRoute>
              <SubjectiveExamPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
