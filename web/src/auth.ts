import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { apiRequest } from "@/lib/api-base";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (creds) => {
        if (!creds?.email || !creds?.password) return null;
        const body = JSON.stringify({ email: creds.email, password: creds.password });
        // Retry transient API failures (cold start / deploy blip / network) so a
        // momentary hiccup never shows up as a false "invalid password". A real
        // 400/401 (wrong credentials) fails fast without retrying.
        let res: Response | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            res = await apiRequest("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            });
          } catch {
            res = null; // network/binding error → transient, retry
          }
          if (res && (res.status === 400 || res.status === 401)) return null; // genuine bad credentials
          if (res && res.ok) break;
          if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        if (!res || !res.ok) return null;
        const data = (await res.json()) as {
          token: string;
          user: { id: string; email: string; name: string; role: string; plan?: string; superAdmin?: boolean; mustResetPassword?: boolean };
        };
        // Returned object becomes the JWT `user` on first sign-in.
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          plan: data.user.plan,
          superAdmin: data.user.superAdmin,
          mustResetPassword: data.user.mustResetPassword,
          apiToken: data.token,
        };
      },
    }),
  ],
  callbacks: {
    // Protect matched routes; the public landing page ("/") is always allowed.
    authorized: ({ auth, request }) => {
      const p = request.nextUrl.pathname;
      if (p === "/" || p === "/contact") return true;
      return !!auth?.user;
    },
    jwt: ({ token, user }) => {
      if (user) {
        token.role = (user as { role: string }).role;
        token.plan = (user as { plan?: string }).plan;
        token.superAdmin = (user as { superAdmin?: boolean }).superAdmin;
        token.mustResetPassword = (user as { mustResetPassword?: boolean }).mustResetPassword;
        token.apiToken = (user as { apiToken: string }).apiToken;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.plan = token.plan as string | undefined;
        session.user.superAdmin = token.superAdmin as boolean | undefined;
        session.user.mustResetPassword = token.mustResetPassword as boolean | undefined;
      }
      session.apiToken = token.apiToken as string;
      return session;
    },
  },
});
