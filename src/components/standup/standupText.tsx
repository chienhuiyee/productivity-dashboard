import type { ReactNode } from "react";

/** Strip stray markdown so the rendered view is always clean. */
function clean(s: string): string {
  return s
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^#+\s*/, "")
    .trim();
}

/**
 * Render standup / roll-up text as headers + bullets (not raw markdown). The model
 * is asked for plain text, but this also tidies any leftover `**`, `#`, or bullet
 * markers so what's shown always reads clean. Shared by the generate + history views.
 */
export function renderStandup(text: string): ReactNode {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="flex flex-col gap-1.5">
        {items.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-[0.5rem] h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bare = clean(line);
    if (/^(yesterday|today)\b/i.test(bare) && bare.length <= 16) {
      flush();
      blocks.push(
        <h3
          key={`h-${blocks.length}`}
          className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0"
        >
          {bare}
        </h3>,
      );
    } else if (/^[-*•]\s+/.test(line)) {
      bullets.push(clean(line.replace(/^[-*•]\s+/, "")));
    } else {
      flush();
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-sm leading-relaxed">
          {bare}
        </p>,
      );
    }
  }
  flush();
  return <div className="flex flex-col gap-1.5">{blocks}</div>;
}
