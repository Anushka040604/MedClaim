import React from "react";
import { Navigate, Route, Routes, useLocation, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import ClaimantDashboard from "./pages/ClaimantDashboard";
import ApproverDashboard from "./pages/ApproverDashboard";
import ClaimDetailPage from "./pages/ClaimDetailPage";
import { Button, Skeleton, SkeletonStatRow, SkeletonList, ToastProvider } from "./components/Ui";

type Role = "claimant" | "approver" | "admin" | undefined;

function NavLinks({
  role,
  pathname,
  onNavigate,
}: {
  role: Role;
  pathname: string;
  onNavigate?: () => void;
}) {
  const onClaimant = pathname.startsWith("/claimant");
  const onApprover = pathname.startsWith("/approver");
  return (
    <nav className="space-y-1">
      {(role === "claimant" || role === "admin") && (
        <Link
          to="/claimant"
          onClick={onNavigate}
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
          onClick={onNavigate}
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
  );
}

function MobileDrawer({
  open,
  onClose,
  role,
  pathname,
  user,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
  pathname: string;
  user: { full_name: string; role: string } | null;
  onLogout: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div
        className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 h-14">
          <span className="font-semibold text-neutral-900">Menu</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {user ? (
          <div className="px-4 py-4 border-b border-neutral-100">
            <p className="text-sm font-medium text-neutral-900">{user.full_name}</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
              user.role === "admin" ? "bg-accent-100 text-accent-700" :
              user.role === "approver" ? "bg-primary-100 text-primary-700" :
              "bg-primary-50 text-primary-600"
            }`}>
              {user.role}
            </span>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-4">
          <p className="sidebar-title mb-3">Navigate</p>
          <NavLinks role={role} pathname={pathname} onNavigate={onClose} />
        </div>

        <div className="border-t border-neutral-100 p-4">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => { onClose(); onLogout(); }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { state, logout } = useAuth();
  const loc = useLocation();
  const onAuthPage = loc.pathname.startsWith("/login");
  const isAuthed = Boolean(state.me) && !onAuthPage;
  const role = state.me?.role as Role;
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    setDrawerOpen(false);
  }, [loc.pathname]);

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
            <div className="flex items-center gap-3">
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
              <Button variant="ghost" onClick={logout} size="sm" className="hidden lg:inline-flex">
                Sign out
              </Button>

              {isAuthed ? (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Open menu"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white/80 text-neutral-700 shadow-sm hover:bg-primary-50 lg:hidden"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              ) : null}
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
              <div className="mt-3">
                <NavLinks role={role} pathname={loc.pathname} />
              </div>

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

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={role}
        pathname={loc.pathname}
        user={state.me ?? null}
        onLogout={logout}
      />
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
