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
function describeFlag(
  type: string,
  message: string,
  ctx?: { claimedAmount?: number; invalidCodeCount?: number; totalCodes?: number }
): { label: string; severity: FlagSeverity; detail: string; hide?: boolean } {
  const t = String(type || "").toLowerCase();
  // Hide "rules-only scoring" entirely — system noise, not actionable
  if (t === "ml_models_not_trained") {
    return { label: "", severity: "info", detail: "", hide: true };
  }
  if (t === "invalid_medical_codes") {
    const n = ctx?.invalidCodeCount ?? 0;
    return {
      label: n > 0 ? `${n} medical code${n === 1 ? "" : "s"} invalid` : "Invalid medical codes",
      severity: "warning",
      detail: ctx?.totalCodes ? `${n} of ${ctx.totalCodes} codes failed validation. Verify before approving.` : "Codes failed validation.",
    };
  }
  if (t === "amount_mismatch") {
    // Try to parse the ratio from the legacy message: "...ratio=1.79)"
    const ratioMatch = String(message || "").match(/ratio=([\d.]+)/);
    const ratio = ratioMatch ? Number(ratioMatch[1]) : null;
    const claimed = ctx?.claimedAmount;
    const extracted = ratio && claimed ? Math.round(claimed * ratio) : null;
    const diff = extracted && claimed ? extracted - claimed : null;
    if (claimed != null && extracted != null && diff != null) {
      const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN")}`;
      return {
        label: "Amount mismatch",
        severity: "warning",
        detail: `Claimed ${fmt(claimed)} · Extracted ${fmt(extracted)} · ${diff > 0 ? "Over by" : "Under by"} ${fmt(diff)}`,
      };
    }
    return {
      label: "Amount mismatch",
      severity: "warning",
      detail: claimed != null ? `Claimed ${`₹${claimed.toLocaleString("en-IN")}`}; document amount differs.` : "Document amount differs from claimed amount.",
    };
  }
  if (t === "fraud_detection_error") {
    return { label: "Risk scoring failed", severity: "critical", detail: message || "Risk model errored." };
  }
  const pretty = t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { label: pretty || "Flag", severity: "warning", detail: message || "" };
}

// Risk score → label + color band
function riskBand(score: number): { label: string; color: string; bg: string; border: string } {
  if (score <= 30) return { label: "Low risk", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (score <= 60) return { label: "Medium risk", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
  return { label: "High risk", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
}

function StatusTimeline({ history, defaultExpanded = false, previewCount = 1 }: { history: any[]; defaultExpanded?: boolean; previewCount?: number }) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  // Newest first for "last N" preview
  const items = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const visible = expanded ? items : items.slice(0, previewCount);
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

type Verdict = {
  label: string;
  sub: string;
  tone: "approve" | "reject" | "review";
};

function computeVerdict(opts: {
  compliant: boolean | null | undefined;
  riskScore: number;
  criticalCount: number;
  warningCount: number;
}): Verdict {
  const { compliant, riskScore, criticalCount, warningCount } = opts;
  if (compliant === false || riskScore > 60 || criticalCount > 0) {
    return {
      label: "Likely reject",
      sub: criticalCount > 0
        ? `${criticalCount} critical · ${warningCount} warning${warningCount === 1 ? "" : "s"}`
        : compliant === false ? "Policy violation" : "High risk score",
      tone: "reject",
    };
  }
  if (compliant === true && riskScore <= 30 && warningCount === 0) {
    return {
      label: "Likely approve",
      sub: "Compliant · low risk · no warnings",
      tone: "approve",
    };
  }
  return {
    label: warningCount > 0
      ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
      : "Needs review",
    sub: warningCount > 0 ? "Review before deciding" : "Borderline signals",
    tone: "review",
  };
}

function AiReportCard({
  jsonStr,
  claimFraud,
  claimStatus,
  history,
  docCount,
  claimedAmount,
}: {
  jsonStr: string | null | undefined;
  claimFraud?: ClaimFraudFields;
  claimStatus?: string;
  history?: any[];
  docCount?: number;
  claimedAmount?: number;
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

  // Decode flags into human-readable + severity, dedup, drop hidden
  const totalInvalidCodes = s4 ? (Number(s4.invalid_diagnosis_count ?? 0) + Number(s4.invalid_procedure_count ?? 0)) : 0;
  const totalCodes = s4 ? (Number(s4.total_diagnosis_codes ?? 0) + Number(s4.total_procedure_codes ?? 0)) : 0;
  const describedFlags = mergedFlags
    .map((f) => describeFlag(
      String(f.type ?? ""),
      String((f.message ?? f.field ?? "") as string),
      { claimedAmount, invalidCodeCount: totalInvalidCodes, totalCodes }
    ))
    .filter((f) => !f.hide);
  const critical = describedFlags.filter((f) => f.severity === "critical");
  const warnings = describedFlags.filter((f) => f.severity === "warning");
  const infos = describedFlags.filter((f) => f.severity === "info");
  const band = riskBand(fraudScore);

  // Pull policy explanation: first sentence is the decision; rest is detail
  const policyText = typeof policy?.explanation === "string" ? policy.explanation : "";
  const firstSentenceMatch = policyText.match(/^[^.!?]+[.!?]/);
  const policyHeadline = firstSentenceMatch ? firstSentenceMatch[0].trim() : policyText;
  const policyRest = firstSentenceMatch ? policyText.slice(firstSentenceMatch[0].length).trim() : "";

  // Suppress unused prop refs
  void modelStatus; void anomalyS; void fraudProb; void citations; void docCount; void history;

  // Top issues (max 2) — critical first then warnings, infos hidden by default
  const topIssues = [...critical, ...warnings].slice(0, 2);
  const remainingIssues = critical.length + warnings.length + infos.length - topIssues.length;

  // Verdict computed from compliance + risk + critical count
  const verdict = computeVerdict({
    compliant: policy?.compliant as boolean | null | undefined,
    riskScore: fraudScore,
    criticalCount: critical.length,
    warningCount: warnings.length,
  });

  const verdictTone =
    verdict.tone === "approve" ? "border-emerald-400 bg-emerald-50 text-emerald-900" :
    verdict.tone === "reject" ? "border-red-400 bg-red-50 text-red-900" :
    "border-amber-400 bg-amber-50 text-amber-900";
  const verdictDot =
    verdict.tone === "approve" ? "bg-emerald-500" :
    verdict.tone === "reject" ? "bg-red-500" :
    "bg-amber-500";

  // Debug mode: show raw JSON only when ?debug=1 in URL
  const showDebug = typeof window !== "undefined" && window.location.search.includes("debug=1");

  return (
    <div className="space-y-3">
      {/* VERDICT banner — first thing the eye lands on. Risk LEFT inside box */}
      <div className={`rounded-2xl border-2 ${verdictTone} px-4 py-3`}>
        <div className="flex items-center gap-4">
          <div className={`shrink-0 text-center px-3 py-1.5 rounded-lg bg-white/70 border ${band.border}`}>
            <p className={`text-2xl font-bold tabular-nums leading-none ${band.color}`}>{String(fraudScore)}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500 mt-0.5">/100</p>
            <p className={`text-[10px] font-bold mt-0.5 ${band.color}`}>{band.label}</p>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${verdictDot}`} />
              <p className="text-base font-bold">{verdict.label}</p>
            </div>
            <p className="mt-0.5 text-xs opacity-80">{verdict.sub}</p>
          </div>
        </div>
      </div>

      {/* Compliance line */}
      {policy && (
        <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Policy</span>
            {policy.compliant === true && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Compliant
              </span>
            )}
            {policy.compliant === false && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Not compliant
              </span>
            )}
            {policyHeadline ? (
              <span className="text-xs text-neutral-700 leading-snug">{policyHeadline}</span>
            ) : null}
          </div>
          {policyRest ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] font-medium text-neutral-500 hover:text-neutral-700">
                Why this decision
              </summary>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">{policyRest}</p>
              {Array.isArray(policy.citations) && policy.citations.length > 0 && (
                <p className="mt-1 text-[11px] text-neutral-500">
                  Cited: {(policy.citations as Array<{ id?: string; source?: string }>).map((c) => c.source || c.id).filter(Boolean).join(", ")}
                </p>
              )}
            </details>
          ) : null}
        </div>
      )}

      {/* Top 2 issues only */}
      {topIssues.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Issues</span>
            {remainingIssues > 0 ? (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-neutral-500 hover:text-neutral-700">
                  +{remainingIssues} more
                </summary>
                <ul className="mt-2 space-y-1">
                  {[...critical, ...warnings, ...infos].slice(2).map((f, i) => (
                    <li key={`m${i}`} className="flex gap-2 text-xs text-neutral-700">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                        f.severity === "critical" ? "bg-red-500" : f.severity === "warning" ? "bg-amber-500" : "bg-neutral-400"
                      }`} />
                      <span className="min-w-0"><strong className="font-semibold">{f.label}</strong>{f.detail ? ` — ${f.detail}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          <ul className="mt-1 space-y-1">
            {topIssues.map((f, i) => (
              <li key={`t${i}`} className="flex gap-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.severity === "critical" ? "bg-red-500" : "bg-amber-500"}`} />
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${f.severity === "critical" ? "text-red-900" : "text-amber-900"}`}>
                    {f.label}
                  </p>
                  {f.detail ? <p className="text-[11px] text-neutral-600 leading-snug">{f.detail}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Codes (one-line, plain English) */}
      {codeVal && codeVal.status === "ok" && s4 && (
        <p className="text-xs text-neutral-700 px-1">
          {String(s4.total_diagnosis_codes ?? 0)} diagnosis code{Number(s4.total_diagnosis_codes ?? 0) === 1 ? "" : "s"}
          {Number(s4.invalid_diagnosis_count ?? 0) > 0 ? (
            <span className="text-amber-700 font-semibold"> ({Number(s4.invalid_diagnosis_count ?? 0)} invalid)</span>
          ) : null}
          {Number(s4.total_procedure_codes ?? 0) > 0 ? (
            <>
              <span className="mx-2 text-neutral-300">·</span>
              {String(s4.total_procedure_codes ?? 0)} procedure code{Number(s4.total_procedure_codes ?? 0) === 1 ? "" : "s"}
              {Number(s4.invalid_procedure_count ?? 0) > 0 ? (
                <span className="text-amber-700 font-semibold"> ({Number(s4.invalid_procedure_count ?? 0)} invalid)</span>
              ) : null}
            </>
          ) : null}
        </p>
      )}

      {/* Debug-only raw JSON */}
      {showDebug ? (
        <button
          type="button"
          onClick={() => setShowRaw((v: boolean) => !v)}
          className="text-[10px] font-medium text-neutral-400 hover:text-neutral-600"
        >
          {showRaw ? "Hide raw JSON" : "View raw JSON (debug)"}
        </button>
      ) : null}
      {showDebug && showRaw && (
        <pre className="overflow-auto rounded-xl border border-neutral-200 bg-neutral-900 p-3 text-[11px] text-neutral-100 max-h-48">
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
  const [overrideApprove, setOverrideApprove] = React.useState(false);

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

  // Compute critical/warning counts from claim fraud_flags for decision panel guardrails
  const claimFlagsRaw = Array.isArray(claim.fraud_flags) ? claim.fraud_flags : [];
  const claimDescribed = claimFlagsRaw
    .map((f: any) => describeFlag(String(f.type ?? ""), String((f.message ?? f.field ?? "") as string), {
      claimedAmount: Number(claim.claimed_amount),
    }))
    .filter((f: ReturnType<typeof describeFlag>) => !f.hide);
  const pageCritical = claimDescribed.filter((f: ReturnType<typeof describeFlag>) => f.severity === "critical").length;
  const pageWarnings = claimDescribed.filter((f: ReturnType<typeof describeFlag>) => f.severity === "warning").length;
  const hasBlockers = pageCritical > 0 || pageWarnings > 0;
  const approveDisabled = decisionBusy || (hasBlockers && !overrideApprove);

  // Quick reason chips
  const quickReasons = [
    pageWarnings > 0 ? "Amount mismatch" : null,
    pageCritical > 0 ? "Critical issue found" : null,
    "Invalid medical codes",
    "Documents missing",
  ].filter(Boolean) as string[];

  // Auto-fill message based on action
  function setActionDefaults(action: "approve" | "reject" | "request_more_info") {
    if (!message.trim()) {
      const defaults = {
        approve: "Your claim has been approved. The settlement will be processed shortly.",
        reject: "Your claim has been rejected. See notes for details.",
        request_more_info: "We need additional information to process your claim. Please respond via the portal.",
      };
      setMessage(defaults[action]);
    }
    setPendingDecision(action);
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-neutral-500 flex items-center gap-1.5">
        <Link to={state.me?.role === "approver" ? "/approver" : "/claimant"} className="hover:text-primary-700 transition-colors">
          {state.me?.role === "approver" ? "Review queue" : "Claims"}
        </Link>
        <span className="text-neutral-300">/</span>
        <span className="font-mono text-neutral-700">{claim.claim_id}</span>
      </nav>

      {/* Compact 1-line header strip */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2.5">
        <span className="font-mono text-sm font-bold text-neutral-900">{claim.claim_id}</span>
        <button
          type="button"
          onClick={() => {
            if (claim.claim_id) {
              navigator.clipboard.writeText(claim.claim_id);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
          className="inline-flex items-center rounded text-[11px] text-neutral-400 hover:text-neutral-700"
          title="Copy claim ID"
        >
          {copied ? "Copied!" : (
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2a2 2 0 012 2v2m2 4h10a2 2 0 002-2v-2a2 2 0 00-2-2H9.828a2 2 0 00-2 2v2a2 2 0 002 2z" />
            </svg>
          )}
        </button>
        <span className="text-neutral-200">|</span>
        <span className="text-base font-bold text-neutral-900 tabular-nums">
          ₹{Number(claim.claimed_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
        <span className="text-neutral-200">|</span>
        {claim.risk_score != null ? (
          <>
            <span className={`text-sm font-semibold ${
              Number(claim.risk_score) > 60 ? "text-red-700" :
              Number(claim.risk_score) > 30 ? "text-amber-700" :
              "text-emerald-700"
            }`}>
              {Number(claim.risk_score) > 60 ? "High risk" : Number(claim.risk_score) > 30 ? "Medium risk" : "Low risk"}
            </span>
            <span className="text-neutral-200">|</span>
          </>
        ) : null}
        <Pill tone={getStatusTone(claim.status)} pulse={isProcessing(claim.status)}>{claim.status}</Pill>
        <span className="text-neutral-200">|</span>
        <span
          className={`text-xs font-medium ${
            claim.status !== "Decision" && claim.updated_at && (Date.now() - new Date(claim.updated_at).getTime()) > 24 * 3600000
              ? "text-red-700"
              : "text-neutral-600"
          }`}
          title={new Date(claim.updated_at ?? Date.now()).toLocaleString()}
        >
          {claim.status === "Decision"
            ? `Decided ${formatRelativeTime(claim.updated_at)}`
            : `Waiting: ${(() => {
                const h = Math.max(0, (Date.now() - new Date(claim.updated_at ?? Date.now()).getTime()) / 3600000);
                if (h < 1) return `${Math.round(h * 60)}m`;
                if (h < 24) return `${Math.round(h)}h`;
                return `${Math.round(h / 24)}d`;
              })()}`}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-neutral-500" title={polling ? "Auto-refresh on" : "Paused"}>
          <button
            type="button"
            onClick={() => setPolling((p: boolean) => !p)}
            className="inline-flex items-center gap-1.5 hover:text-neutral-700"
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
        </span>
      </div>

      {/* Main 2-col: AI verdict + content (left, 2/3) | Decision sticky (right, 1/3) */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">

          {/* AI report block — verdict-first */}
          {(isClaimant || isApprover) ? (
            aiReportReady ? (
              <Card hover className="!p-3 sm:!p-4">
                <AiReportCard
                  jsonStr={claim.ai_report_json}
                  claimStatus={claim.status}
                  history={claim.history}
                  docCount={(claim.documents ?? []).length}
                  claimedAmount={Number(claim.claimed_amount)}
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
              </Card>
            ) : (
              <Card hover className="!p-3 sm:!p-4">
                <AiReportCard
                  jsonStr={claim.ai_report_json}
                  claimStatus={claim.status}
                  history={claim.history}
                  docCount={(claim.documents ?? []).length}
                  claimedAmount={Number(claim.claimed_amount)}
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
              </Card>
            )
          ) : null}

          {/* Bottom row: Patient/diagnosis | Documents | Activity (3-col on lg, stacked on sm) */}
          <div className="grid gap-3 md:grid-cols-3">
            {/* Patient + Diagnosis */}
            <Card hover className="!p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Patient</h3>
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-neutral-900">{claim.patient_name}</p>
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Hospital</dt>
                  <dd className="truncate font-medium text-neutral-800 text-right">{claim.hospital}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Doctor</dt>
                  <dd className="truncate font-medium text-neutral-800 text-right">{claim.doctor || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Treatment</dt>
                  <dd className="font-medium text-neutral-800 text-right">{claim.treatment_date}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Policy</dt>
                  <dd className="truncate font-mono text-neutral-800 text-right">{claim.policy_number}</dd>
                </div>
              </dl>
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] font-medium text-neutral-500 hover:text-neutral-700">Diagnosis</summary>
                <p className="mt-1 text-xs leading-snug text-neutral-700 whitespace-pre-wrap">{claim.diagnosis}</p>
              </details>
            </Card>

            {/* Documents */}
            <Card hover className="!p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Documents</h3>
                <span className="text-[11px] text-neutral-500">{(claim.documents ?? []).length}</span>
              </div>
              <div className="mt-2">
                {(claim.documents ?? []).length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">None uploaded</p>
                ) : (
                  <ul className="space-y-1">
                    {[...(claim.documents ?? [])]
                      .sort((a: any, b: any) => (DOC_TYPE_RANK[a.document_type] ?? 99) - (DOC_TYPE_RANK[b.document_type] ?? 99))
                      .slice(0, 5)
                      .map((doc: any) => {
                        const tagColor =
                          doc.document_type === "Hospital Bill" ? "bg-primary-50 text-primary-700" :
                          doc.document_type === "Discharge Summary" ? "bg-violet-50 text-violet-700" :
                          doc.document_type === "Lab Report" ? "bg-amber-50 text-amber-700" :
                          doc.document_type === "Prescription" ? "bg-emerald-50 text-emerald-700" :
                          "bg-neutral-100 text-neutral-700";
                        return (
                          <li key={doc.id}>
                            <a
                              href={doc.download_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 group"
                              title={doc.original_filename}
                            >
                              <span className={`inline-flex shrink-0 rounded px-1 text-[9px] font-semibold uppercase ${tagColor}`}>
                                {(doc.document_type || "Other").replace(/Hospital Bill/, "Bill").replace(/Discharge Summary/, "Discharge").replace(/Prescription/, "Rx").replace(/Lab Report/, "Lab")}
                              </span>
                              <span className="truncate text-xs text-neutral-700 group-hover:text-primary-700">{doc.original_filename}</span>
                            </a>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
              {isClaimant ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadBusy}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary-700 hover:text-primary-900"
                >
                  {uploadBusy ? "Uploading…" : "+ Add file"}
                </button>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,image/*"
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length > 0) autoUpload(picked, uploadType);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
            </Card>

            {/* Activity (latest only + expand) */}
            <Card hover className="!p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Activity</h3>
              </div>
              <div className="mt-2">
                <StatusTimeline history={claim.history ?? []} previewCount={1} />
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          {isApprover ? (
            <Card hover className="!p-4 sm:!p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-neutral-900">Decision</h2>
                {hasBlockers ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                    {pageCritical > 0 ? `${pageCritical} critical` : `${pageWarnings} warning${pageWarnings === 1 ? "" : "s"}`}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                {/* Quick reason chips — clicking adds to notes */}
                {quickReasons.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {quickReasons.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setNotes(notes ? `${notes}; ${r}` : r)}
                        className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300"
                      >
                        + {r}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div>
                  <Label>Notes (internal)</Label>
                  <Textarea
                    rows={2}
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
                    placeholder="Auto-fills based on action"
                  />
                </div>

                {/* Override toggle when blockers exist */}
                {hasBlockers ? (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideApprove}
                      onChange={(e) => setOverrideApprove(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-[11px] text-amber-900 leading-snug">
                      <strong>Override AI</strong> — approve despite {pageCritical > 0 ? "critical issues" : "warnings"}
                    </span>
                  </label>
                ) : null}

                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                    {error}
                  </div>
                ) : null}

                {/* Big primary actions, vertical stack */}
                <div className="space-y-2">
                  <Button
                    disabled={approveDisabled}
                    onClick={() => setActionDefaults("approve")}
                    className="!h-11 w-full !text-sm"
                  >
                    Approve
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="danger" disabled={decisionBusy} onClick={() => setActionDefaults("reject")} className="!h-11 !text-sm">
                      Reject
                    </Button>
                    <Button variant="ghost" disabled={decisionBusy} onClick={() => setActionDefaults("request_more_info")} className="!h-11 !text-sm">
                      Request info
                    </Button>
                  </div>
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

