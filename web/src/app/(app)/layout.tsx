import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { ForcePasswordReset } from "@/components/force-password-reset";
import { PolicyConsent } from "@/components/policy-consent";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mustResetPassword) return <ForcePasswordReset token={session.apiToken ?? ""} />;

  // Require agreement to the current privacy policy before entering the app (proof of consent
  // is recorded per user). Fail open on any fetch error so a hiccup never locks people out.
  if (!session.user.superAdmin) {
    try {
      // 5s deadline so a slow /api/auth/me can never block the whole app from rendering
      // (we fail open on timeout/error below — no retry, this is on the render path).
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${session.apiToken ?? ""}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const me = (await res.json()) as { policyVersion?: string; acceptedPolicyVersion?: string };
        if (me.policyVersion && me.acceptedPolicyVersion !== me.policyVersion) {
          return <PolicyConsent token={session.apiToken ?? ""} name={session.user.name ?? undefined} />;
        }
      }
    } catch {
      /* fail open */
    }
  }

  return (
    <AppShell
      token={session.apiToken ?? ""}
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        plan: session.user.plan,
        superAdmin: session.user.superAdmin,
      }}
    >
      {children}
    </AppShell>
  );
}
