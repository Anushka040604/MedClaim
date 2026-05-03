import React from "react";
import { Navigate, Route, Routes, useLocation, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import ClaimantDashboard from "./pages/ClaimantDashboard";
import ApproverDashboard from "./pages/ApproverDashboard";
import ClaimDetailPage from "./pages/ClaimDetailPage";
import { Button, Skeleton, SkeletonStatRow, SkeletonList, ToastProvider } from "./components/Ui";

function Shell({ children }: { children: React.ReactNode }) {
  const { state, logout } = useAuth();
  const loc = useLocation();
  const onAuthPage = loc.pathname.startsWith("/login");
  const isAuthed = Boolean(state.me) && !onAuthPage;
  const role = state.me?.role;
  const onClaimant = loc.pathname.startsWith("/claimant");
  const onApprover = loc.pathname.startsWith("/approver");

  return (
    <div className="app-shell">
      <header className="app-nav">
        <div className="h-0.5 w-full bg-gradient-to-r from-primary-500 via-primary-300 to-accent-500 opacity-80" />
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

      {isAuthed ? (
        <div className="app-layout">
          <aside className="app-sidebar">
            <div className="app-sidebar-card">
              <p className="sidebar-title">Menu</p>
              <nav className="mt-3 space-y-1">
                {(role === "claimant" || role === "admin") && (
                  <Link
                    to="/claimant"
                    className={`sidebar-link ${onClaimant ? "sidebar-link-active" : ""}`}
                  >
                    <span className="sidebar-link-icon" aria-hidden>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v6H3V3zm0 12h18v9H3v-9zm4-5v3m4-3v3m4-3v3" />
                      </svg>
                    </span>
                    Claims dashboard
                  </Link>
                )}
                {(role === "approver" || role === "admin") && (
                  <Link
                    to="/approver"
                    className={`sidebar-link ${onApprover ? "sidebar-link-active" : ""}`}
                  >
                    <span className="sidebar-link-icon" aria-hidden>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m2 10H7a2 2 0 01-2-2V6a2 2 0 012-2h6l5 5v11a2 2 0 01-2 2z" />
                      </svg>
                    </span>
                    Review queue
                  </Link>
                )}
              </nav>

              <div className="mt-4 rounded-2xl border border-neutral-200/70 bg-white/70 px-3 py-3 text-xs text-neutral-600">
                <p className="font-semibold text-neutral-800">Tip</p>
                <p className="mt-1">Use “Live” on a claim to see status and AI results update.</p>
              </div>
            </div>
          </aside>

          <main className="min-w-0">
            {children}
          </main>
        </div>
      ) : (
        <main className="app-container py-8 sm:py-10">
          {children}
        </main>
      )}
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  if (state.loading) {
    return (
      <div className="app-container py-8 sm:py-10 space-y-6">
        <div className="space-y-2">
          <Skeleton width="240px" height="32px" />
          <Skeleton width="360px" height="14px" />
        </div>
        <SkeletonStatRow count={3} />
        <SkeletonList count={5} />
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
      <div className="app-container py-8 sm:py-10 space-y-6">
        <div className="space-y-2">
          <Skeleton width="240px" height="32px" />
          <Skeleton width="360px" height="14px" />
        </div>
        <SkeletonStatRow count={3} />
        <SkeletonList count={5} />
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
      <ToastProvider>
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
      </ToastProvider>
    </AuthProvider>
  );
}
