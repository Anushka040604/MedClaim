export type PillTone = "neutral" | "info" | "success" | "warning" | "danger";

export function getStatusTone(status: string | null | undefined): PillTone {
  const s = String(status ?? "").toLowerCase().trim();
  if (!s) return "neutral";
  if (s === "decision") return "success";
  if (s === "more info requested") return "warning";
  if (s === "more info submitted") return "info";
  if (s === "under review" || s === "submitted") return "info";
  if (s === "rejected") return "danger";
  if (s === "approved") return "success";
  return "neutral";
}

export function getDecisionTone(decision: string | null | undefined): PillTone {
  const d = String(decision ?? "").toLowerCase().trim();
  if (!d || d === "pending") return "neutral";
  if (d === "approved") return "success";
  if (d === "rejected") return "danger";
  if (d === "request_more_info" || d === "more info") return "warning";
  return "neutral";
}

export function isProcessing(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase().trim();
  return s === "under review" || s === "more info submitted" || s === "submitted";
}
