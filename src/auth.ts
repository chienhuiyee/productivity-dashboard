import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { isAllowedLogin } from "@/lib/auth/allowlist";

/**
 * NextAuth v5 (Auth.js) config for a single-user, localhost GitHub dashboard.
 *
 * Uses a *classic* GitHub OAuth App (tokens don't expire -> no refresh handling).
 * Scope `repo` is required to read private repos and their Actions / check-suites;
 * `read:org` helps resolve org-owned repos and SSO. The OAuth access token is
 * captured into the JWT and surfaced on the session for server-side API calls.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: "read:user repo read:org" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // The deployed app is on a public URL, so the OAuth flow would otherwise
    // accept any GitHub account. Fails closed if ALLOWED_GITHUB_LOGIN is unset.
    async signIn({ profile }) {
      return isAllowedLogin(profile?.login, process.env.ALLOWED_GITHUB_LOGIN);
    },
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.scope = account.scope;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
});
