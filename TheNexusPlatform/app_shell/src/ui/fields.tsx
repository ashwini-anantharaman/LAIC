import type { ReactNode } from "react";

/** Dark-studio form primitives shared across the editor tabs. */

export function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-2.5 mt-6 text-[9px] font-semibold uppercase tracking-[0.18em] first:mt-0"
      style={{ color: "rgba(255,255,255,0.22)" }}
    >
      {children}
    </p>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.28)" }}>
      {children}
    </p>
  );
}

const inputBase =
  "w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors";
const inputStyle = {
  backgroundColor: "#191921",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "rgba(224,224,240,0.85)",
} as const;

function focusRing(on: boolean) {
  return (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = on ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)";
  };
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={focusRing(true)}
      onBlur={focusRing(false)}
      className={`${inputBase} ${mono ? "font-mono text-xs" : ""}`}
      style={inputStyle}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={focusRing(true)}
      onBlur={focusRing(false)}
      className={`${inputBase} resize-none`}
      style={inputStyle}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full appearance-none rounded-lg px-2.5 py-2 text-xs outline-none"
      style={{ ...inputStyle, color: "rgba(224,224,240,0.7)" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ backgroundColor: "#191921" }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  // Layout is inline flexbox on purpose: the knob sits INSIDE the track via
  // justify-content, so it can never overlap the label regardless of how the
  // utility classes compile.
  return (
    <button type="button" onClick={() => onChange(!checked)} className="group flex cursor-pointer items-center" style={{ gap: 10 }}>
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: checked ? "flex-end" : "flex-start",
          width: 34,
          height: 19,
          padding: 2,
          borderRadius: 999,
          flexShrink: 0,
          boxSizing: "border-box",
          backgroundColor: checked ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.09)",
          border: "1px solid rgba(255,255,255,0.08)",
          transition: "background-color 150ms ease",
        }}
      >
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: 999,
            backgroundColor: "#ffffff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
          }}
        />
      </span>
      <span className="text-xs transition-colors" style={{ color: checked ? "rgba(224,224,240,0.72)" : "rgba(224,224,240,0.4)" }}>
        {label}
      </span>
    </button>
  );
}

/** A framed row used for repeatable items (roles, questions, tiles). */
export function Row({ children }: { children: ReactNode }) {
  return (
    <div
      className="space-y-2 rounded-xl p-3"
      style={{ backgroundColor: "#191921", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {children}
    </div>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[10px]"
      style={{ border: "1px dashed rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.32)" }}
    >
      + {children}
    </button>
  );
}

export function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-xs transition-colors hover:bg-white/10"
      style={{ color: "rgba(255,255,255,0.35)" }}
    >
      {children}
    </button>
  );
}
