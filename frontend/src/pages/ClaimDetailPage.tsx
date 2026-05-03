import React from "react";
import { Link, useParams } from "react-router-dom";
import { getClaim, submitMoreInfo, takeDecision, uploadDocuments } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRelativeTime } from "../lib/utils";
import { Button, Card, Input, Label, Pill, Textarea, FileInput, Select, Skeleton, ConfirmDialog, useToast, RetryError } from "../components/Ui";
import { getStatusTone, isProcessing } from "../lib/status";

const DOC_TYPES = ["Hospital Bill", "Discharge Summary", "Lab Report", "Prescription", "Consent Form", "Other"];

// Sort order for documents (by clinical importance for an approver)
const DOC_TYPE_RANK: Record<string, number> = {
  "Hospital Bill": 1,
  "Discharge Summary": 2,
  "Lab Report": 3,
  "Prescription": 4,
  "Consent Form": 5,
  "Other": 6,
};

// Map internal fraud flag types to human-readable text + severity
type FlagSeverity = "critical" | "warning" | "info";
function describeFlag(type: string, message: string): { label: string; severity: FlagSeverity; detail: string } {
  const t = String(type || "").toLowerCase();
  if (t === "ml_models_not_trained") {
    return {
      label: "Rules-only scoring",
      severity: "info",
      detail: "ML models not trained yet. Risk score uses rules-based heuristics only.",
    };
  }
  if (t === "invalid_medical_codes") {
    return {
      label: "Invalid medical codes",
      severity: "warning",
      detail: message || "One or more diagnosis or procedure codes failed validation.",
    };
  }
  if (t === "amount_mismatch") {
    return {
      label: "Amount mismatch",
      severity: "warning",
      detail: message || "Extracted document amount does not match claimed amount.",
    };
  }
  if (t === "fraud_detection_error") {
    return { label: "Risk scoring failed", severity: "critical", detail: message || "Risk model errored." };
  }
  // Fallback: title-case the type
  const pretty = t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { label: pretty || "Flag", severity: "warning", detail: message || "" };
}

// Risk score → label + color band
function riskBand(score: number): { label: string; color: string; bg: string; border: string } {
  if (score <= 30) return { label: "Low risk", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (score <= 60) return { label: "Medium risk", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
  return { label: "High risk", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
}

function StatusTimeline({ history, defaultExpanded = false }: { history: any[]; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  // Newest first for "last 3" preview
  const items = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const visible = expanded ? items : items.slice(0, 3);
  const hidden = items.length - visible.length;

  return (
    <div>
      <ol className="space-y-2">
        {visible.map((h, i) => {
          const to = String(h.to_status || "").toLowerCase();
          const isDecision = to === "decision";
          const isMoreInfo = to.includes("more info");
          const dotColor = isDecision
            ? "bg-emerald-500"
            : isMoreInfo
              ? "bg-amber-500"
              : "bg-primary-500";
          return (
            <li key={h.id ?? i} className="flex gap-2.5">
              <div className="flex flex-col items-center pt-1">
                <span className={`h-2 w-2 shrink-0 rounded-full ring-2 ring-white ${dotColor}`} />
                {i < visible.length - 1 ? <span className="mt-0.5 h-full min-h-[12px] w-px bg-neutral-200" /> : null}
              </div>
              <div className="flex-1 min-w-0 pb-2">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <p className="text-sm font-semibold text-neutral-900">{h.to_status}</p>
                  <p className="text-[11px] text-neutral-500" title={new Date(h.created_at).toLocaleString()}>
                    {formatRelativeTime(h.created_at)}
                  </p>
                </div>
                {h.message ? <p className="mt-0.5 text-xs text-neutral-600">{h.message}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-xs font-medium text-primary-700 hover:text-primary-900"
        >
          Show {hidden} earlier {hidden === 1 ? "event" : "events"}
        </button>
      ) : null}
      {expanded && items.length > 3 ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
        >
          Collapse
        </button>
      ) : null}
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

function findProcessingStart(history: any[] | undefined): Date | null {
  if (!Array.isArray(history) || history.length === 0) return null;
  const matches = history
    .filter((h) => {
      const to = String(h?.to_status || "").toLowerCase();
      return to === "processing" || to.includes("ai processing started") || to.includes("ai reprocessing");
    })
    .map((h) => new Date(h.created_at).getTime())
    .filter((t) => !Number.isNaN(t));
  if (matches.length === 0) return null;
  return new Date(Math.max(...matches));
}

function ProcessingStatus({
  startedAt,
  docCount,
}: {
  startedAt: Date | null;
  docCount: number;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsedSec = startedAt ? Math.max(0, Math.floor((now - startedAt.getTime()) / 1000)) : 0;
  const estTotalSec = Math.max(60, docCount * 45 + 60);
  const pct = Math.min(95, Math.max(3, Math.floor((elapsedSec / estTotalSec) * 100)));
  const remainingSec = Math.max(0, estTotalSec - elapsedSec);

  const fmt = (s: number) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m}m` : `${m}m ${r}s`;
  };

  let stage = "Reading documents (OCR)";
  let stageNum = 1;
  if (elapsedSec > docCount * 25) {
    stage = "Checking policy compliance";
    stageNum = 3;
  } else if (elapsedSec > docCount * 15) {
    stage = "Extracting fields";
    stageNum = 2;
  }
  if (elapsedSec > docCount * 35) {
    stage = "Running fraud detection";
    stageNum = 5;
  }

  let helper: string;
  if (elapsedSec < 30) {
    helper = `ETA ~${fmt(remainingSec)}. Keep "Live" on to see results as they arrive.`;
  } else if (elapsedSec < estTotalSec * 0.7) {
    helper = `ETA ~${fmt(remainingSec)}. Groq API rate limits can extend this on free tier.`;
  } else if (elapsedSec < estTotalSec * 1.3) {
    helper = "Almost done. Final stages (policy + fraud) running now.";
  } else {
    helper = "Taking longer than usual. Pipeline still alive — Groq API may be rate-limiting. Hit Refresh in a minute.";
  }

  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-primary-900">AI is analyzing your claim</p>
            {startedAt ? (
              <p className="text-xs font-medium text-primary-700 tabular-nums">
                {fmt(elapsedSec)} elapsed
              </p>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-neutral-600">
            Stage {stageNum} of 5: <span className="font-medium text-neutral-800">{stage}</span>
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-primary-100">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-neutral-600">
          <span>{pct}%</span>
          <span className="tabular-nums">~{fmt(estTotalSec)} total</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-neutral-600">{helper}</p>
    </div>
  );
}

function AiReportCard({
  jsonStr,
  claimFraud,
  claimStatus,
  history,
  docCount,
}: {
  jsonStr: string | null | undefined;
  claimFraud?: ClaimFraudFields;
  claimStatus?: string;
  history?: any[];
  docCount?: number;
}) {
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
    const processing = isProcessing(claimStatus);
    if (processing) {
      const startedAt = findProcessingStart(history);
      return <ProcessingStatus startedAt={startedAt} docCount={Math.max(1, docCount ?? 1)} />;
    }
    return (
      <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary-900">AI report not available yet</p>
            <p className="mt-1 text-sm text-neutral-700">
              Upload documents and the AI pipeline will run automatically. Use Refresh once it finishes.
            </p>
          </div>
        </div>
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

  // Decode flags into human-readable + severity, dedup
  const describedFlags = mergedFlags.map((f) => describeFlag(String(f.type ?? ""), String((f.message ?? f.field ?? "") as string)));
  const critical = describedFlags.filter((f) => f.severity === "critical");
  const warnings = describedFlags.filter((f) => f.severity === "warning");
  const infos = describedFlags.filter((f) => f.severity === "info");
  const band = riskBand(fraudScore);

  // Pull policy explanation: first sentence is the decision; rest is detail
  const policyText = typeof policy?.explanation === "string" ? policy.explanation : "";
  const firstSentenceMatch = policyText.match(/^[^.!?]+[.!?]/);
  const policyHeadline = firstSentenceMatch ? firstSentenceMatch[0].trim() : policyText;
  const policyRest = firstSentenceMatch ? policyText.slice(firstSentenceMatch[0].length).trim() : "";

  // Suppress unused prop refs (modelStatus, anomalyS shown only on raw)
  void modelStatus; void anomalyS; void fraudProb; void citations;

  return (
    <div className="space-y-3">
      {/* Top row: Risk score (compact) + Policy compliance verdict */}
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        {/* Risk score block */}
        {(fraud || claimFraud?.risk_score != null) && (
          <div className={`rounded-xl border ${band.border} ${band.bg} px-4 py-3 min-w-[140px]`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Risk</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={`text-3xl font-bold tabular-nums ${band.color}`}>{String(fraudScore)}</span>
              <span className="text-xs text-neutral-500">/ 100</span>
            </div>
            <p className={`mt-0.5 text-xs font-semibold ${band.color}`}>{band.label}</p>
          </div>
        )}

        {/* Policy compliance — primary decision content */}
        {policy && (
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Policy compliance</p>
              {policy.compliant === true && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Compliant
                </span>
              )}
              {policy.compliant === false && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Not compliant
                </span>
              )}
            </div>
            {policyHeadline ? (
              <p className="mt-1.5 text-sm font-medium leading-snug text-neutral-900">{policyHeadline}</p>
            ) : null}
            {policyRest ? (
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">{policyRest}</p>
            ) : null}
            {Array.isArray(policy.citations) && policy.citations.length > 0 && (
              <p className="mt-1.5 text-[11px] text-neutral-500">
                Cited: {(policy.citations as Array<{ id?: string; source?: string }>).map((c) => c.source || c.id).filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ICD / CPT compact one-liner */}
      {codeVal && codeVal.status === "ok" && s4 && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs text-neutral-700">
          <span className="font-semibold text-neutral-900">Codes:</span>{" "}
          {String(s4.total_diagnosis_codes ?? "—")} diagnosis ({String(s4.invalid_diagnosis_count ?? 0)} invalid)
          <span className="text-neutral-300 mx-2">·</span>
          {String(s4.total_procedure_codes ?? "—")} procedure ({String(s4.invalid_procedure_count ?? 0)} invalid)
        </div>
      )}

      {/* Issues grouped by severity, human-mapped */}
      {(critical.length + warnings.length + infos.length) > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Issues</p>
          {critical.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {critical.map((f, i) => (
                <li key={`c${i}`} className="flex gap-2 rounded-lg border border-red-200 bg-red-50/50 px-2.5 py-1.5">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-red-900">{f.label}</p>
                    {f.detail ? <p className="text-xs text-red-800/80 leading-snug">{f.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {warnings.map((f, i) => (
                <li key={`w${i}`} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 py-1.5">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-900">{f.label}</p>
                    {f.detail ? <p className="text-xs text-amber-800/80 leading-snug">{f.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {infos.length > 0 && (
            <ul className="space-y-1.5">
              {infos.map((f, i) => (
                <li key={`i${i}`} className="flex gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-neutral-400" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-700">{f.label}</p>
                    {f.detail ? <p className="text-xs text-neutral-600 leading-snug">{f.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Documents processed: tiny inline list */}
      {extraction?.documents?.length ? (
        <details className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-neutral-700 select-none">
            Documents processed ({extraction.documents.length})
          </summary>
          <ul className="mt-2 space-y-0.5 text-neutral-600">
            {extraction.documents.map((d: { document_type?: string; original_filename?: string }, i: number) => (
              <li key={i} className="truncate">
                <span className="font-medium text-neutral-900">{d.original_filename || `Document ${i + 1}`}</span>
                <span className="text-neutral-300 mx-1">·</span>
                <span>{d.document_type || "—"}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <button
        type="button"
        onClick={() => setShowRaw((v: boolean) => !v)}
        className="text-[11px] font-medium text-neutral-400 hover:text-neutral-600"
      >
        {showRaw ? "Hide raw JSON" : "View raw JSON"}
      </button>
      {showRaw && (
        <pre className="overflow-auto rounded-xl border border-neutral-200 bg-neutral-900 p-3 text-[11px] text-neutral-100">
          {jsonStr}
        </pre>
      )}
    </div>
  );
}

export default function ClaimDetailPage() {
  const { claimId } = useParams();
  const { state } = useAuth();
  const toast = useToast();
  const [claim, setClaim] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [polling, setPolling] = React.useState(true);

  // Upload
  const [files, setFiles] = React.useState<File[]>([]);
  const [docTypes, setDocTypes] = React.useState<string[]>([]);
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const [uploadType, setUploadType] = React.useState<string>("Hospital Bill");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Decision
  const [notes, setNotes] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [decisionBusy, setDecisionBusy] = React.useState(false);
  const [additionalInfo, setAdditionalInfo] = React.useState("");
  const [moreInfoBusy, setMoreInfoBusy] = React.useState(false);
  const [pendingDecision, setPendingDecision] = React.useState<"approve" | "reject" | "request_more_info" | null>(null);

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

  async function autoUpload(picked: File[], typeForAll: string) {
    if (!claimId || picked.length === 0) return;
    setUploadBusy(true);
    setError(null);
    setFiles(picked);
    const types = picked.map(() => typeForAll);
    setDocTypes(types);
    try {
      await uploadDocuments({ claimId, files: picked, documentTypes: types });
      setFiles([]);
      setDocTypes([]);
      await refresh();
      toast.show(`${picked.length} document${picked.length === 1 ? "" : "s"} uploaded.`, "success");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Upload failed");
      toast.show("Upload failed.", "error");
    } finally {
      setUploadBusy(false);
    }
  }

  async function executeDecision() {
    if (!claimId || !pendingDecision) return;
    const action = pendingDecision;
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
      toast.show(
        action === "approve" ? "Claim approved." :
        action === "reject" ? "Claim rejected." :
        "Request for more info sent.",
        "success"
      );
      setPendingDecision(null);
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Decision failed";
      setError(msg);
      toast.show(msg, "error");
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
      toast.show("Additional information submitted. AI reprocessing started.", "success");
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Failed to submit additional info";
      setError(msg);
      toast.show(msg, "error");
    } finally {
      setMoreInfoBusy(false);
    }
  }

  if (!claim) {
    if (error) {
      return (
        <RetryError
          message={error}
          onRetry={() => { setError(null); refresh(); }}
        />
      );
    }
    return (
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-3xl border border-neutral-200/70 bg-white/80 p-6 space-y-3">
            <Skeleton width="220px" height="24px" />
            <Skeleton width="320px" height="14px" />
            <div className="flex gap-2 pt-2">
              <Skeleton width="80px" height="24px" className="rounded-full" />
              <Skeleton width="100px" height="24px" className="rounded-full" />
              <Skeleton width="120px" height="24px" className="rounded-full" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 pt-4">
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          </div>
          <Skeleton variant="card" />
        </div>
        <div className="space-y-6">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      </div>
    );
  }

  const isClaimant = state.me?.role === "claimant" || state.me?.role === "admin";
  const isApprover = state.me?.role === "approver" || state.me?.role === "admin";
  const aiReportReady = Boolean(claim.ai_report_json && String(claim.ai_report_json).trim().length > 0);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-neutral-500 flex items-center gap-1.5">
        <Link to={state.me?.role === "approver" ? "/approver" : "/claimant"} className="hover:text-primary-700 transition-colors">
          {state.me?.role === "approver" ? "Review queue" : "Claims"}
        </Link>
        <span className="text-neutral-300">/</span>
        <span className="font-mono text-neutral-700">{claim.claim_id}</span>
      </nav>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card hover className="!p-4 sm:!p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-neutral-900 truncate">{claim.patient_name}</h1>
                <p className="mt-0.5 text-xs text-neutral-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="font-mono text-primary-700">{claim.claim_id}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (claim.claim_id) {
                        navigator.clipboard.writeText(claim.claim_id);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                    title="Copy claim ID"
                  >
                    {copied ? "Copied!" : (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2a2 2 0 012 2v2m2 4h10a2 2 0 002-2v-2a2 2 0 00-2-2H9.828a2 2 0 00-2 2v2a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                  <span className="text-neutral-300">·</span>
                  <span>Policy {claim.policy_number}</span>
                  {claim.updated_at ? (
                    <>
                      <span className="text-neutral-300">·</span>
                      <span title={new Date(claim.updated_at).toLocaleString()}>{formatRelativeTime(claim.updated_at)}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Subtle live indicator: dot only, click to pause/resume */}
                <button
                  type="button"
                  onClick={() => setPolling((p: boolean) => !p)}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
                  title={polling ? "Auto-refresh on. Click to pause." : "Auto-refresh paused. Click to resume."}
                >
                  {polling ? (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                  )}
                  {polling ? "Live" : "Paused"}
                </button>

                {/* Role-based primary CTA */}
                {isApprover && claim.status !== "Decision" ? (
                  <div className="flex gap-1.5">
                    <Button size="sm" disabled={decisionBusy} onClick={() => setPendingDecision("approve")}>Approve</Button>
                    <Button size="sm" variant="danger" disabled={decisionBusy} onClick={() => setPendingDecision("reject")}>Reject</Button>
                  </div>
                ) : null}
                {isClaimant && claim.status === "More Info Requested" ? (
                  <Button size="sm" onClick={() => document.getElementById("more-info-section")?.scrollIntoView({ behavior: "smooth" })}>
                    Submit info
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Pill tone={getStatusTone(claim.status)} pulse={isProcessing(claim.status)}>{claim.status}</Pill>
              {claim.decision && String(claim.decision).toLowerCase() !== "pending" ? (
                <Pill tone={String(claim.decision).toLowerCase() === "approved" ? "success" : String(claim.decision).toLowerCase() === "rejected" ? "danger" : "warning"}>
                  {claim.decision}
                </Pill>
              ) : null}
              <span className="ml-1 text-base font-semibold text-neutral-900">
                ₹{Number(claim.claimed_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Hospital</dt>
                <dd className="font-medium text-neutral-900 truncate">{claim.hospital}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Doctor</dt>
                <dd className="font-medium text-neutral-900 truncate">{claim.doctor}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Treatment date</dt>
                <dd className="font-medium text-neutral-900 truncate">{claim.treatment_date}</dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Diagnosis</dt>
                <dd className="text-neutral-800 whitespace-pre-wrap">{claim.diagnosis}</dd>
              </div>
            </dl>
          </Card>

          {isClaimant ? (
            <Card hover className="!p-3 sm:!p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mr-1">Upload</span>
                <Select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  className="!h-9 !w-auto !text-sm"
                  disabled={uploadBusy}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  className="hidden"
                  disabled={uploadBusy}
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    if (picked.length > 0) {
                      autoUpload(picked, uploadType);
                    }
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadBusy}
                >
                  {uploadBusy ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Uploading {files.length} file{files.length === 1 ? "" : "s"}…
                    </>
                  ) : (
                    "Choose files"
                  )}
                </Button>
                <span className="text-[11px] text-neutral-400 ml-auto">PDF, JPG, PNG · auto-upload as {uploadType}</span>
              </div>
            </Card>
          ) : null}

          <Card hover className="!p-4 sm:!p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">Documents ({(claim.documents ?? []).length})</h2>
            </div>
            <div className="mt-3">
              {(claim.documents ?? []).length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-neutral-700">No documents yet</p>
                  <p className="mt-1 text-xs text-neutral-500">Use the upload bar above to add hospital bills, prescriptions, or lab reports.</p>
                </div>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {[...(claim.documents ?? [])]
                    .sort((a: any, b: any) => (DOC_TYPE_RANK[a.document_type] ?? 99) - (DOC_TYPE_RANK[b.document_type] ?? 99))
                    .map((doc: any) => {
                      const tagColor =
                        doc.document_type === "Hospital Bill" ? "bg-primary-50 text-primary-700 border-primary-200" :
                        doc.document_type === "Discharge Summary" ? "bg-violet-50 text-violet-700 border-violet-200" :
                        doc.document_type === "Lab Report" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        doc.document_type === "Prescription" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        "bg-neutral-100 text-neutral-700 border-neutral-200";
                      return (
                        <li key={doc.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
                          <a
                            href={doc.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 group"
                            title="Open in new tab"
                          >
                            <p className="truncate text-xs font-medium text-neutral-900 group-hover:text-primary-700">{doc.original_filename}</p>
                            <span className={`inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${tagColor}`}>
                              {doc.document_type || "Other"}
                            </span>
                          </a>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </Card>

          {/* AI report renders here (full left-col width = ~2/3 of page) when data is ready */}
          {aiReportReady && (isClaimant || isApprover) ? (
            <Card hover className="border-l-4 border-l-primary-500 !p-4 sm:!p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-neutral-900">AI report</h2>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">Insights</span>
              </div>
              <div className="mt-3">
                <AiReportCard
                  jsonStr={claim.ai_report_json}
                  claimStatus={claim.status}
                  history={claim.history}
                  docCount={(claim.documents ?? []).length}
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

          <Card hover className="!p-4 sm:!p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">Activity</h2>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">Status</span>
            </div>
            <div className="mt-3">
              <StatusTimeline history={claim.history ?? []} />
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {/* Narrow AI processing/ETA card stays in right col while pipeline runs */}
          {!aiReportReady && (isClaimant || isApprover) ? (
            <Card hover className="border-l-4 border-l-primary-500 !p-4 sm:!p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-neutral-900">AI report</h2>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">Insights</span>
              </div>
              <div className="mt-3">
                <AiReportCard
                  jsonStr={claim.ai_report_json}
                  claimStatus={claim.status}
                  history={claim.history}
                  docCount={(claim.documents ?? []).length}
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
            <Card hover className="border-l-4 border-l-primary-500 !p-4 sm:!p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-neutral-900">Approve or reject</h2>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">Decision</span>
              </div>
              <div className="mt-3 space-y-3">
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button disabled={decisionBusy} onClick={() => setPendingDecision("approve")}>
                    Approve
                  </Button>
                  <Button variant="danger" disabled={decisionBusy} onClick={() => setPendingDecision("reject")}>
                    Reject
                  </Button>
                  <Button variant="ghost" disabled={decisionBusy} onClick={() => setPendingDecision("request_more_info")}>
                    Request info
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {isClaimant && claim.status === "More Info Requested" ? (
            <div id="more-info-section">
            <Card hover className="border-l-4 border-l-emerald-500 !p-4 sm:!p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-neutral-900">Submit additional details</h2>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">More info</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">Re-runs the full AI pipeline.</p>
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
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDecision !== null}
        onClose={() => setPendingDecision(null)}
        onConfirm={executeDecision}
        title={
          pendingDecision === "approve" ? "Approve this claim?" :
          pendingDecision === "reject" ? "Reject this claim?" :
          "Request more info?"
        }
        description={
          pendingDecision === "approve"
            ? "This marks the claim as approved and notifies the claimant. This decision is final."
            : pendingDecision === "reject"
              ? "This marks the claim as rejected and notifies the claimant. This decision is final."
              : "This pauses the claim and asks the claimant to provide additional information. The AI pipeline will re-run when they reply."
        }
        confirmLabel={
          pendingDecision === "approve" ? "Approve" :
          pendingDecision === "reject" ? "Reject" :
          "Send request"
        }
        confirmVariant={pendingDecision === "reject" ? "danger" : "primary"}
        busy={decisionBusy}
      />
    </>
  );
}

