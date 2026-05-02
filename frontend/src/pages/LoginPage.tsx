import React from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Input, Label } from "../components/Ui";

export default function LoginPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
      await refresh();
      nav("/", { replace: true });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail) {
        setError(detail);
      } else if (err?.message && String(err.message).toLowerCase().includes("network")) {
        setError("Cannot reach backend API. Please wait for the backend to start (port 8000) and try again.");
      } else if (!err?.response) {
        setError("Login failed: backend not reachable. Please start the backend and try again.");
      } else {
        setError("Invalid email or password.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid min-h-[calc(100vh-8rem)] items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left: Branding */}
        <div className="hidden lg:block">
          <div className="max-w-md rounded-3xl bg-gradient-hero p-8 ring-1 ring-primary-100/60 shadow-card-hover">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-300/60 bg-white/80 px-3 py-1.5 text-xs font-semibold text-primary-800 shadow-sm">
              AI-powered verification
            </div>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
              Verify medical claims with <span className="text-primary-700">confidence.</span>
            </h1>
            <p className="mt-4 text-lg text-neutral-700">
              Submit claims, upload documents, and get policy compliance and risk insights—all in one secure portal.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Automated document extraction & policy check",
                "Real-time status and AI report",
                "Secure, role-based access",
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-neutral-700">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 ring-2 ring-primary-200/50">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: Sign in */}
        <div className="flex justify-center lg:justify-end">
          <Card className="w-full max-w-sm border-primary-200/80 shadow-card-primary">
            <div className="flex items-center gap-3 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-sm">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-neutral-900">Sign in</h2>
                <p className="text-sm text-neutral-500">Use your portal credentials to continue.</p>
              </div>
            </div>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div>
                <Label>Email</Label>
                <Input
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
                  type="email"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  {error}
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 border-t border-primary-100 pt-4 text-center text-xs text-neutral-500">
              Demo: claimant@gmail.com · approver@gmail.com · admin@gmail.com — password 123
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
