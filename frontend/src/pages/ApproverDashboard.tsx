import React from "react";
import { Link } from "react-router-dom";
import { approverQueue, listClaims } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRelativeTime } from "../lib/utils";
import { Button, Card, Pill, EmptyState, StatCard, SkeletonStatRow, SkeletonList } from "../components/Ui";
import { getStatusTone, isProcessing } from "../lib/status";

export default function ApproverDashboard() {
  const { state } = useAuth();
  const [claims, setClaims] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  async function refresh() {
    setError(null);
    try {
      const data = state.me?.role === "approver" ? await approverQueue() : await listClaims();
      setClaims(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Failed to load queue.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
  }, [state.me?.role]);

  const queueCount = claims.length;
  const pending = claims.filter((c) => c.status !== "Decision").length;

  return (
    <>
      <div className="mb-6">
        <h1 className="page-title">Review queue</h1>
        <p className="page-subtitle text-neutral-600">Review claims, AI reports, and take approve / reject / request-info decisions.</p>
      </div>

      <div className="mb-6">
        {loading ? (
          <SkeletonStatRow count={2} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              label="In queue"
              value={queueCount}
              sub={queueCount === 0 ? "No claims waiting" : "Latest first"}
              icon={<span className="text-primary-500">📋</span>}
            />
            <StatCard
              label="Pending decision"
              value={pending}
              sub="Awaiting your action"
              icon={<span className="text-amber-500">⏳</span>}
            />
          </div>
        )}
      </div>

      <Card hover>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Claims</h2>
            <p className="mt-0.5 text-sm text-neutral-600">Sorted by latest activity.</p>
          </div>
          <Button variant="secondary" onClick={refresh} size="sm">
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-6">
          {loading ? (
            <SkeletonList count={4} />
          ) : claims.length === 0 ? (
            <EmptyState
              title="No claims in queue"
              description="New claims will appear here when submitted by claimants."
            />
          ) : (
            <ul className="divide-y divide-primary-50">
              {claims.map((c) => (
                <li key={c.claim_id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between rounded-xl hover:bg-primary-50/40 transition-colors -mx-1 px-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{c.patient_name}</p>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      <span className="font-mono text-primary-700">{c.claim_id}</span>
                      <span className="mx-1.5">·</span>
                      {c.hospital}
                      <span className="mx-1.5">·</span>
                      ₹{Number(c.claimed_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      <span className="mx-1.5">·</span>
                      <span title={new Date(c.updated_at).toLocaleString()}>{formatRelativeTime(c.updated_at)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Pill tone={getStatusTone(c.status)} pulse={isProcessing(c.status)}>{c.status}</Pill>
                    <Link
                      to={`/claims/${c.claim_id}`}
                      className="inline-flex h-9 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 px-4 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:saturate-110 transition-all"
                    >
                      Review
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}
