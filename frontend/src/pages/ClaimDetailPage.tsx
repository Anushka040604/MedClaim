import React from "react";
import { Link, useParams } from "react-router-dom";
import { getClaim, submitMoreInfo, takeDecision, uploadDocuments } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRelativeTime } from "../lib/utils";
import { Button, Card, Input, Label, Pill, Textarea, SuccessToast, FileInput, Select } from "../components/Ui";
import {
  FraudRiskRadialGauge,
  PolicyComplianceDonut,
  DocumentsByTypeBar,
  CitationsBar,
} from "../components/AiCharts";

const DOC_TYPES = ["Prescription", "Hospital Bill", "Lab Report", "Discharge Summary", "Other"];

function StatusTimeline({ history }: { history: any[] }) {
  const items = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return (
    <div className="space-y-4">
      {items.map((h, i) => {
        const isMoreInfoSubmitted = String(h.to_status || "").toLowerCase() === "more info submitted";
        return (
        <div key={h.id} className="flex gap-3">
          <div className="relative flex flex-col items-center">
            <div
              className={`h-3 w-3 shrink-0 rounded-full ring-2 ${
                isMoreInfoSubmitted
                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 ring-emerald-100"
                  : "bg-gradient-to-br from-primary-500 to-primary-600 ring-primary-100"
              }`}
            />
            {i < items.length - 1 ? (
              <div className="mt-1 h-full min-h-[8px] w-px bg-gradient-to-b from-primary-200 to-primary-100" />
            ) : null}
          </div>
          <div className={`pb-2 rounded-lg px-3 py-2 -mx-1 ${isMoreInfoSubmitted ? "bg-emerald-50/60 border border-emerald-200" : "bg-primary-50/30"}`}>
            <p className="text-sm font-semibold text-neutral-900">{h.to_status}</p>
            <p className="text-xs text-primary-600">{new Date(h.created_at).toLocaleString()}</p>
            {h.message ? <p className="mt-1 text-sm text-neutral-600">{h.message}</p> : null}
          </div>
        </div>
      );
      })}
    </div>
  );
}

type ClaimFraudFields = {
  fraud_probability?: number | null;
  anomaly_score?: number | null;
  risk_score?: number | null;
  risk_level?: string | null;
  fraud_flags?: Array<Record<string, unknown>> | null;
} | null;

function AiReportCard({ jsonStr, claimFraud }: { jsonStr: string | null | undefined; claimFraud?: ClaimFraudFields }) {
  const [showRaw, setShowRaw] = React.useState(false);
  const report = React.useMemo(() => {
    if (!jsonStr || !jsonStr.trim()) return null;
    try {
      return JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [jsonStr]);

  if (!report) {
    return (
      <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-5 text-sm text-neutral-600">
        No AI report yet. It is generated after the claim is submitted, documents are uploaded, and the AI pipeline finishes. Use{" "}
        <span className="font-medium">Refresh</span> or keep <span className="font-medium">Live</span> on to poll.
      </div>
    );
  }

  const policy = report.stage3_policy_rag as Record<string, unknown> | undefined;
  const fraud = report.stage5_fraud_scoring as Record<string, unknown> | undefined;
  const codeVal = report.stage4_code_validation as Record<string, unknown> | undefined;
  const extraction = report.stage2_extraction as { documents?: Array<{ document_type?: string; original_filename?: string }> } | undefined;
  const citations = (policy && Array.isArray(policy.citations) ? policy.citations : []) as Array<{ id?: string; source?: string }>;

  const n = (v: unknown) => (v != null && v !== "" ? Number(v) : NaN);
  const nDef = (v: unknown) => (v == null || v === "" ? NaN : n(v));
  const pickNum = (a: unknown, b: unknown) => {
    const x = nDef(a);
    if (!Number.isNaN(x)) return x;
    return nDef(b);
  };
  const fraudFromJson = fraud as Record<string, unknown> | undefined;
  const fraudScore = (() => {
    const a = n(fraudFromJson?.risk_score_0_100);
    if (!Number.isNaN(a)) return a;
    const b = n(fraudFromJson?.risk_score);
    if (!Number.isNaN(b)) return b;
    const c = n(claimFraud?.risk_score);
    if (!Number.isNaN(c)) return c;
    return 0;
  })();
  const fraudLevel =
    (fraudFromJson?.risk_level != null && String(fraudFromJson.risk_level)) ||
    (claimFraud?.risk_level != null ? String(claimFraud.risk_level) : undefined);
  const fraudProb = pickNum(fraudFromJson?.fraud_probability, claimFraud?.fraud_probability);
  const anomalyS = pickNum(fraudFromJson?.anomaly_score, claimFraud?.anomaly_score);
  const modelStatus =
    (typeof fraudFromJson?.model_status === "string" ? fraudFromJson.model_status : null) || null;
  const flagsFromJson = Array.isArray(fraudFromJson?.flags) ? (fraudFromJson.flags as Array<Record<string, unknown>>) : [];
  const flagsFromApi = claimFraud?.fraud_flags && Array.isArray(claimFraud.fraud_flags) ? claimFraud.fraud_flags : [];
  const mergedFlags = flagsFromJson.length > 0 ? flagsFromJson : flagsFromApi;
  const s4 = codeVal?.aggregate as Record<string, unknown> | undefined;

  return (
    <div className="space-y-5">
      {/* AI-generated charts */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </span>
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-700">AI insights at a glance</h3>
        </div>
        <div
          className="grid gap-6 overflow-hidden"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          }}
        >
          {(fraud != null || (claimFraud && (claimFraud.risk_score != null || claimFraud.fraud_probability != null))) && (
            <div className="min-w-0 overflow-hidden" style={{ minWidth: 0 }}>
              <FraudRiskRadialGauge score={fraudScore} riskLevel={fraudLevel} />
            </div>
          )}
          {policy && (
            <div className="min-w-0 overflow-hidden" style={{ minWidth: 0 }}>
              <PolicyComplianceDonut compliant={policy.compliant as boolean | null | undefined} />
            </div>
          )}
          {extraction?.documents?.length ? (
            <div className="min-w-0 overflow-hidden" style={{ minWidth: 0 }}>
              <DocumentsByTypeBar documents={extraction.documents} />
            </div>
          ) : null}
        </div>
        {citations.length > 0 && (
          <div className="mt-4">
            <CitationsBar citations={citations} />
          </div>
        )}
      </div>

      {policy && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 border-l-4 border-l-emerald-500">
          <p className="section-heading-muted text-emerald-700">Policy compliance</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {policy.compliant === true && (
              <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                Compliant
              </span>
            )}
            {policy.compliant === false && (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                Not compliant
              </span>
            )}
          </div>
          {typeof policy.explanation === "string" && policy.explanation ? (
            <p className="mt-3 text-sm text-neutral-700">{policy.explanation}</p>
          ) : null}
          {Array.isArray(policy.citations) && policy.citations.length > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              <span className="font-medium">Cited:</span>{" "}
              {(policy.citations as Array<{ id?: string; source?: string }>).map((c) => c.source || c.id).filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      )}

      {codeVal && codeVal.status === "ok" && s4 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 border-l-4 border-l-violet-500">
          <p className="section-heading-muted text-violet-800">ICD / CPT checks (Stage 4)</p>
          <p className="mt-1 text-sm text-neutral-700">
            Diagnosis codes: {String(s4.total_diagnosis_codes ?? "—")} (invalid: {String(s4.invalid_diagnosis_count ?? 0)}) · Procedure
            codes: {String(s4.total_procedure_codes ?? "—")} (invalid: {String(s4.invalid_procedure_count ?? 0)})
          </p>
        </div>
      )}

      {(fraud || claimFraud?.risk_score != null) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 border-l-4 border-l-amber-500">
          <p className="section-heading-muted text-amber-800">Fraud &amp; risk (Stage 5)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700">
              {fraudLevel ?? "—"}
            </span>
            <span className="text-xs text-neutral-500">Score {String(fraudScore)} / 100</span>
            {!Number.isNaN(fraudProb) && (
              <span className="text-xs text-neutral-500">Fraud p: {(fraudProb * 100).toFixed(1)}%</span>
            )}
            {!Number.isNaN(anomalyS) && <span className="text-xs text-neutral-500">Anomaly: {anomalyS.toFixed(3)}</span>}
            {modelStatus && (
              <span className="text-xs text-neutral-400" title="Model pipeline">
                {modelStatus}
              </span>
            )}
          </div>
          {fraudFromJson && String(fraudFromJson.status) === "error" && (
            <p className="mt-2 text-sm text-amber-900">Stage 5 reported an error; see flags or raw JSON.</p>
          )}
          {mergedFlags.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm text-neutral-800">
              {mergedFlags.map((f, i) => (
                <li key={i} className="flex gap-2 rounded border border-amber-100/80 bg-white/60 px-2 py-1.5">
                  <span className="shrink-0 font-mono text-xs text-amber-700">{(f.type as string) || "flag"}</span>
                  <span className="min-w-0">{(f.message as string) || (f.field as string) || JSON.stringify(f)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {extraction?.documents?.length ? (
        <div className="rounded-xl border border-primary-200 bg-primary-50/30 p-4 border-l-4 border-l-primary-500">
          <p className="section-heading">Documents processed</p>
          <ul className="mt-2 space-y-1 text-sm text-neutral-700">
            {extraction.documents.map((d: { document_type?: string; original_filename?: string }, i: number) => (
              <li key={i}>{d.original_filename || d.document_type || `Document ${i + 1}`} <span className="text-neutral-400">·</span> {d.document_type || "—"}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowRaw((v: boolean) => !v)}
        className="text-xs font-medium text-neutral-500 hover:text-neutral-700"
      >
        {showRaw ? "Hide raw JSON" : "View raw JSON"}
      </button>
      {showRaw && (
        <pre className="overflow-auto rounded-xl border border-neutral-200 bg-neutral-900 p-4 text-xs text-neutral-100">
          {jsonStr}
        </pre>
      )}
    </div>
  );
}

export default function ClaimDetailPage() {
  const { claimId } = useParams();
  const { state } = useAuth();
  const [claim, setClaim] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [polling, setPolling] = React.useState(true);

  // Upload
  const [files, setFiles] = React.useState<File[]>([]);
  const [docTypes, setDocTypes] = React.useState<string[]>([]);
  const [uploadBusy, setUploadBusy] = React.useState(false);

  // Decision
  const [notes, setNotes] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [decisionBusy, setDecisionBusy] = React.useState(false);
  const [additionalInfo, setAdditionalInfo] = React.useState("");
  const [moreInfoBusy, setMoreInfoBusy] = React.useState(false);

  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function refresh() {
    if (!claimId) return;
    setError(null);
    try {
      const data = await getClaim(claimId);
      setClaim(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Failed to load claim");
    }
  }

  React.useEffect(() => {
    refresh();
  }, [claimId]);

  React.useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => refresh(), 2000);
    return () => clearInterval(t);
  }, [polling, claimId]);

  async function onUpload() {
    if (!claimId) return;
    setUploadBusy(true);
    setError(null);
    try {
      await uploadDocuments({ claimId, files, documentTypes: docTypes });
      setFiles([]);
      setDocTypes([]);
      await refresh();
      setSuccessMessage("Documents uploaded successfully.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  async function onDecision(action: "approve" | "reject" | "request_more_info") {
    if (!claimId) return;
    setDecisionBusy(true);
    setError(null);
    try {
      const updated = await takeDecision({
        claimId,
        action,
        notes: notes || undefined,
        message_to_claimant: message || undefined
      });
      setClaim(updated);
      setSuccessMessage(action === "approve" ? "Claim approved." : action === "reject" ? "Claim rejected." : "Request for more info sent.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Decision failed");
    } finally {
      setDecisionBusy(false);
    }
  }

  async function onSubmitMoreInfo() {
    if (!claimId || !additionalInfo.trim()) return;
    setMoreInfoBusy(true);
    setError(null);
    try {
      const updated = await submitMoreInfo({ claimId, additional_info: additionalInfo.trim() });
      setClaim(updated);
      setAdditionalInfo("");
      setSuccessMessage("Additional information submitted. AI reprocessing started.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Failed to submit additional info");
    } finally {
      setMoreInfoBusy(false);
    }
  }

  if (!claim) {
    return (
      <Card>
        <p className="text-sm font-medium text-neutral-600">{error ?? "Loading claim…"}</p>
      </Card>
    );
  }

  const isClaimant = state.me?.role === "claimant" || state.me?.role === "admin";
  const isApprover = state.me?.role === "approver" || state.me?.role === "admin";

  return (
    <>
      <div className="mb-6">
        <Link to={state.me?.role === "approver" ? "/approver" : "/claimant"} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-800 transition-colors">
          <span>←</span> Back to {state.me?.role === "approver" ? "queue" : "claims"}
        </Link>
      </div>

      {successMessage ? (
        <div className="mb-4">
          <SuccessToast show message={successMessage} />
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card hover>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-xl font-bold text-neutral-900">{claim.patient_name}</h1>
                <p className="mt-1 text-sm text-neutral-500 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="font-mono">{claim.claim_id}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (claim.claim_id) {
                        navigator.clipboard.writeText(claim.claim_id);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors"
                    title="Copy claim ID"
                  >
                    {copied ? (
                      <>Copied!</>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2a2 2 0 012 2v2m2 4h10a2 2 0 002-2v-2a2 2 0 00-2-2H9.828a2 2 0 00-2 2v2a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                  <span className="mx-0.5">·</span>
                  Policy {claim.policy_number}
                  {claim.updated_at ? (
                    <>
                      <span className="mx-0.5">·</span>
                      <span title={new Date(claim.updated_at).toLocaleString()}>{formatRelativeTime(claim.updated_at)}</span>
                    </>
                  ) : null}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Pill tone="info">{claim.status}</Pill>
                  <Pill>{claim.decision}</Pill>
                  <Pill tone="success">₹{Number(claim.claimed_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Pill>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={refresh} size="sm">
                  Refresh
                </Button>
                <Button variant="ghost" onClick={() => setPolling((p: boolean) => !p)} size="sm">
                  {polling ? "Pause live" : "Live"}
                </Button>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4">
                <p className="section-heading">Hospital</p>
                <p className="mt-1 font-semibold text-neutral-900">{claim.hospital}</p>
              </div>
              <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4">
                <p className="section-heading">Doctor</p>
                <p className="mt-1 font-semibold text-neutral-900">{claim.doctor}</p>
              </div>
              <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4 sm:col-span-2">
                <p className="section-heading">Diagnosis</p>
                <p className="mt-1 text-sm text-neutral-700 whitespace-pre-wrap">{claim.diagnosis}</p>
              </div>
            </div>
          </Card>

          {isClaimant ? (
            <Card hover className="border-l-4 border-l-primary-500">
              <p className="section-heading">Upload documents</p>
              <h2 className="mt-2 text-lg font-bold text-neutral-900">Add documents</h2>
              <p className="mt-0.5 text-sm text-neutral-500">PDF, JPG, or PNG. Tag each file with a type.</p>
              <div className="mt-4 space-y-4">
                <FileInput
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const list = Array.from(e.target.files ?? []);
                    setFiles(list);
                    setDocTypes(list.map(() => "Other"));
                  }}
                  hint="PDF, JPG, or PNG. Tag each file type before uploading."
                />
                {files.length > 0 ? (
                  <ul className="space-y-2">
                    {files.map((f: File, i: number) => (
                      <li key={i} className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-neutral-900">{f.name}</p>
                          <p className="text-xs text-neutral-500">{Math.round(f.size / 1024)} KB</p>
                        </div>
                        <Select
                          value={docTypes[i] ?? "Other"}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const next = [...docTypes];
                            next[i] = e.target.value;
                            setDocTypes(next);
                          }}
                        >
                          {DOC_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </Select>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={onUpload} disabled={uploadBusy || files.length === 0}>
                    {uploadBusy ? "Uploading…" : "Upload"}
                  </Button>
                  <span className="text-xs text-neutral-400">Stored locally (demo)</span>
                </div>
              </div>
            </Card>
          ) : null}

          <Card hover>
            <p className="section-heading">Documents</p>
            <h2 className="mt-2 text-lg font-bold text-neutral-900">Uploaded documents</h2>
            <div className="mt-4">
              {(claim.documents ?? []).length === 0 ? (
                <p className="text-sm text-neutral-500">No documents uploaded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(claim.documents ?? []).map((doc: any) => (
                    <li key={doc.id} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{doc.original_filename}</p>
                        <p className="text-xs text-neutral-500">{doc.document_type} · {doc.content_type}</p>
                      </div>
                      <a
                        href={doc.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center rounded-xl border border-primary-200 bg-white/70 px-3 text-sm font-semibold text-primary-800 shadow-sm hover:bg-primary-50 hover:border-primary-300"
                      >
                        View / Download
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card hover>
            <p className="section-heading">Status</p>
            <h2 className="mt-2 text-lg font-bold text-neutral-900">Activity</h2>
            <p className="mt-0.5 text-sm text-neutral-500">Updates when “Live” is on.</p>
            <div className="mt-4">
              <StatusTimeline history={claim.history ?? []} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {isClaimant || isApprover ? (
            <Card hover className="border-l-4 border-l-primary-500">
              <p className="section-heading">AI insights</p>
              <h2 className="mt-2 text-lg font-bold text-neutral-900">AI report</h2>
              <p className="mt-0.5 text-sm text-neutral-500">OCR, extraction, policy, ICD/CPT, fraud (Stage 5).</p>
              <div className="mt-4">
                <AiReportCard
                  jsonStr={claim.ai_report_json}
                  claimFraud={
                    {
                      fraud_probability: claim.fraud_probability,
                      anomaly_score: claim.anomaly_score,
                      risk_score: claim.risk_score,
                      risk_level: claim.risk_level,
                      fraud_flags: claim.fraud_flags,
                    } as ClaimFraudFields
                  }
                />
              </div>
            </Card>
          ) : null}

          {isApprover ? (
            <Card hover className="border-l-4 border-l-primary-500">
              <p className="section-heading">Decision</p>
              <h2 className="mt-2 text-lg font-bold text-neutral-900">Approve or reject</h2>
              <p className="mt-0.5 text-sm text-neutral-500">Add notes and message to claimant.</p>
              <div className="mt-4 space-y-4">
                <div>
                  <Label>Notes (internal)</Label>
                  <Textarea
                    rows={3}
                    value={notes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                    placeholder="Reason for decision"
                  />
                </div>
                <div>
                  <Label>Message to claimant</Label>
                  <Input
                    value={message}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)}
                    placeholder="Shown in status history"
                  />
                </div>
                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                    {error}
                  </div>
                ) : null}
                <div className="grid grid-cols-3 gap-2">
                  <Button disabled={decisionBusy} onClick={() => onDecision("approve")}>
                    Approve
                  </Button>
                  <Button variant="danger" disabled={decisionBusy} onClick={() => onDecision("reject")}>
                    Reject
                  </Button>
                  <Button variant="ghost" disabled={decisionBusy} onClick={() => onDecision("request_more_info")}>
                    Request info
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {isClaimant && claim.status === "More Info Requested" ? (
            <Card hover className="border-l-4 border-l-emerald-500">
              <p className="section-heading">More info response</p>
              <h2 className="mt-2 text-lg font-bold text-neutral-900">Submit additional details</h2>
              <p className="mt-0.5 text-sm text-neutral-500">This will re-run the full AI pipeline automatically.</p>
              <div className="mt-4 space-y-3">
                <Textarea
                  rows={4}
                  value={additionalInfo}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAdditionalInfo(e.target.value)}
                  placeholder="Add clarifications requested by approver"
                />
                <Button onClick={onSubmitMoreInfo} disabled={moreInfoBusy || !additionalInfo.trim()}>
                  {moreInfoBusy ? "Submitting…" : "Submit more info"}
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

