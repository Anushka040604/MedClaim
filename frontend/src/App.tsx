import React from "react";
import { Navigate, Route, Routes, useLocation, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import ClaimantDashboard from "./pages/ClaimantDashboard";
import ApproverDashboard from "./pages/ApproverDashboard";
import ClaimDetailPage from "./pages/ClaimDetailPage";
import { Button } from "./components/Ui";

function Shell({ children }: { children: React.ReactNode }) {
  const { state, logout } = useAuth();
  const loc = useLocation();
  const onAuthPage = loc.pathname.startsWith("/login");

  return (
    <div className="app-shell">
      <header className="app-nav">
        <div className="h-0.5 w-full bg-gradient-to-r from-primary-500 via-accent-500 to-primary-400 opacity-80" />
        <div className="app-nav-inner">
          <Link to="/" className="app-brand">
            <span className="app-brand-mark">MCV</span>
            <span className="hidden sm:inline">Medical Claim Verification</span>
          </Link>

          {!onAuthPage && state.me ? (
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-neutral-900">{state.me.full_name}</p>
                <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  state.me.role === "admin" ? "bg-accent-100 text-accent-700" :
                  state.me.role === "approver" ? "bg-primary-100 text-primary-700" :
                  "bg-primary-50 text-primary-600"
                }`}>
                  {state.me.role}
                </span>
              </div>
              <Button variant="ghost" onClick={logout} size="sm">
                Sign out
              </Button>
            </div>
          ) : (
            <span className="rounded-full border border-primary-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-primary-700 shadow-sm">
              Secure portal
            </span>
          )}
        </div>
      </header>

      <main className="app-container py-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  if (state.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm font-medium text-neutral-500">Loading…</div>
      </div>
    );
  }
  if (!state.me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Home() {
  const { state } = useAuth();
  if (state.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm font-medium text-neutral-500">Loading…</div>
      </div>
    );
  }
  if (!state.me) return <Navigate to="/login" replace />;
  if (state.me.role === "approver") return <Navigate to="/approver" replace />;
  return <Navigate to="/claimant" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/claimant"
            element={
              <RequireAuth>
                <ClaimantDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/approver"
            element={
              <RequireAuth>
                <ApproverDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/claims/:claimId"
            element={
              <RequireAuth>
                <ClaimDetailPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </AuthProvider>
  );
}
