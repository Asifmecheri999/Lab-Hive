import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    apiToken?: string;
    user: {
      role?: string;
      plan?: string;
      superAdmin?: boolean;
      mustResetPassword?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    plan?: string;
    superAdmin?: boolean;
    mustResetPassword?: boolean;
    apiToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    plan?: string;
    superAdmin?: boolean;
    mustResetPassword?: boolean;
    apiToken?: string;
  }
}
