"use client";
// Small Origin UI–style primitives on Radix (the same base Origin UI components use).
import { Dialog as D, Tabs as T } from "radix-ui";
import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "outline" | "ghost" | "link" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink border border-accent hover:brightness-110",
  outline: "bg-panel text-ink border border-line hover:border-accent hover:text-accent",
  ghost: "text-ink hover:bg-soft border border-transparent",
  link: "text-accent hover:underline p-0! h-auto! border-0 font-medium",
  danger: "bg-panel text-high border border-line hover:border-high",
};

export function Button({ variant = "outline", size = "md", className, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap cursor-pointer transition disabled:opacity-55 disabled:cursor-not-allowed disabled:hover:brightness-100",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : size === "lg" ? "h-11 px-5 text-[15px]" : "h-9 px-3.5 text-sm",
        VARIANT[variant], className,
      )}
    />
  );
}

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section {...p} className={cx("rounded-xl border border-line bg-panel p-5 min-w-0", className)}>{children}</section>;
}

export function Check({ label, checked, onChange, id, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; id: string; hint?: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 text-sm cursor-pointer">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4.5 shrink-0 accent-accent" />
      <span>{label}{hint && <span className="block text-[12.5px] text-mute">{hint}</span>}</span>
    </label>
  );
}

export function NumberField({ id, label, value, onChange, min, max, step = 1, suffix }:
  { id: string; label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <span>{label}</span>
      <input id={id} type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(e.target.value === "" ? min : Number(e.target.value))}
        className="w-18 h-8 rounded-md border border-line bg-bg px-2" />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm placeholder:text-mute/80";

export function Dialog({ open, onOpenChange, title, description, children, wide }:
  { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <D.Content
          className={cx("fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-auto rounded-xl border border-line bg-panel p-5 shadow-xl",
            wide ? "max-w-3xl" : "max-w-lg")}
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <D.Title className="text-lg font-semibold">{title}</D.Title>
              {description ? <D.Description className="text-sm text-mute mt-0.5">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="size-8 grid place-items-center rounded-md hover:bg-soft cursor-pointer" aria-label="Close"><X size={18} /></D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Tabs({ value, onValueChange, tabs, className }:
  { value: string; onValueChange: (v: string) => void; tabs: { id: string; label: ReactNode; content: ReactNode }[]; className?: string }) {
  return (
    <T.Root value={value} onValueChange={onValueChange} className={className}>
      <T.List className="no-print flex overflow-x-auto border-b border-line -mx-5 -mt-5 mb-4 px-3" aria-label="Report sections">
        {tabs.map((t) => (
          <T.Trigger key={t.id} value={t.id}
            className="shrink-0 cursor-pointer border-b-2 border-transparent px-2.5 pt-3 pb-2.5 text-sm font-semibold text-mute data-[state=active]:border-accent data-[state=active]:text-accent">
            {t.label}
          </T.Trigger>
        ))}
      </T.List>
      {tabs.map((t) => <T.Content key={t.id} value={t.id} className="outline-none">{t.content}</T.Content>)}
    </T.Root>
  );
}

export function Logo({ className = "size-[30px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#fff" />
      <path d="M9 5h10l6 6v15a1.5 1.5 0 0 1-1.5 1.5h-14.5A1.5 1.5 0 0 1 7.5 26V6.5A1.5 1.5 0 0 1 9 5z" fill="#0078d4" />
      <path d="M19 5v6h6z" fill="#66b2ec" />
      <path d="M11.5 18l3 3 6-6.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
