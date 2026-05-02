import React from "react";
import { Link } from "react-router-dom";
import { createClaim, deleteClaim, listClaims } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRelativeTime } from "../lib/utils";
import { Button, Card, Input, Label, Textarea, Pill, EmptyState, StatCard, SuccessToast } from "../components/Ui";

const DOC_TYPES = ["Prescription", "Hospital Bill", "Lab Report", "Discharge Summary", "Consent Form", "Other"];

export default function ClaimantDashboard() {
  const { state } = useAuth();
  const [claims, setClaims] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [patientName, setPatientName] = React.useState("");
  const [policyNumber, setPolicyNumber] = React.useState("");
  const [hospital, setHospital] = React.useState("");
  const [doctor, setDoctor] = React.useState("");
  const [diagnosis, setDiagnosis] = React.useState("");
  const [treatmentDate, setTreatmentDate] = React.useState("");
  const [claimedAmount, setClaimedAmount] = React.useState<number>(0);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<"date" | "amount" | "status">("date");
  const [files, setFiles] = React.useState<File[]>([]);
  const [docTypes, setDocTypes] = React.useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function validateRequiredFields() {
    const errors: Record<string, string> = {};
    if (!patientName.trim()) errors.patientName = "Patient name is required.";
    if (!policyNumber.trim()) errors.policyNumber = "Policy number is required.";
    if (!hospital.trim()) errors.hospital = "Hospital is required.";
    if (!doctor.trim()) errors.doctor = "Doctor is required.";
    if (!diagnosis.trim()) errors.diagnosis = "Diagnosis is required.";
    if (!treatmentDate.trim()) errors.treatmentDate = "Treatment date is required.";
    if (!(claimedAmount > 0)) errors.claimedAmount = "Claimed amount must be greater than 0.";
    return errors;
  }

  async function refresh() {
    const data = await listClaims();
    setClaims(data);
  }

  React.useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const validationErrors = validateRequiredFields();
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setError("Please fill all required fields before submitting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createClaim({
        patient_name: patientName,
        policy_number: policyNumber,
        hospital,
        doctor,
        diagnosis,
        treatment_date: treatmentDate,
        claimed_amount: claimedAmount,
        files,
        document_types: docTypes,
      });
      setPatientName("");
      setPolicyNumber("");
      setHospital("");
      setDoctor("");
      setDiagnosis("");
      setTreatmentDate("");
      setClaimedAmount(0);
      setFiles([]);
      setDocTypes([]);
      setFieldErrors({});
      await refresh();
      setSuccessMessage("Claim submitted successfully.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Failed to create claim.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(claimId: string) {
    if (!window.confirm("Delete this claim? This cannot be undone.")) return;
    setDeletingId(claimId);
    try {
      await deleteClaim(claimId);
      setError(null);
      await refresh();
      setSuccessMessage("Claim deleted.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : "Failed to delete claim.";
      setError(msg ?? "Failed to delete claim.");
    } finally {
      setDeletingId(null);
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

  const totalClaims = claims.length;
  const underReview = claims.filter((c) => c.status !== "Decision").length;
  const withDecision = claims.filter((c) => c.status === "Decision").length;

  const sortedClaims = [...claims].sort((a, b) => {
    if (sortBy === "date") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    if (sortBy === "amount") return Number(b.claimed_amount) - Number(a.claimed_amount);
    return String(a.status).localeCompare(String(b.status));
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="page-title">Claims</h1>
        <p className="page-subtitle text-neutral-600">Submit a new claim or open an existing one to upload documents and track status.</p>
      </div>

      {successMessage ? (
        <div className="mb-4">
          <SuccessToast show message={successMessage} />
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total claims"
          value={totalClaims}
          sub={totalClaims === 0 ? "Submit your first" : undefined}
          icon={<span className="text-primary-500">📋</span>}
        />
        <StatCard
          label="Under review"
          value={underReview}
          sub="In progress"
          icon={<span className="text-amber-500">⏳</span>}
        />
        <StatCard
          label="Decided"
          value={withDecision}
          sub="Approved or rejected"
          icon={<span className="text-emerald-500">✓</span>}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card hover className="border-l-4 border-l-primary-500">
            <p className="section-heading">New claim</p>
            <h2 className="mt-2 text-lg font-bold text-neutral-900">Submit claim details</h2>
            <p className="mt-1 text-sm text-neutral-500">You can submit claim details and documents together.</p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div>
                <Label>Patient name</Label>
                <Input
                  required
                  value={patientName}
                  onChange={(e) => {
                    setPatientName(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, patientName: "" }));
                  }}
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
                    setFieldErrors((prev) => ({ ...prev, policyNumber: "" }));
                  }}
                  placeholder="e.g. POL-12345"
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
                  onChange={(e) => {
                    setHospital(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, hospital: "" }));
                  }}
                  placeholder="Hospital name"
                  aria-invalid={Boolean(fieldErrors.hospital)}
                  className={fieldErrors.hospital ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}
                />
                {fieldErrors.hospital ? <p className="mt-1 text-xs text-red-600">{fieldErrors.hospital}</p> : null}
              </div>
              <div>
                <Label>Doctor</Label>
                <Input
                  required
                  value={doctor}
                  onChange={(e) => {
                    setDoctor(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, doctor: "" }));
                  }}
                  placeholder="Attending doctor"
                  aria-invalid={Boolean(fieldErrors.doctor)}
                  className={fieldErrors.doctor ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}
                />
                {fieldErrors.doctor ? <p className="mt-1 text-xs text-red-600">{fieldErrors.doctor}</p> : null}
              </div>
              <div>
                <Label>Diagnosis</Label>
                <Textarea
                  required
                  rows={3}
                  value={diagnosis}
                  onChange={(e) => {
                    setDiagnosis(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, diagnosis: "" }));
                  }}
                  placeholder="Brief diagnosis"
                  aria-invalid={Boolean(fieldErrors.diagnosis)}
                  className={fieldErrors.diagnosis ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}
                />
                {fieldErrors.diagnosis ? <p className="mt-1 text-xs text-red-600">{fieldErrors.diagnosis}</p> : null}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Treatment date</Label>
                  <Input
                    required
                    type="date"
                    value={treatmentDate}
                    onChange={(e) => {
                      setTreatmentDate(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, treatmentDate: "" }));
                    }}
                    aria-invalid={Boolean(fieldErrors.treatmentDate)}
                    className={fieldErrors.treatmentDate ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}
                  />
                  {fieldErrors.treatmentDate ? <p className="mt-1 text-xs text-red-600">{fieldErrors.treatmentDate}</p> : null}
                </div>
                <div>
                  <Label>Claimed amount (₹)</Label>
                  <Input
                    required
                    type="number"
                    value={claimedAmount || ""}
                    onChange={(e) => {
                      setClaimedAmount(Number(e.target.value));
                      setFieldErrors((prev) => ({ ...prev, claimedAmount: "" }));
                    }}
                    min={0.01}
                    step="0.01"
                    placeholder="0.00"
                    aria-invalid={Boolean(fieldErrors.claimedAmount)}
                    className={fieldErrors.claimedAmount ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""}
                  />
                  {fieldErrors.claimedAmount ? <p className="mt-1 text-xs text-red-600">{fieldErrors.claimedAmount}</p> : null}
                </div>
              </div>
              <div>
                <Label>Claim documents (optional)</Label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    setFiles(list);
                    setDocTypes(list.map(() => "Other"));
                  }}
                  className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-700"
                />
              </div>
              {files.length > 0 ? (
                <ul className="space-y-2">
                  {files.map((f, i) => (
                    <li key={i} className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900">{f.name}</p>
                        <p className="text-xs text-neutral-500">{Math.round(f.size / 1024)} KB</p>
                      </div>
                      <select
                        value={docTypes[i] ?? "Other"}
                        onChange={(e) => {
                          const next = [...docTypes];
                          next[i] = e.target.value;
                          setDocTypes(next);
                        }}
                        className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
                      >
                        {DOC_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              ) : null}
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  {error}
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Submitting…" : "Submit claim"}
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card hover>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Your claims</h2>
                <p className="mt-0.5 text-sm text-neutral-500">Click a claim to upload documents and track status.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "date" | "amount" | "status")}
                  className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="date">Newest first</option>
                  <option value="amount">Highest amount</option>
                  <option value="status">By status</option>
                </select>
                <Button variant="secondary" onClick={refresh} size="sm">
                  Refresh
                </Button>
              </div>
            </div>

            <div className="mt-6">
              {claims.length === 0 ? (
                <EmptyState
                  title="No claims yet"
                  description="Submit your first claim using the form on the left."
                />
              ) : (
                <ul className="divide-y divide-primary-50">
                  {sortedClaims.map((c) => (
                    <li key={c.claim_id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between rounded-xl hover:bg-primary-50/40 transition-colors -mx-1 px-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-900">{c.patient_name}</p>
                        <p className="mt-0.5 text-xs text-neutral-600">
                          <span className="font-mono text-primary-700">{c.claim_id}</span>
                          <span className="mx-1.5">·</span>
                          {c.hospital}
                          <span className="mx-1.5">·</span>
                          <span title={new Date(c.updated_at).toLocaleString()}>{formatRelativeTime(c.updated_at)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill tone={c.status === "Decision" ? "success" : "info"}>{c.status}</Pill>
                        <Link
                          to={`/claims/${c.claim_id}`}
                          className="inline-flex h-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 px-4 text-sm font-semibold text-white shadow-sm hover:from-primary-700 hover:to-primary-800 hover:shadow-md transition-all"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.claim_id)}
                          disabled={deletingId === c.claim_id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                          title="Delete claim"
                          aria-label="Delete claim"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
