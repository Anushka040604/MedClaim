import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true
});

export type Role = "claimant" | "approver" | "admin";

export type Me = {
  id: number;
  email: string;
  full_name: string;
  phone?: string | null;
  role: Role;
};

export type Claim = {
  id: number;
  claim_id: string;
  patient_name: string;
  policy_number: string;
  hospital: string;
  doctor: string;
  diagnosis: string;
  treatment_date: string;
  claimed_amount: number;
  status: string;
  decision: string;
  approver_notes?: string | null;
  created_at: string;
  updated_at: string;
  documents: Array<{
    id: number;
    original_filename: string;
    content_type: string;
    document_type: string;
    download_url: string;
    created_at: string;
  }>;
};

export type ClaimHistory = {
  id: number;
  from_status?: string | null;
  to_status: string;
  message?: string | null;
  created_at: string;
};

export type ClaimDetail = Claim & {
  history: ClaimHistory[];
  ai_report_json?: string | null;
  fraud_probability?: number | null;
  anomaly_score?: number | null;
  risk_score?: number | null;
  risk_level?: string | null;
  fraud_flags?: Array<Record<string, unknown>> | null;
};

export async function login(payload: { email: string; password: string }) {
  const res = await api.post("/auth/login", payload);
  return res.data as Me;
}

export async function logout() {
  await api.post("/auth/logout");
}

export async function me() {
  const res = await api.get("/auth/me");
  return res.data as Me;
}

export async function createClaim(payload: {
  patient_name: string;
  policy_number: string;
  hospital: string;
  doctor: string;
  diagnosis: string;
  treatment_date: string;
  claimed_amount: number;
  files?: File[];
  document_types?: string[];
}) {
  const hasFiles = (payload.files?.length ?? 0) > 0;
  const res = hasFiles
    ? await api.post(
        "/claims",
        (() => {
          const form = new FormData();
          form.append("patient_name", payload.patient_name);
          form.append("policy_number", payload.policy_number);
          form.append("hospital", payload.hospital);
          form.append("doctor", payload.doctor);
          form.append("diagnosis", payload.diagnosis);
          form.append("treatment_date", payload.treatment_date);
          form.append("claimed_amount", String(payload.claimed_amount));
          (payload.files ?? []).forEach((f) => form.append("files", f));
          form.append("document_types_json", JSON.stringify(payload.document_types ?? []));
          return form;
        })(),
        { headers: { "Content-Type": "multipart/form-data" } }
      )
    : await api.post("/claims", {
        patient_name: payload.patient_name,
        policy_number: payload.policy_number,
        hospital: payload.hospital,
        doctor: payload.doctor,
        diagnosis: payload.diagnosis,
        treatment_date: payload.treatment_date,
        claimed_amount: payload.claimed_amount,
      });
  return res.data as Claim;
}

export async function listClaims() {
  const res = await api.get("/claims");
  return res.data as Claim[];
}

export async function deleteClaim(claimId: string) {
  await api.delete(`/claims/${claimId}`);
}

export async function getClaim(claimId: string) {
  const res = await api.get(`/claims/${claimId}`);
  return res.data as ClaimDetail;
}

export async function approverQueue() {
  const res = await api.get("/claims/queue/approver");
  return res.data as Claim[];
}

export async function uploadDocuments(args: {
  claimId: string;
  files: File[];
  documentTypes: string[];
}) {
  const form = new FormData();
  args.files.forEach((f) => form.append("files", f));
  form.append("document_types_json", JSON.stringify(args.documentTypes));
  const res = await api.post(`/claims/${args.claimId}/documents`, form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return res.data as Array<{
    id: number;
    original_filename: string;
    content_type: string;
    document_type: string;
    download_url: string;
    created_at: string;
  }>;
}

export async function takeDecision(args: {
  claimId: string;
  action: "approve" | "reject" | "request_more_info";
  notes?: string;
  message_to_claimant?: string;
}) {
  const res = await api.post(`/claims/${args.claimId}/decision`, args);
  return res.data as ClaimDetail;
}

export async function submitMoreInfo(args: { claimId: string; additional_info: string }) {
  const res = await api.post(`/claims/${args.claimId}/more-info`, args);
  return res.data as ClaimDetail;
}

