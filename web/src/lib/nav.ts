// Sidebar navigation config. `roles` = who can SEE the link (undefined = everyone logged in).
// `requiresApprover` = only users ticked as an approver in Users see it (regardless of role).
export type NavLink = { label: string; href: string; roles?: string[]; requiresApprover?: boolean };
export type NavSection = { heading?: string; items: NavLink[] };

const LAB_TEAM = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
const LAB_TEAM_PLUS = [...LAB_TEAM, "HEAD_OF_SCHOOL", "DEAN"];
// Everyone except students (students get a minimal portal: requests + see their own).
const NON_STUDENT = [...LAB_TEAM_PLUS, "FACULTY"];

// Grouped sidebar. A section with no `heading` renders its items as standalone links;
// a section with a `heading` renders a collapsible group (+/−).
export const NAV: NavSection[] = [
  { items: [{ label: "Dashboard", href: "/dashboard" }] },
  {
    heading: "Scheduling",
    items: [
      { label: "Experiments", href: "/experiments", roles: LAB_TEAM_PLUS },
      { label: "Weekly Schedule", href: "/schedule", roles: LAB_TEAM_PLUS },
      { label: "Semester Plan", href: "/timetable", roles: LAB_TEAM_PLUS },
    ],
  },
  {
    heading: "Requests & Issuances",
    items: [
      { label: "Requests", href: "/requests" },
      { label: "Issuances", href: "/issuances" },
      { label: "Activities", href: "/activities" },
    ],
  },
  {
    heading: "Lab operations",
    items: [
      { label: "Facilities", href: "/facilities", roles: LAB_TEAM_PLUS },
      { label: "Inventory", href: "/inventory", roles: NON_STUDENT },
      { label: "Maintenance", href: "/maintenance", roles: LAB_TEAM },
      { label: "Procurement", href: "/procurement", roles: NON_STUDENT },
      { label: "Approvals", href: "/approvals", requiresApprover: true },
      { label: "Lab Finance", href: "/finance", roles: LAB_TEAM_PLUS },
      { label: "Document Hub", href: "/safety" },
    ],
  },
];

// Account menu (top-right) — settings & admin.
export const ACCOUNT_NAV: NavLink[] = [
  { label: "Getting Started", href: "/getting-started", roles: LAB_TEAM_PLUS },
  { label: "Users", href: "/users", roles: ["ADMIN"] },
  { label: "Organisation", href: "/organisation", roles: ["ADMIN"] },
  { label: "Plan details", href: "/plan" },
  { label: "Report an issue", href: "/support" },
  { label: "Privacy", href: "/privacy" },
];

const allowed = (role: string | undefined, isApprover: boolean, item: NavLink) => {
  if (item.requiresApprover && !isApprover) return false;
  return !item.roles || (!!role && item.roles.includes(role));
};

export function visibleSections(role?: string, isApprover = false): NavSection[] {
  return NAV
    .map((s) => ({ ...s, items: s.items.filter((i) => allowed(role, isApprover, i)) }))
    .filter((s) => s.items.length > 0);
}

export function visibleAccount(role?: string): NavLink[] {
  return ACCOUNT_NAV.filter((i) => allowed(role, false, i));
}
