import React from "react";
import { Link } from "react-router-dom";
import { createClaim, deleteClaim, listClaims } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRelativeTime } from "../lib/utils";
import { Button, Card, Input, Label, Textarea, Pill, FileInput, Select, SkeletonList, ConfirmDialog, useToast, RetryError, Modal } from "../components/Ui";
import { getStatusTone, isProcessing } from "../lib/status";

const DOC_TYPES = ["Hospital Bill", "Discharge Summary", "Lab Report", "Prescription", "Consent Form", "Other"];
const POLICY_RE = /^[A-Za-z0-9-]{4,}$/;

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All claims" },
  { value: "Submitted", label: "Submitted" },
  { value: "Processing", label: "Processing" },
  { value: "Under Review", label: "Under Review" },
  { value: "More Info Requested", label: "Needs your info" },
  { value: "Decision", label: "Decided" },
];

export default function ClaimantDashboard() {
  const { state } = useAuth();
  const toast = useToast();
  const [claims, setClaims] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [retrying, setRetrying] = React.useState(false);

  // Form state (lives in modal)
  const [createOpen, setCreateOpen] = React.useState(false);
  const [patientName, setPatientName] = React.useState(state.me?.full_name ?? "");
  const [policyNumber, setPolicyNumber] = React.useState("");
  const [hospital, setHospital] = React.useState("");
  const [doctor, setDoctor] = React.useState("");
  const [diagnosis, setDiagnosis] = React.useState("");
  const [treatmentDate, setTreatmentDate] = React.useState("");
  const [claimedAmount, setClaimedAmount] = React.useState<string>("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [docTypes, setDocTypes] = React.useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [topError, setTopError] = React.useState<string | null>(null);

  // List interactions
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Pre-fill patient name when user loads
  React.useEffect(() => {
    if (!patientName && state.me?.full_name) setPatientName(state.me.full_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.me?.full_name]);

  async function refresh(silent = false) {
    if (!silent) setLoadError(null);
    try {
      const data = await listClaims();
      setClaims(data);
      if (!silent) setLoadError(null);
    } catch (err: any) {
      const msg = err?.response?.data?.detail
        ?? (err?.message?.toLowerCase().includes("network") ? "Cannot reach the backend. Try again." : "Failed to load your claims.");
      if (!silent) setLoadError(msg);
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
    // Auto-refresh every 30s, silently (no flicker)
    const t = setInterval(() => refresh(true), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Form helpers
  function isFormValid() {
    return (
      patientName.trim().length > 0 &&
      POLICY_RE.test(policyNumber.trim()) &&
      hospital.trim().length > 0 &&
      diagnosis.trim().length >= 3 &&
      treatmentDate.trim().length > 0 &&
      Number(claimedAmount) > 0
    );
  }

  function inlineValidate() {
    const errors: Record<string, string> = {};
    if (!patientName.trim()) errors.patientName = "Required.";
    if (!policyNumber.trim()) errors.policyNumber = "Required.";
    else if (!POLICY_RE.test(policyNumber.trim())) errors.policyNumber = "Letters, digits, dashes only (e.g., POL-12345).";
    if (!hospital.trim()) errors.hospital = "Required.";
    if (!diagnosis.trim()) errors.diagnosis = "Required.";
    else if (diagnosis.trim().length < 3) errors.diagnosis = "Add a few more words.";
    if (!treatmentDate.trim()) errors.treatmentDate = "Required.";
    if (!(Number(claimedAmount) > 0)) errors.claimedAmount = "Must be greater than 0.";
    return errors;
  }

  function resetForm() {
    setPatientName(state.me?.full_name ?? "");
    setPolicyNumber("");
    setHospital("");
    setDoctor("");
    setDiagnosis("");
    setTreatmentDate("");
    setClaimedAmount("");
    setFiles([]);
    setDocTypes([]);
    setFieldErrors({});
    setTopError(null);
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  async function onCreateSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (busy) return;
    const errors = inlineValidate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setTopError("Fix the highlighted fields below.");
      return;
    }
    setBusy(true);
    setTopError(null);
    try {
      await createClaim({
        patient_name: patientName,
        policy_number: policyNumber,
        hospital,
        doctor,
        diagnosis,
        treatment_date: treatmentDate,
        claimed_amount: Number(claimedAmount),
        files,
        document_types: docTypes,
      });
      setCreateOpen(false);
      await refresh();
      toast.show("Claim created.", "success");
      resetForm();
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Failed to create claim.";
      setTopError(msg);
      toast.show(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    const claimId = confirmDeleteId;
    setDeletingId(claimId);
    try {
      await deleteClaim(claimId);
      await refresh();
      toast.show("Claim deleted.", "success");
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : "Failed to delete claim.";
      toast.show(msg ?? "Failed to delete claim.", "error");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  if (state.me?.role === "approver") {
    return (
      <Card className="border-amber-200 bg-amber-50/40">
        <h2 className="text-lg font-bold text-neutral-900">Wrong portal</h2>
        <p className="mt-2 text-sm text-neutral-600">
          This area is for claimants.{" "}
          <Link className="font-semibold text-primary-600 hover:text-primary-700" to="/approver">
            Go to Approver queue
          </Link>
        </p>
      </Card>
    );
  }

  // Stats
  const totalClaims = claims.length;
  const inReview = claims.filter((c) => isProcessing(c.status) || c.status === "Under Review" || c.status === "More Info Requested").length;
  const decided = claims.filter((c) => c.status === "Decision").length;

  // Admin-only stats
  const isAdmin = state.me?.role === "admin";
  const SLA_HOURS = 24;
  const now = Date.now();
  const ageHours = (c: any) => Math.max(0, (now - new Date(c.updated_at).getTime()) / 3600000);
  const stuckClaims = claims.filter((c) => c.status !== "Decision" && ageHours(c) > SLA_HOURS).length;
  const highRiskClaims = claims.filter((c) => Number(c.risk_score ?? 0) > 60).length;
  // Avg time-to-decision: only consider Decision claims, use updated_at - created_at (proxy)
  const decidedWithTime = claims.filter((c) => c.status === "Decision" && c.created_at && c.updated_at);
  const avgDecisionHours = decidedWithTime.length === 0 ? null :
    decidedWithTime.reduce((sum, c) => sum + Math.max(0, (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 3600000), 0) / decidedWithTime.length;
  const fmtHours = (h: number | null) => {
    if (h === null) return "—";
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  };

  // Filter + sort
  const [adminSort, setAdminSort] = [["oldest"], () => {}] as any; // placeholder; real state below
  void adminSort;
  const filtered = claims.filter((c) => statusFilter === "all" || c.status === statusFilter);
  // Default sort: newest first; admin uses oldest first (SLA priority)
  const sortedClaims = [...filtered].sort((a, b) => {
    if (isAdmin) return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  return (
    <>
      {/* Page title + role-based CTA */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            {isAdmin ? "All claims" : "Claims"}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-600">
            {isAdmin
              ? "Monitor system, track SLAs, spot high-risk claims."
              : "Submit, track, and review your medical claims."}
          </p>
        </div>
        {isAdmin ? (
          <Link
            to="/approver"
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 px-4 text-sm font-semibold text-white shadow-md hover:shadow-lg"
          >
            Open queue
          </Link>
        ) : (
          <Button onClick={openCreate}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New claim
          </Button>
        )}
      </div>

      {/* Stats: alert-driven for admin, In-Review-primary for claimant */}
      {isAdmin ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div className={`rounded-2xl border px-4 py-3 ${stuckClaims > 0 ? "border-red-300 bg-red-50" : "border-neutral-200 bg-white"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${stuckClaims > 0 ? "text-red-700" : "text-neutral-500"}`}>Stuck &gt; {SLA_HOURS}h</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${stuckClaims > 0 ? "text-red-900" : "text-neutral-900"}`}>{loading ? "—" : stuckClaims}</p>
            <p className={`mt-0.5 text-[11px] ${stuckClaims > 0 ? "text-red-700/80" : "text-neutral-500"}`}>
              {stuckClaims > 0 ? "SLA breach — action needed" : "All within SLA"}
            </p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 ${highRiskClaims > 0 ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${highRiskClaims > 0 ? "text-amber-700" : "text-neutral-500"}`}>High risk</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${highRiskClaims > 0 ? "text-amber-900" : "text-neutral-900"}`}>{loading ? "—" : highRiskClaims}</p>
            <p className={`mt-0.5 text-[11px] ${highRiskClaims > 0 ? "text-amber-700/80" : "text-neutral-500"}`}>
              Risk score &gt; 60
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">In review</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{loading ? "—" : inReview}</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Avg decision time</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{loading ? "—" : fmtHours(avgDecisionHours)}</p>
            <p className="mt-0.5 text-[11px] text-neutral-500">{decidedWithTime.length} decided</p>
          </div>
        </div>
      ) : (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Total</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{loading ? "—" : totalClaims}</p>
          </div>
          <div className="rounded-2xl border border-primary-200 bg-primary-50/60 px-5 py-4 sm:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-700">In review</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-primary-900">{loading ? "—" : inReview}</p>
            <p className="mt-0.5 text-xs text-primary-700/70">
              {inReview === 0 ? "No claims awaiting decision" : "AI processing or pending approver"}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Decided</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{loading ? "—" : decided}</p>
          </div>
        </div>
      )}

      {/* List card */}
      <Card hover className="!p-4 sm:!p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-neutral-900">Claims</h2>
            <span className="text-xs text-neutral-500">{loading ? "" : `(${sortedClaims.length})`}</span>
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="!h-9 !w-auto !text-sm"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>

        {loading ? (
          <SkeletonList count={4} />
        ) : loadError ? (
          <RetryError message={loadError} onRetry={handleRetry} retrying={retrying} />
        ) : sortedClaims.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-neutral-800">
              {statusFilter === "all" ? "No claims yet" : "No claims match this filter"}
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              {statusFilter === "all" ? "Create your first claim to get started." : "Try a different filter or create a new claim."}
            </p>
            {statusFilter === "all" ? (
              <Button className="mt-4" onClick={openCreate}>New claim</Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {sortedClaims.map((c) => {
              const age = ageHours(c);
              const isStuck = isAdmin && c.status !== "Decision" && age > SLA_HOURS;
              const risk = Number(c.risk_score ?? 0);
              const riskTone =
                risk > 60 ? "text-red-700 bg-red-50 border-red-200" :
                risk > 30 ? "text-amber-700 bg-amber-50 border-amber-200" :
                risk > 0 ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
                "text-neutral-500 bg-neutral-50 border-neutral-200";
              return (
              <li
                key={c.claim_id}
                className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${isStuck ? "bg-red-50/40 -mx-3 px-3 rounded" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-mono text-sm font-semibold text-neutral-900">{c.claim_id}</span>
                    <span className="text-neutral-300">·</span>
                    <span className="truncate text-sm text-neutral-700">{c.patient_name}</span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-600">
                    <span className="font-semibold text-neutral-800">
                      ₹{Number(c.claimed_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-neutral-300">·</span>
                    <span className="truncate">{c.hospital}</span>
                    <span className="text-neutral-300">·</span>
                    <span
                      title={new Date(c.updated_at).toLocaleString()}
                      className={isStuck ? "font-semibold text-red-700" : ""}
                    >
                      {isStuck ? `${Math.round(age)}h waiting` : formatRelativeTime(c.updated_at)}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && c.risk_score != null ? (
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${riskTone}`} title={`Risk score ${risk}/100`}>
                      {risk}
                    </span>
                  ) : null}
                  <Pill tone={getStatusTone(c.status)} pulse={isProcessing(c.status)}>{c.status}</Pill>
                  <Link
                    to={`/claims/${c.claim_id}`}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-primary-200 bg-white px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50"
                  >
                    View
                  </Link>
                  {!isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(c.claim_id)}
                      disabled={deletingId === c.claim_id}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                      title="Delete claim"
                      aria-label="Delete claim"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </li>
            );
            })}
          </ul>
        )}
      </Card>

      {/* Create claim modal */}
      <Modal
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        title="Create claim"
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-neutral-500">
              {isFormValid() ? "Ready to submit" : "Fill required fields to enable Submit"}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => !busy && setCreateOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => onCreateSubmit()} disabled={busy || !isFormValid()}>
                {busy ? "Submitting…" : "Submit claim"}
              </Button>
            </div>
          </div>
        }
      >
        {topError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {topError}
          </div>
        ) : null}
        <form className="space-y-5" onSubmit={onCreateSubmit}>
          {/* Section 1: Basic info */}
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Basic info</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Patient name</Label>
                <Input
                  required
                  value={patientName}
                  onChange={(e) => { setPatientName(e.target.value); setFieldErrors((p) => ({ ...p, patientName: "" })); }}
                  placeholder="Full name"
                  aria-invalid={Boolean(fieldErrors.patientName)}
                  className={fieldErrors.patientName ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}
                />
                {fieldErrors.patientName ? <p className="mt-1 text-xs text-red-600">{fieldErrors.patientName}</p> : null}
              </div>
              <div>
                <Label>Policy number</Label>
                <Input
                  required
                  value={policyNumber}
                  onChange={(e) => {
                    setPolicyNumber(e.target.value);
                    setFieldErrors((p) => ({ ...p, policyNumber: "" }));
                  }}
                  onBlur={() => {
                    if (policyNumber && !POLICY_RE.test(policyNumber.trim())) {
                      setFieldErrors((p) => ({ ...p, policyNumber: "Letters, digits, dashes only (e.g., POL-12345)." }));
                    }
                  }}
                  placeholder="POL-12345"
                  aria-invalid={Boolean(fieldErrors.policyNumber)}
                  className={fieldErrors.policyNumber ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}
                />
                {fieldErrors.policyNumber ? <p className="mt-1 text-xs text-red-600">{fieldErrors.policyNumber}</p> : null}
              </div>
              <div>
                <Label>Hospital</Label>
                <Input
                  required
                  value={hospital}
                  onChange={(e) => { setHospital(e.target.value); setFieldErrors((p) => ({ ...p, hospital: "" })); }}
                  placeholder="Hospital name"
                  aria-invalid={Boolean(fieldErrors.hospital)}
                  className={fieldErrors.hospital ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}
                />
                {fieldErrors.hospital ? <p className="mt-1 text-xs text-red-600">{fieldErrors.hospital}</p> : null}
              </div>
            </div>
          </section>

          {/* Section 2: Medical info */}
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Medical info</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Doctor <span className="text-neutral-400 font-normal normal-case tracking-normal">(optional)</span></Label>
                <Input
                  value={doctor}
                  onChange={(e) => setDoctor(e.target.value)}
                  placeholder="Attending doctor"
                />
              </div>
              <div>
                <Label>Treatment date</Label>
                <Input
                  required
                  type="date"
                  value={treatmentDate}
                  onChange={(e) => { setTreatmentDate(e.target.value); setFieldErrors((p) => ({ ...p, treatmentDate: "" })); }}
                  className={`!h-11 ${fieldErrors.treatmentDate ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                  aria-invalid={Boolean(fieldErrors.treatmentDate)}
                />
                {fieldErrors.treatmentDate ? <p className="mt-1 text-xs text-red-600">{fieldErrors.treatmentDate}</p> : null}
              </div>
              <div className="sm:col-span-2">
                <Label>Diagnosis</Label>
                <Textarea
                  required
                  rows={3}
                  value={diagnosis}
                  onChange={(e) => { setDiagnosis(e.target.value); setFieldErrors((p) => ({ ...p, diagnosis: "" })); }}
                  placeholder="e.g., Acute appendicitis with appendectomy on 2024-03-15. Inpatient stay 3 days."
                  aria-invalid={Boolean(fieldErrors.diagnosis)}
                  className={fieldErrors.diagnosis ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}
                />
                {fieldErrors.diagnosis ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.diagnosis}</p>
                ) : (
                  <p className="mt-1 text-xs text-neutral-400">Examples: "Acute appendicitis", "Type 2 diabetes — A1C 8.2", "Fractured left tibia, ORIF surgery"</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label>Claimed amount (₹)</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-neutral-500">₹</span>
                  <Input
                    required
                    type="number"
                    inputMode="decimal"
                    value={claimedAmount}
                    onChange={(e) => { setClaimedAmount(e.target.value); setFieldErrors((p) => ({ ...p, claimedAmount: "" })); }}
                    min={0.01}
                    step="0.01"
                    placeholder="0.00"
                    aria-invalid={Boolean(fieldErrors.claimedAmount)}
                    className={`!pl-7 ${fieldErrors.claimedAmount ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                  />
                </div>
                {fieldErrors.claimedAmount ? <p className="mt-1 text-xs text-red-600">{fieldErrors.claimedAmount}</p> : null}
              </div>
            </div>
          </section>

          {/* Section 3: Documents (optional) */}
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Documents <span className="text-neutral-400 font-normal normal-case tracking-normal">(optional, can add later)</span></h4>
            <FileInput
              multiple
              accept=".pdf,image/*"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                setFiles(list);
                setDocTypes(list.map(() => "Hospital Bill"));
              }}
              hint="PDF, JPG, or PNG. Tag each file's type below."
            />
            {files.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-neutral-900">{f.name}</p>
                      <p className="text-[11px] text-neutral-500">{Math.round(f.size / 1024)} KB</p>
                    </div>
                    <Select
                      value={docTypes[i] ?? "Hospital Bill"}
                      onChange={(e) => {
                        const next = [...docTypes];
                        next[i] = e.target.value;
                        setDocTypes(next);
                      }}
                      className="!h-8 !w-auto !text-xs"
                    >
                      {DOC_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => {
                        setFiles(files.filter((_, idx) => idx !== i));
                        setDocTypes(docTypes.filter((_, idx) => idx !== i));
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove file"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete this claim?"
        description="This permanently removes the claim and any uploaded documents. This cannot be undone."
        confirmLabel="Delete claim"
        confirmVariant="danger"
        busy={deletingId !== null}
      />
    </>
  );
}
