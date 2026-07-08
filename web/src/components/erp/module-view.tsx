"use client";

import { ResourceManager, type ResourceConfig, type ActionDef } from "./resource-manager";

const LAB_WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
const SCHEDULERS = ["LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
const APPROVERS = ["LAB_MANAGER", "HEAD_OF_SCHOOL", "DEAN", "ADMIN"];
const FACULTY_APPROVE = ["FACULTY", "DEAN", "ADMIN"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const has = (role: string, list: string[]) => list.includes(role);
const r = (o: unknown) => o as Record<string, unknown>;

function inventory(role: string): ResourceConfig {
  return {
    title: "Inventory",
    apiPath: "/api/inventory",
    canWrite: has(role, LAB_WRITE),
    editable: has(role, LAB_WRITE),
    deletable: has(role, LAB_WRITE),
    columns: [
      { key: "name", label: "Name" },
      { key: "type", label: "Type", badge: true },
      { key: "category", label: "Category" },
      { key: "quantity", label: "Qty", render: (x) => `${x.quantity}${x.unit ? " " + x.unit : ""}${(x.quantity as number) <= (x.minQuantity as number) ? " ⚠ LOW" : ""}` },
      { key: "location", label: "Location" },
      { key: "lab", label: "Lab", render: (x) => (r(x.lab)?.name as string) ?? "—" },
    ],
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "type", label: "Type", type: "select", options: ["EQUIPMENT", "CONSUMABLE", "PPE", "TOOL"].map((v) => ({ value: v, label: v })), required: true },
      { name: "category", label: "Category", required: true },
      { name: "quantity", label: "Quantity", type: "number" },
      { name: "minQuantity", label: "Min quantity (low-stock)", type: "number" },
      { name: "unit", label: "Unit (pcs, ml…)" },
      { name: "location", label: "Location" },
      { name: "labId", label: "Lab", type: "select", optionsFrom: { apiPath: "/api/schedule/labs", labelKey: "name" } },
      { name: "serialNumber", label: "Serial number" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  };
}

function vendors(role: string): ResourceConfig {
  return {
    title: "Vendors",
    apiPath: "/api/vendors",
    canWrite: has(role, LAB_WRITE),
    editable: has(role, LAB_WRITE),
    deletable: has(role, LAB_WRITE),
    columns: [
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "country", label: "Country" },
      { key: "contactName", label: "Contact" },
      { key: "isApproved", label: "Approved", badge: true, render: (x) => (x.isApproved ? "Approved" : "Pending") },
    ],
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "contactName", label: "Contact name" },
      { name: "email", label: "Email" },
      { name: "phone", label: "Phone" },
      { name: "category", label: "Category" },
      { name: "country", label: "Country" },
      { name: "isApproved", label: "Approved vendor", type: "checkbox" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  };
}

function requests(role: string): ResourceConfig {
  return {
    title: "Service Requests",
    apiPath: "/api/requests",
    canWrite: true,
    editable: false,
    columns: [
      { key: "title", label: "Title" },
      { key: "type", label: "Type", badge: true },
      { key: "status", label: "Status", badge: true },
      { key: "material", label: "Material" },
      { key: "user", label: "Requested by", render: (x) => (r(x.user)?.name as string) ?? "—" },
    ],
    fields: [
      { name: "type", label: "Type", type: "select", options: ["THREE_D_PRINT", "LASER_CUT", "CNC", "SUPERVISED_SESSION", "EQUIPMENT_USE", "OTHER"].map((v) => ({ value: v, label: v.replace(/_/g, " ") })), required: true },
      { name: "title", label: "Title", required: true },
      { name: "description", label: "Description", type: "textarea", required: true },
      { name: "material", label: "Material" },
      { name: "quantity", label: "Quantity", type: "number" },
      { name: "fileUrl", label: "File URL (STL/DXF)", help: "Upload to file storage, paste the link" },
    ],
    actions: (row): ActionDef[] => {
      const acts: ActionDef[] = [];
      if (row.status === "PENDING" && has(role, FACULTY_APPROVE)) {
        acts.push({ label: "Approve", method: "POST" as const, path: (x: Record<string, unknown>) => `/api/requests/${x.id}/approve`, body: () => ({ comments: "Approved" }), variant: "primary" as const });
        acts.push({ label: "Reject", method: "POST" as const, path: (x: Record<string, unknown>) => `/api/requests/${x.id}/reject`, body: () => ({ comments: "Rejected" }), variant: "danger" as const });
      }
      if (has(role, LAB_WRITE) && ["APPROVED", "IN_PROGRESS"].includes(String(row.status))) {
        const next = row.status === "APPROVED" ? "IN_PROGRESS" : "COMPLETED";
        acts.push({ label: `Mark ${next.replace(/_/g, " ")}`, method: "PATCH" as const, path: (x: Record<string, unknown>) => `/api/requests/${x.id}/status`, body: () => ({ status: next }), variant: "ghost" as const });
      }
      return acts;
    },
  };
}

function procurement(role: string): ResourceConfig {
  return {
    title: "Procurement",
    apiPath: "/api/procurement",
    canWrite: has(role, LAB_WRITE),
    editable: has(role, LAB_WRITE),
    columns: [
      { key: "title", label: "Title" },
      { key: "budgetType", label: "Budget" },
      { key: "vendor", label: "Vendor", render: (x) => (r(x.vendor)?.name as string) ?? (x.supplier as string) ?? "—" },
      { key: "quotedAmount", label: "Amount", render: (x) => (x.quotedAmount != null ? `${x.quotedAmount} ${x.currency}` : "—") },
      { key: "status", label: "Status", badge: true },
    ],
    fields: [
      { name: "budgetType", label: "Budget type", type: "select", options: [{ value: "CAPEX", label: "CAPEX" }, { value: "OPEX", label: "OPEX" }], required: true },
      { name: "title", label: "Title", required: true },
      { name: "description", label: "Description", type: "textarea", required: true },
      { name: "vendorId", label: "Vendor", type: "select", optionsFrom: { apiPath: "/api/vendors", labelKey: "name" } },
      { name: "supplier", label: "Supplier (free text)" },
      { name: "quotedAmount", label: "Quoted amount", type: "number" },
      { name: "currency", label: "Currency", help: "Default AED" },
      { name: "invoiceUrl", label: "Invoice URL" },
      { name: "quotationUrl", label: "Quotation URL" },
    ],
    actions: (row): ActionDef[] => {
      const s = String(row.status);
      const acts: ActionDef[] = [];
      const set = (status: string, label: string, variant: "primary" | "ghost" | "danger") =>
        acts.push({ label, method: "PATCH" as const, path: (x: Record<string, unknown>) => `/api/procurement/${x.id}/status`, body: () => ({ status }), variant });
      if (s === "draft") set("submitted", "Submit", "primary");
      if (s === "submitted" && has(role, APPROVERS)) { set("approved", "Approve", "primary"); set("rejected", "Reject", "danger"); }
      if (s === "approved") set("ordered", "Mark ordered", "ghost");
      if (s === "ordered") set("delivered", "Mark delivered", "ghost");
      return acts;
    },
  };
}

function schedule(role: string): ResourceConfig {
  return {
    title: "Lab Schedule",
    apiPath: "/api/schedule/sessions",
    canWrite: has(role, SCHEDULERS),
    editable: false,
    deletable: has(role, SCHEDULERS),
    columns: [
      { key: "title", label: "Session" },
      { key: "lab", label: "Lab", render: (x) => (r(x.lab)?.name as string) ?? "—" },
      { key: "dayOfWeek", label: "Day", render: (x) => DAYS[x.dayOfWeek as number] ?? String(x.dayOfWeek) },
      { key: "startTime", label: "Start" },
      { key: "endTime", label: "End" },
      { key: "moduleCode", label: "Module" },
      { key: "facultyName", label: "Faculty" },
    ],
    fields: [
      { name: "labId", label: "Lab", type: "select", optionsFrom: { apiPath: "/api/schedule/labs", labelKey: "name" }, required: true },
      { name: "title", label: "Session title", required: true },
      { name: "moduleCode", label: "Module code" },
      { name: "facultyName", label: "Faculty" },
      { name: "group", label: "Group" },
      { name: "dayOfWeek", label: "Day", type: "select", options: DAYS.slice(0, 5).map((d, i) => ({ value: String(i), label: d })), required: true },
      { name: "startTime", label: "Start time", help: "HH:MM e.g. 09:00", required: true },
      { name: "endTime", label: "End time", help: "HH:MM e.g. 11:00", required: true },
    ],
    empty: "No sessions scheduled.",
  };
}

function docs(role: string): ResourceConfig {
  return {
    title: "Documentation",
    apiPath: "/api/docs",
    canWrite: has(role, LAB_WRITE),
    editable: false,
    deletable: has(role, LAB_WRITE),
    columns: [
      { key: "title", label: "Title" },
      { key: "category", label: "Category" },
      { key: "version", label: "Version" },
      { key: "tags", label: "Tags", render: (x) => (Array.isArray(x.tags) ? (x.tags as string[]).join(", ") : "—") },
      { key: "fileUrl", label: "Link", render: (x) => String(x.fileUrl ?? "—") },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "category", label: "Category", help: "sop, manual, form, policy", required: true },
      { name: "fileUrl", label: "File URL", required: true },
      { name: "version", label: "Version", help: "Default 1.0" },
    ],
  };
}

function users(role: string): ResourceConfig {
  return {
    title: "Users",
    apiPath: "/api/users",
    canWrite: role === "ADMIN",
    editable: false,
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "role", label: "Role", badge: true },
      { key: "department", label: "Department" },
    ],
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "email", label: "Email", required: true },
      { name: "password", label: "Password", required: true, createOnly: true },
      { name: "role", label: "Role", type: "select", options: ["STUDENT", "FACULTY", "LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "HEAD_OF_SCHOOL", "DEAN", "ADMIN"].map((v) => ({ value: v, label: v })) },
      { name: "department", label: "Department" },
      { name: "studentId", label: "Student ID" },
    ],
  };
}

function safetyDocs(role: string): ResourceConfig {
  return {
    title: "Safety Documents",
    apiPath: "/api/safety/documents",
    canWrite: has(role, LAB_WRITE),
    deletable: has(role, LAB_WRITE),
    columns: [
      { key: "title", label: "Title" },
      { key: "type", label: "Type", badge: true },
      { key: "equipment", label: "Equipment" },
      { key: "version", label: "Version" },
      { key: "fileUrl", label: "Link", render: (x) => String(x.fileUrl ?? "—") },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "type", label: "Type", help: "risk_assessment, sop, ppe_guide", required: true },
      { name: "fileUrl", label: "File URL", required: true },
      { name: "equipment", label: "Equipment" },
      { name: "version", label: "Version" },
    ],
  };
}

function ppe(role: string): ResourceConfig {
  return {
    title: "PPE Requests",
    apiPath: "/api/safety/ppe",
    canWrite: true,
    columns: [
      { key: "item", label: "Item" },
      { key: "quantity", label: "Qty" },
      { key: "reason", label: "Reason" },
      { key: "status", label: "Status", badge: true },
    ],
    fields: [
      { name: "item", label: "Item", required: true },
      { name: "quantity", label: "Quantity", type: "number", required: true },
      { name: "reason", label: "Reason", type: "textarea" },
    ],
    actions: (row) =>
      has(role, LAB_WRITE) && row.status === "pending"
        ? [
            { label: "Approve", method: "POST", path: (x) => `/api/safety/ppe/${x.id}/approve`, variant: "primary" },
            { label: "Reject", method: "POST", path: (x) => `/api/safety/ppe/${x.id}/reject`, variant: "danger" },
          ]
        : [],
  };
}

function maintSchedules(role: string): ResourceConfig {
  return {
    title: "Maintenance Schedules",
    apiPath: "/api/maintenance/schedules",
    canWrite: has(role, LAB_WRITE),
    columns: [
      { key: "title", label: "Task" },
      { key: "frequencyDays", label: "Every (days)" },
      { key: "nextDue", label: "Next due", render: (x) => new Date(String(x.nextDue)).toLocaleDateString() },
      { key: "assignedTo", label: "Assigned" },
      { key: "overdue", label: "Status", badge: true, render: (x) => (x.overdue ? "Overdue" : "On track") },
    ],
    fields: [
      { name: "itemId", label: "Equipment", type: "select", optionsFrom: { apiPath: "/api/inventory", labelKey: "name" }, required: true },
      { name: "title", label: "Task title", required: true },
      { name: "frequencyDays", label: "Frequency (days)", type: "number", required: true },
      { name: "nextDue", label: "Next due", help: "YYYY-MM-DD", required: true },
      { name: "assignedTo", label: "Assigned to" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  };
}

function maintLogs(role: string): ResourceConfig {
  return {
    title: "Maintenance Logs",
    apiPath: "/api/maintenance/logs",
    canWrite: has(role, LAB_WRITE),
    columns: [
      { key: "item", label: "Equipment", render: (x) => (r(x.item)?.name as string) ?? "—" },
      { key: "type", label: "Type", badge: true },
      { key: "description", label: "Description" },
      { key: "performedBy", label: "By" },
      { key: "cost", label: "Cost", render: (x) => (x.cost != null ? `${x.cost} AED` : "—") },
    ],
    fields: [
      { name: "itemId", label: "Equipment", type: "select", optionsFrom: { apiPath: "/api/inventory", labelKey: "name" }, required: true },
      { name: "type", label: "Type", type: "select", options: ["SCHEDULED", "CORRECTIVE", "INSPECTION"].map((v) => ({ value: v, label: v })), required: true },
      { name: "description", label: "Description", type: "textarea", required: true },
      { name: "performedBy", label: "Performed by" },
      { name: "cost", label: "Cost (AED)", type: "number" },
      { name: "nextDueDate", label: "Next due date", help: "YYYY-MM-DD" },
      { name: "fileUrl", label: "Report URL" },
    ],
  };
}

const SINGLE: Record<string, (role: string) => ResourceConfig> = {
  inventory, vendors, requests, procurement, schedule, docs, users,
};
const MULTI: Record<string, ((role: string) => ResourceConfig)[]> = {
  safety: [safetyDocs, ppe],
  maintenance: [maintSchedules, maintLogs],
};

export function ModuleView({ resource, token, role }: { resource: string; token: string; role: string }) {
  if (MULTI[resource]) {
    return (
      <div className="space-y-10">
        {MULTI[resource].map((fn, i) => (
          <ResourceManager key={i} token={token} config={fn(role)} />
        ))}
      </div>
    );
  }
  const fn = SINGLE[resource];
  if (!fn) return <p className="text-gray-500">Unknown module.</p>;
  return <ResourceManager token={token} config={fn(role)} />;
}
