import React from "react";
import { Link } from "react-router-dom";
import { approverQueue, listClaims } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Pill, SkeletonList, RetryError, Select } from "../components/Ui";
import { getStatusTone, isProcessing } from "../lib/status";

const SLA_HOURS = 24;

const RISK_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All risk" },
  { value: "high", label: "High (>60)" },
  { value: "medium", label: "Medium (31-60)" },
  { value: "low", label: "Low (≤30)" },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All status" },
  { value: "Submitted", label: "Submitted" },
  { value: "Processing", label: "Processing" },
  { value: "Under Review", label: "Under Review" },
  { value: "More Info Requested", label: "Needs info" },
  { value: "Decision", label: "Decided" },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "priority", label: "Priority (high risk + oldest)" },
  { value: "oldest", label: "Oldest first" },
  { value: "newest", label: "Newest first" },
  { value: "amount", label: "Highest amount" },
];

function fmtWaiting(updated_at: string | null | undefined): string {
  if (!updated_at) return "—";
  const h = Math.max(0, (Date.now() - new Date(updated_at).getTime()) / 3600000);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function ageHours(updated_at: string | null | undefined): number {
  if (!updated_at) return 0;
  return Math.max(0, (Date.now() - new Date(updated_at).getTime()) / 3600000);
}

export default function ApproverDashboard() {
  const { state } = useAuth();
  const [claims, setClaims] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [retrying, setRetrying] = React.useState(false);
  const [riskFilter, setRiskFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [slaOnly, setSlaOnly] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<string>("priority");

  async function refresh(silent = false) {
    if (!silent) setError(null);
    try {
      const data = state.me?.role === "approver" ? await approverQueue() : await listClaims();
      setClaims(data);
    } catch (err: any) {
      const msg = err?.response?.data?.detail
        ?? (err?.message?.toLowerCase().includes("network") ? "Cannot reach the backend. Try again." : "Failed to load the queue.");
      if (!silent) setError(msg);
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    await refresh();
  }

  React.useEffect(() => {
    refresh();
    // Auto-refresh every 30s silently
    const t = setInterval(() => refresh(true), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.me?.role]);

  // Stats
  const pending = claims.filter((c) => c.status !== "Decision");
  const needsDecision = pending.length;
  const highRisk = claims.filter((c) => Number(c.risk_score ?? 0) > 60 && c.status !== "Decision").length;
  const slaBreach = pending.filter((c) => ageHours(c.updated_at) > SLA_HOURS).length;
  const oldestPending = pending.length === 0
    ? null
    : Math.max(...pending.map((c) => ageHours(c.updated_at)));

  // Filter
  let filtered = claims;
  if (riskFilter !== "all") {
    filtered = filtered.filter((c) => {
      const r = Number(c.risk_score ?? 0);
      if (riskFilter === "high") return r > 60;
      if (riskFilter === "medium") return r > 30 && r <= 60;
      if (riskFilter === "low") return r <= 30 && c.risk_score != null;
      return true;
    });
  }
  if (statusFilter !== "all") {
    filtered = filtered.filter((c) => c.status === statusFilter);
  }
  if (slaOnly) {
    filtered = filtered.filter((c) => c.status !== "Decision" && ageHours(c.updated_at) > SLA_HOURS);
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "newest") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    if (sortBy === "oldest") return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    if (sortBy === "amount") return Number(b.claimed_amount) - Number(a.claimed_amount);
    // priority: high risk first, then oldest
    const ra = Number(a.risk_score ?? 0);
    const rb = Number(b.risk_score ?? 0);
    if (rb !== ra) return rb - ra;
    return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
  });

  const headerSummary = `${needsDecision} pending${slaBreach > 0 ? ` · ${slaBreach} need attention` : " · all healthy"}`;

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Review queue</h1>
          <p className="mt-0.5 text-sm text-neutral-600">{loading ? "Loading…" : headerSummary}</p>
        </div>
      </div>

      {/* Alert-driven stats */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className={`rounded-2xl border px-4 py-3 ${slaBreach > 0 ? "border-red-300 bg-red-50" : "border-neutral-200 bg-white"}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${slaBreach > 0 ? "text-red-700" : "text-neutral-500"}`}>SLA breach</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${slaBreach > 0 ? "text-red-900" : "text-neutral-900"}`}>{loading ? "—" : slaBreach}</p>
          <p className={`mt-0.5 text-[11px] ${slaBreach > 0 ? "text-red-700/80" : "text-neutral-500"}`}>
            {slaBreach > 0 ? `>${SLA_HOURS}h waiting` : "All within SLA"}
          </p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${highRisk > 0 ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white"}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${highRisk > 0 ? "text-amber-700" : "text-neutral-500"}`}>High risk</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${highRisk > 0 ? "text-amber-900" : "text-neutral-900"}`}>{loading ? "—" : highRisk}</p>
          <p className={`mt-0.5 text-[11px] ${highRisk > 0 ? "text-amber-700/80" : "text-neutral-500"}`}>Risk score &gt; 60</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Needs decision</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{loading ? "—" : needsDecision}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Oldest pending</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${oldestPending != null && oldestPending > SLA_HOURS ? "text-red-700" : "text-neutral-900"}`}>
            {loading ? "—" : oldestPending == null ? "—" : oldestPending < 1 ? `${Math.round(oldestPending * 60)}m` : oldestPending < 24 ? `${Math.round(oldestPending)}h` : `${Math.round(oldestPending / 24)}d`}
          </p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="!h-8 !w-auto !text-xs">
          {RISK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="!h-8 !w-auto !text-xs">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="!h-8 !w-auto !text-xs">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs cursor-pointer hover:bg-neutral-50">
          <input type="checkbox" checked={slaOnly} onChange={(e) => setSlaOnly(e.target.checked)} />
          <span>SLA breach only</span>
        </label>
        <span className="ml-auto text-xs text-neutral-500">{loading ? "" : `${sorted.length} shown`}</span>
      </div>

      <Card hover className="!p-3 sm:!p-4">
        {loading ? (
          <SkeletonList count={5} />
        ) : error ? (
          <RetryError message={error} onRetry={handleRetry} retrying={retrying} />
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-neutral-800">
              {slaOnly || riskFilter !== "all" || statusFilter !== "all" ? "No claims match filters" : "All claims healthy"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {slaOnly || riskFilter !== "all" || statusFilter !== "all" ? "Try clearing filters." : "Nothing in queue right now."}
            </p>
          </div>
        ) : (
          <>
            {/* Column headers — table-like */}
            <div className="hidden sm:grid grid-cols-[1fr_90px_70px_80px_120px_36px] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-200">
              <span>Claim · Hospital</span>
              <span className="text-right">Amount</span>
              <span className="text-center">Risk</span>
              <span className="text-right">Waiting</span>
              <span>Status</span>
              <span></span>
            </div>
            <ul className="divide-y divide-neutral-100">
              {sorted.map((c) => {
                const age = ageHours(c.updated_at);
                const isStuck = c.status !== "Decision" && age > SLA_HOURS;
                const risk = Number(c.risk_score ?? 0);
                const hasRisk = c.risk_score != null;
                const riskColor =
                  !hasRisk ? "bg-neutral-100 text-neutral-500 border-neutral-200" :
                  risk > 60 ? "bg-red-100 text-red-800 border-red-300" :
                  risk > 30 ? "bg-amber-100 text-amber-800 border-amber-300" :
                  "bg-emerald-100 text-emerald-800 border-emerald-300";
                const riskLabel = !hasRisk ? "—" : risk > 60 ? "High" : risk > 30 ? "Med" : "Low";
                return (
                  <li key={c.claim_id}>
                    <Link
                      to={`/claims/${c.claim_id}`}
                      className={`grid grid-cols-1 sm:grid-cols-[1fr_90px_70px_80px_120px_36px] gap-2 px-3 py-2 items-center transition-colors hover:bg-primary-50/40 ${isStuck ? "bg-red-50/50" : ""}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs font-semibold text-neutral-900">{c.claim_id}</span>
                          <span className="text-neutral-300">·</span>
                          <span className="truncate text-xs text-neutral-700">{c.hospital}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-neutral-500">{c.patient_name}</p>
                      </div>
                      <span className="hidden sm:block text-right text-xs font-semibold text-neutral-800 tabular-nums">
                        ₹{Number(c.claimed_amount).toLocaleString("en-IN")}
                      </span>
                      <span className={`hidden sm:inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold tabular-nums w-fit mx-auto ${riskColor}`} title={hasRisk ? `Risk score ${risk}/100` : "No risk score yet"}>
                        {hasRisk ? `${risk} ${riskLabel}` : "—"}
                      </span>
                      <span className={`hidden sm:block text-right text-xs tabular-nums ${isStuck ? "font-bold text-red-700" : "text-neutral-600"}`}>
                        {fmtWaiting(c.updated_at)}
                      </span>
                      <span className="hidden sm:block">
                        <Pill tone={getStatusTone(c.status)} pulse={isProcessing(c.status)}>{c.status}</Pill>
                      </span>
                      <span className="hidden sm:flex items-center justify-end text-neutral-400">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                      {/* mobile fallback row */}
                      <div className="sm:hidden flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${riskColor}`}>
                          {hasRisk ? `${risk} ${riskLabel}` : "—"}
                        </span>
                        <span className="font-semibold text-neutral-800">₹{Number(c.claimed_amount).toLocaleString("en-IN")}</span>
                        <span className={isStuck ? "font-bold text-red-700" : "text-neutral-600"}>{fmtWaiting(c.updated_at)}</span>
                        <Pill tone={getStatusTone(c.status)} pulse={isProcessing(c.status)}>{c.status}</Pill>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
