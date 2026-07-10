import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    /** GitHub OAuth access token, used server-side to call the GitHub API. */
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    /** Space-separated scopes GitHub granted, for diagnostics. */
    scope?: string;
  }
}
