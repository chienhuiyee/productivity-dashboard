import { describe, expect, it } from "vitest";
import { isAllowedLogin } from "./allowlist";

describe("isAllowedLogin", () => {
  it("allows the configured login", () => {
    expect(isAllowedLogin("octocat", "octocat")).toBe(true);
  });

  it("ignores case, since GitHub logins are case-insensitive", () => {
    expect(isAllowedLogin("OctoCat", "octocat")).toBe(true);
  });

  it("tolerates surrounding whitespace in the env var", () => {
    expect(isAllowedLogin("octocat", "  octocat  ")).toBe(true);
  });

  it("rejects a different login", () => {
    expect(isAllowedLogin("someone-else", "octocat")).toBe(false);
  });

  it("fails closed when the allowlist is unset", () => {
    expect(isAllowedLogin("octocat", undefined)).toBe(false);
  });

  it("fails closed when the allowlist is empty or blank", () => {
    expect(isAllowedLogin("octocat", "")).toBe(false);
    expect(isAllowedLogin("octocat", "   ")).toBe(false);
  });

  it("rejects a missing or non-string login", () => {
    expect(isAllowedLogin(undefined, "octocat")).toBe(false);
    expect(isAllowedLogin(42, "octocat")).toBe(false);
  });

  it("rejects a login that merely contains the allowed name", () => {
    expect(isAllowedLogin("not-octocat", "octocat")).toBe(false);
    expect(isAllowedLogin("octocat-evil", "octocat")).toBe(false);
  });
});
