// Shared timetable/scheduling helpers: terms, session types, week labelling.
export type Term = { id: string; name: string; startDate?: string | null; weeks: number; workDays?: string | null; dayStart?: string | null; dayEnd?: string | null; _count?: { entries: number } };

// Working week / hours for the calendar — falls back to Mon–Fri, 07:00–21:00.
export function workDaysOf(term?: Term | null): number[] {
  try { const a = JSON.parse(term?.workDays ?? "[]"); if (Array.isArray(a) && a.length) return a.map(Number).filter((n) => n >= 0 && n <= 6).sort((x, y) => x - y); } catch { /* ignore */ }
  return [0, 1, 2, 3, 4];
}
export const dayStartOf = (term?: Term | null) => term?.dayStart || "07:00";
export const dayEndOf = (term?: Term | null) => term?.dayEnd || "21:00";

export const SESSION_TYPES = [
  { v: "MAKEUP", l: "Make-up lab" },
  { v: "LAB_EXAM", l: "Lab exam" },
  { v: "EXAM", l: "Exam" },
  { v: "EVENT", l: "Event" },
  { v: "VENDOR", l: "Vendor meeting" },
  { v: "SAFETY", l: "Safety induction" },
  { v: "MEETING", l: "Meeting" },
  { v: "OFFICE", l: "Office hours" },
  { v: "FREE", l: "Free session" },
  { v: "OTHER", l: "Other" },
];

export const KIND_LABEL: Record<string, string> = {
  EXPERIMENT: "Experiment",
  ...Object.fromEntries(SESSION_TYPES.map((s) => [s.v, s.l])),
};

export const KIND_COLOR: Record<string, string> = {
  EXPERIMENT: "#00C9A7", MAKEUP: "#0ea5e9", LAB_EXAM: "#f59e0b", EXAM: "#f59e0b",
  EVENT: "#8b5cf6", VENDOR: "#2563eb", SAFETY: "#10b981", MEETING: "#2563eb",
  OFFICE: "#a855f7", FREE: "#94a3b8", OTHER: "#64748b",
};

export const weeksOf = (term?: Term | null) => (term?.weeks && term.weeks > 0 ? term.weeks : 12);

export function weekLabel(n: number, term?: Term | null): string {
  if (!term?.startDate) return `Week ${n}`;
  const d = new Date(`${term.startDate}T00:00:00`);
  if (isNaN(d.getTime())) return `Week ${n}`;
  d.setDate(d.getDate() + (n - 1) * 7);
  return `Week ${n} (${d.toLocaleDateString("en-GB", { month: "short", day: "numeric" })})`;
}
