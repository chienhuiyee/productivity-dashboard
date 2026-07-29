import { describe, expect, it } from "vitest";
import {
  isActionable,
  notificationHtmlUrl,
  notificationTier,
  parseNotification,
  reasonLabel,
  type RawNotification,
} from "./notifications";

const NOW = Date.parse("2026-01-15T00:00:00.000Z");

function makeRaw(overrides: Partial<RawNotification> = {}): RawNotification {
  return {
    id: "42",
    unread: true,
    reason: "review_requested",
    updated_at: "2026-01-14T00:00:00.000Z",
    subject: {
      title: "Add the widget",
      url: "https://api.github.com/repos/o/r/pulls/7",
      latest_comment_url: null,
      type: "PullRequest",
    },
    repository: { full_name: "o/r", html_url: "https://github.com/o/r" },
    ...overrides,
  };
}

describe("notificationHtmlUrl", () => {
  it("maps a PR API url to a browser url", () => {
    expect(notificationHtmlUrl("https://api.github.com/repos/o/r/pulls/7", "https://github.com/o/r")).toBe(
      "https://github.com/o/r/pull/7",
    );
  });

  it("maps an issue API url", () => {
    expect(notificationHtmlUrl("https://api.github.com/repos/o/r/issues/9", "https://github.com/o/r")).toBe(
      "https://github.com/o/r/issues/9",
    );
  });

  it("maps a commit API url (commits -> commit)", () => {
    expect(notificationHtmlUrl("https://api.github.com/repos/o/r/commits/abc123", "https://github.com/o/r")).toBe(
      "https://github.com/o/r/commit/abc123",
    );
  });

  it("passes through an already-browser url (e.g. Discussions)", () => {
    const html = "https://github.com/o/r/discussions/3";
    expect(notificationHtmlUrl(html, "https://github.com/o/r")).toBe(html);
  });

  it("falls back to the repo page for null or unmappable urls", () => {
    expect(notificationHtmlUrl(null, "https://github.com/o/r")).toBe("https://github.com/o/r");
    expect(notificationHtmlUrl("https://api.github.com/repos/o/r/releases/5", "https://github.com/o/r")).toBe(
      "https://github.com/o/r",
    );
  });
});

describe("reason classification", () => {
  it("humanizes known reasons and de-underscores unknown ones", () => {
    expect(reasonLabel("review_requested")).toBe("review requested");
    expect(reasonLabel("some_new_reason")).toBe("some new reason");
  });

  it("tiers reasons and marks act/involved as actionable", () => {
    expect(notificationTier("review_requested")).toBe("act");
    expect(notificationTier("author")).toBe("involved");
    expect(notificationTier("subscribed")).toBe("fyi");
    expect(isActionable("mention")).toBe(true);
    expect(isActionable("ci_activity")).toBe(true);
    expect(isActionable("subscribed")).toBe(false);
  });
});

describe("parseNotification", () => {
  it("normalizes a raw notification into a clickable, tiered item", () => {
    const item = parseNotification(makeRaw(), NOW);
    expect(item).not.toBeNull();
    expect(item?.repo).toBe("o/r");
    expect(item?.url).toBe("https://github.com/o/r/pull/7");
    expect(item?.reasonLabel).toBe("review requested");
    expect(item?.tier).toBe("act");
    expect(item?.unread).toBe(true);
    expect(item?.ageMs).toBe(24 * 60 * 60 * 1000);
  });

  it("drops a notification with no subject or repository", () => {
    expect(parseNotification(makeRaw({ subject: null }), NOW)).toBeNull();
    expect(parseNotification(makeRaw({ repository: null }), NOW)).toBeNull();
  });

  it("links to the repo page when the subject url is missing", () => {
    const item = parseNotification(
      makeRaw({ subject: { title: "CI failed", url: null, latest_comment_url: null, type: "CheckSuite" } }),
      NOW,
    );
    expect(item?.url).toBe("https://github.com/o/r");
    expect(item?.subjectType).toBe("CheckSuite");
  });
});
