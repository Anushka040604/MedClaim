import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadialBarChart,
  RadialBar,
} from "recharts";

const RISK_COLORS = {
  low: "#0d9488",
  medium: "#d97706",
  high: "#dc2626",
};

function getRiskColor(score: number): string {
  if (score <= 33) return RISK_COLORS.low;
  if (score <= 66) return RISK_COLORS.medium;
  return RISK_COLORS.high;
}

/** Semi-circle gauge using Recharts RadialBar for a more “dashboard” look */
export function FraudRiskRadialGauge({ score, riskLevel }: { score: number; riskLevel?: string }) {
  const clamped = Math.min(100, Math.max(0, Number(score)));
  const color = getRiskColor(clamped);
  const data = [{ name: "Risk", value: clamped, fill: color }];
  const level = riskLevel ?? "—";

  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md flex flex-col min-w-0 overflow-hidden">
      <div className="mb-3 flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Fraud risk</span>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm shrink-0"
          style={{ backgroundColor: color }}
        >
          {level}
        </span>
      </div>
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className="h-[88px] w-[140px] overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="70%"
              innerRadius="50%"
              outerRadius="90%"
              barSize={10}
              data={data}
              startAngle={180}
              endAngle={0}
            >
              <RadialBar background dataKey="value" cornerRadius={6} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>
            {clamped}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Score</span>
        </div>
      </div>
    </div>
  );
}

/** Policy compliance: prominent status badge + donut */
export function PolicyComplianceDonut({
  compliant,
}: {
  compliant: boolean | null | undefined;
}) {
  const data = [
    { name: "Compliant", value: compliant === true ? 1 : 0, color: "#059669" },
    { name: "Not compliant", value: compliant === false ? 1 : 0, color: "#d97706" },
    { name: "Unknown", value: compliant == null ? 1 : 0, color: "#94a3b8" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;

  const status =
    compliant === true
      ? { label: "Compliant", className: "bg-emerald-500 text-white" }
      : compliant === false
        ? { label: "Not compliant", className: "bg-amber-500 text-white" }
        : { label: "Unknown", className: "bg-neutral-400 text-white" };

  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md flex flex-col min-w-0 overflow-hidden">
      <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-500 shrink-0">
        Policy compliance
      </div>
      <div className="flex flex-row items-center justify-between gap-4 shrink-0 overflow-hidden">
        <div className="h-[80px] w-[80px] shrink-0 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={22}
                outerRadius={32}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                formatter={() => null}
                content={({ payload }: { payload?: Array<{ name?: string }> }) =>
                  payload?.[0] ? (
                    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-lg">
                      {payload[0].name}
                    </div>
                  ) : null
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <span className={`rounded-xl px-3 py-2 text-sm font-bold shadow-sm whitespace-nowrap shrink-0 ${status.className}`}>
          {status.label}
        </span>
      </div>
    </div>
  );
}

/** Documents processed by type – bar chart */
export function DocumentsByTypeBar({
  documents,
}: {
  documents: Array<{ document_type?: string; original_filename?: string }>;
}) {
  const typeCounts: Record<string, number> = {};
  for (const d of documents) {
    const t = d.document_type || "Other";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const data = Object.entries(typeCounts).map(([name, count]) => ({ name, count }));

  if (data.length === 0) return null;

  const COLORS = ["#0d9488", "#0f766e", "#14b8a6", "#2dd4bf", "#5eead4"];

  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md min-w-0">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Documents by type
      </div>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "rgb(240 253 250 / 0.5)" }}
              contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0" }}
              formatter={(value: number) => [value, "Count"]}
              labelFormatter={(label: unknown) => `Type: ${String(label)}`}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Citation sources as a small horizontal bar (count per source) */
export function CitationsBar({ citations }: { citations: Array<{ id?: string; source?: string }> }) {
  const sourceCounts: Record<string, number> = {};
  for (const c of citations) {
    const s = (c.source || c.id || "Unknown").toString();
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  }
  const data = Object.entries(sourceCounts).map(([name, count]) => ({ name, count }));

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-600">
        Citations by source
      </div>
      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} hide />
            <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ borderRadius: "6px", fontSize: "12px" }}
              formatter={(value: number) => [value, "Mentions"]}
            />
            <Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
