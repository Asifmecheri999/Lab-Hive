"use client";

import { useEffect } from "react";

// Oracle-style record window: title bar, body, footer actions. Closes on Esc / backdrop.
export function Window({
  title,
  subtitle,
  onClose,
  footer,
  children,
  width = "max-w-3xl",
  tall = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  tall?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10 backdrop-blur-sm">
      <div className={`w-full ${width} rounded-lg bg-white shadow-2xl ring-1 ring-black/5`}>
        {/* Title bar */}
        <div className="flex items-center justify-between rounded-t-lg bg-[#0A1628] px-4 py-3 text-white">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-gray-300">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-300 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* Body */}
        <div className={`${tall ? "min-h-[65vh] " : ""}max-h-[80vh] overflow-y-auto px-5 py-4`}>{children}</div>
        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-[#00C9A7] text-[#0A1628] hover:brightness-95",
    ghost: "border border-gray-300 text-gray-700 hover:bg-gray-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}
