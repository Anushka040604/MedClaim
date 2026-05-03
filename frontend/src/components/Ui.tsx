import React from "react";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

const controlBase =
  "w-full rounded-2xl border border-neutral-200/80 bg-white/90 px-3 text-sm text-neutral-900 outline-none transition shadow-input " +
  "placeholder:text-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-neutral-50 disabled:text-neutral-500";

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
        "rounded-3xl border border-neutral-200/70 bg-gradient-card p-5 shadow-card sm:p-6 transition-all duration-200",
        hover &&
          "hover:-translate-y-0.5 hover:shadow-card-hover hover:border-primary-200/60 active:translate-y-0",
        className
      )}
    >
      {children}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const { variant = "primary", size = "md", className = "", ...rest } = props;
  const base =
    "inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition active:translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
  const sizes = size === "sm" ? "h-9 px-3 text-sm" : "h-10 px-4 text-sm";
  const styles =
    variant === "primary"
      ? "bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 text-white shadow-md hover:shadow-lg hover:saturate-110 focus:ring-primary-400/50"
      : variant === "secondary"
        ? "border border-neutral-200 bg-white/80 text-neutral-800 shadow-sm hover:bg-primary-50/60 hover:border-primary-200 focus:ring-primary-400/30"
        : variant === "danger"
          ? "border border-red-200 bg-white/70 text-red-700 shadow-sm hover:bg-red-50 focus:ring-red-400/40"
          : "text-neutral-700 hover:bg-primary-50/70 hover:text-primary-900 focus:ring-primary-400/30";
  return <button ref={ref} className={cx(base, sizes, styles, className)} {...rest} />;
});

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={cx(
        "h-10",
        controlBase,
        className
      )}
      {...rest}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <div className="relative">
      <select
        className={cx(
          "h-10 appearance-none pr-10",
          controlBase,
          "focus:ring-primary-500/20",
          className
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

export function FileInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string }
) {
  const { className = "", hint, ...rest } = props;
  return (
    <div className={cx("space-y-1.5", className)}>
      <input
        type="file"
        className={cx(
          "block w-full text-sm text-neutral-600",
          "file:mr-3 file:rounded-2xl file:border-0 file:bg-gradient-to-br file:from-primary-600 file:via-primary-500 file:to-primary-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white",
          "hover:file:saturate-110 file:shadow-sm"
        )}
        {...rest}
      />
      {hint ? <p className="text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      className={cx(
        "min-h-[88px] w-full resize-y py-2",
        controlBase,
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
  pulse = false,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  pulse?: boolean;
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
  const dotColor =
    tone === "success" ? "bg-emerald-500" :
    tone === "info" ? "bg-primary-500" :
    tone === "warning" ? "bg-amber-500" :
    tone === "danger" ? "bg-red-500" :
    "bg-neutral-400";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        styles
      )}
    >
      {pulse ? (
        <span className="relative flex h-2 w-2">
          <span className={cx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", dotColor)} />
          <span className={cx("relative inline-flex h-2 w-2 rounded-full", dotColor)} />
        </span>
      ) : null}
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
    <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary-200 bg-gradient-to-b from-primary-50/70 to-white py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 mb-3 shadow-sm ring-1 ring-primary-200/60">
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
    <div className="rounded-3xl border border-neutral-200/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-200/50">
            {icon}
          </span>
        ) : null}
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
      {sub != null && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

/** Skeleton placeholder for loading states */
export function Skeleton({
  variant = "text",
  className,
  width,
  height,
}: {
  variant?: "text" | "card" | "list-item" | "stat" | "circle";
  className?: string;
  width?: string;
  height?: string;
}) {
  const base = "skeleton-shimmer rounded-md";
  const styles =
    variant === "card"
      ? "h-32 w-full rounded-3xl"
      : variant === "list-item"
        ? "h-16 w-full rounded-xl"
        : variant === "stat"
          ? "h-20 w-full rounded-3xl"
          : variant === "circle"
            ? "h-10 w-10 rounded-full"
            : "h-4 w-full rounded";
  return (
    <div
      className={cx(base, styles, className)}
      style={{ width, height }}
      aria-hidden
    />
  );
}

export function SkeletonStatRow({ count = 3 }: { count?: number }) {
  return (
    <div className={cx("grid gap-3", count === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="stat" />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="list-item" />
      ))}
    </div>
  );
}

/** Auto-dismiss success message (legacy inline) */
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

/* ────────────────────────────────────────────────────────────────────────────
   Toast system: fixed top-right container + useToast hook
   ──────────────────────────────────────────────────────────────────────────── */

type ToastVariant = "success" | "error" | "info";
type Toast = { id: string; message: string; variant: ToastVariant };

type ToastContextValue = {
  toasts: Toast[];
  show: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((cur) => [...cur, { id, message, variant }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const value = React.useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    return {
      show: (_msg: string, _variant?: ToastVariant) => {},
      dismiss: (_id: string) => {},
      toasts: [] as Toast[],
    };
  }
  return ctx;
}

function ToastContainer() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return null;
  const { toasts, dismiss } = ctx;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-end gap-2 px-4 py-4 sm:px-6 sm:py-6">
      <div className="mt-2 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const styles =
    toast.variant === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : toast.variant === "error"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-primary-200 bg-primary-50 text-primary-900";
  const iconColor =
    toast.variant === "success" ? "text-emerald-600" :
    toast.variant === "error" ? "text-red-600" :
    "text-primary-600";
  const iconPath =
    toast.variant === "success"
      ? "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      : toast.variant === "error"
        ? "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        : "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z";
  return (
    <div
      role="status"
      className={cx(
        "pointer-events-auto flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-medium shadow-card-hover backdrop-blur",
        styles
      )}
    >
      <svg className={cx("h-5 w-5 shrink-0 mt-0.5", iconColor)} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d={iconPath} clipRule="evenodd" />
      </svg>
      <span className="min-w-0 flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1 text-current/70 hover:bg-black/5 transition"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Confirm dialog (modal). ESC to close, click backdrop to close, focus trap.
   ──────────────────────────────────────────────────────────────────────────── */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  busy?: boolean;
}) {
  const confirmRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => confirmRef.current?.focus(), 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
        onClick={() => { if (!busy) onClose(); }}
      />
      <div className="relative w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-card-hover">
        <h3 id="confirm-title" className="text-lg font-bold text-neutral-900">
          {title}
        </h3>
        {description ? (
          <div className="mt-2 text-sm text-neutral-600">{description}</div>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef as any}
            variant={confirmVariant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
