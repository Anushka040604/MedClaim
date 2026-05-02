import React from "react";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  hover,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-primary-100/60 bg-gradient-card p-5 shadow-card sm:p-6 transition-all duration-200",
        hover &&
          "hover:-translate-y-0.5 hover:shadow-card-hover hover:border-primary-200/60 active:translate-y-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
  }
) {
  const { variant = "primary", size = "md", className = "", ...rest } = props;
  const base =
    "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
  const sizes = size === "sm" ? "h-9 px-3 text-sm" : "h-10 px-4 text-sm";
  const styles =
    variant === "primary"
      ? "bg-gradient-to-br from-primary-600 to-primary-700 text-white shadow-md hover:from-primary-700 hover:to-primary-800 hover:shadow-lg focus:ring-primary-400/50"
      : variant === "secondary"
        ? "border border-primary-200 bg-white/70 text-primary-800 shadow-sm hover:bg-primary-50 hover:border-primary-300 focus:ring-primary-400/30"
        : variant === "danger"
          ? "border border-red-200 bg-white/70 text-red-700 shadow-sm hover:bg-red-50 focus:ring-red-400/40"
          : "text-neutral-700 hover:bg-primary-50 hover:text-primary-900 focus:ring-primary-400/30";
  return <button className={cx(base, sizes, styles, className)} {...rest} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={cx(
        "h-10 w-full rounded-xl border border-neutral-200 bg-white/90 px-3 text-sm text-neutral-900 outline-none transition shadow-input",
        "placeholder:text-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-neutral-50 disabled:text-neutral-500",
        className
      )}
      {...rest}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      className={cx(
        "min-h-[88px] w-full resize-y rounded-xl border border-neutral-200 bg-white/90 px-3 py-2 text-sm text-neutral-900 outline-none transition shadow-input",
        "placeholder:text-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-neutral-50 disabled:text-neutral-500",
        className
      )}
      {...rest}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">
      {children}
    </label>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  const styles =
    tone === "success"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : tone === "info"
        ? "bg-primary-50 text-primary-800 border-primary-200"
        : tone === "warning"
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : tone === "danger"
            ? "bg-red-50 text-red-800 border-red-200"
            : "bg-neutral-100 text-neutral-700 border-neutral-200";
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        styles
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary-200 bg-gradient-to-b from-primary-50/60 to-white py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-600 mb-3">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-neutral-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Small stat for dashboards: label + value */
export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
      {sub != null && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

/** Auto-dismiss success message */
export function SuccessToast({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm flex items-center gap-2">
      <svg className="h-5 w-5 shrink-0 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      {message}
    </div>
  );
}
