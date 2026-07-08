import { auth } from "@/auth";
import { apiRequest } from "@/lib/api-base";

// Server-side fetch to the API attaching the logged-in user's API token.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await auth();
  const res = await apiRequest(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.apiToken ? { Authorization: `Bearer ${session.apiToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
