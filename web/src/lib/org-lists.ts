"use client";
import { useEffect, useState } from "react";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

export type Supervisor = { name: string; email: string };

// Admin-managed Schools & Departments + the faculty (supervisor) list, for student/faculty forms.
export function useOrgLists(token: string) {
  const [schools, setSchools] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    const names = (a: unknown) => (Array.isArray(a) ? a.map((x) => String((x as { name?: string }).name ?? "")).filter(Boolean) : []);
    retryFetch(`${API_URL}/api/org/schools`, { headers: h }).then((r) => (r.ok ? r.json() : [])).then((d) => setSchools(names(d))).catch(() => {});
    retryFetch(`${API_URL}/api/org/departments`, { headers: h }).then((r) => (r.ok ? r.json() : [])).then((d) => setDepartments(names(d))).catch(() => {});
    retryFetch(`${API_URL}/api/org/supervisors`, { headers: h }).then((r) => (r.ok ? r.json() : [])).then((d) => setSupervisors(Array.isArray(d) ? d : [])).catch(() => {});
  }, [token]);
  return { schools, departments, supervisors };
}

// A supervisor is stored as "Name <email>" so the email travels with the request automatically.
export const supValue = (s: Supervisor) => (s.email ? `${s.name} <${s.email}>` : s.name);
