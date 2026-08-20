import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export class ClaudeUnavailableError extends Error {}

/**
 * Below the route's maxDuration (60s) on purpose: a slow call should surface as a
 * soft aiError the UI can render, not as a platform function kill with no body.
 */
const REQUEST_TIMEOUT_MS = 50_000;
const MAX_TOKENS = 16_000;

let client: Anthropic | undefined;

function anthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeUnavailableError("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });
  return client;
}

/**
 * Pure: pull the assistant's prose out of a response's content blocks.
 * Adaptive thinking is on by default, so responses interleave thinking blocks
 * with text — only the text blocks are the standup output.
 */
export function extractText(content: unknown[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } => {
      const b = block as { type?: unknown; text?: unknown } | null | undefined;
      return b?.type === "text" && typeof b.text === "string";
    })
    .map((block) => block.text)
    .join("")
    .trim();
}

/** Map SDK failures onto ClaudeUnavailableError so the route degrades softly. */
function asUnavailable(err: unknown): ClaudeUnavailableError | null {
  if (err instanceof ClaudeUnavailableError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new ClaudeUnavailableError("Anthropic API key rejected");
  if (err instanceof Anthropic.RateLimitError) return new ClaudeUnavailableError("Anthropic rate limit reached — try again shortly");
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ClaudeUnavailableError("Anthropic request timed out");
  if (err instanceof Anthropic.APIConnectionError) return new ClaudeUnavailableError("could not reach the Anthropic API");
  if (err instanceof Anthropic.APIError) return new ClaudeUnavailableError(`Anthropic API error ${err.status ?? ""}`.trim());
  return null;
}

/**
 * Ask Claude to phrase the standup. `imageBase64` is the raw base64 payload of a
 * PNG (no data: prefix) for the screenshot-to-items flow.
 * Throws ClaudeUnavailableError when the model is unreachable or declines.
 */
export async function generateText(prompt: string, model: string, imageBase64?: string): Promise<string> {
  const content: Anthropic.ContentBlockParam[] = imageBase64
    ? [
        { type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64 } },
        { type: "text", text: prompt },
      ]
    : [{ type: "text", text: prompt }];

  try {
    const response = await anthropic().messages.create({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content }],
    });

    // stop_reason before content: on a refusal, content can be empty and
    // indexing it would throw a 500 where the UI expects a soft aiError.
    if (response.stop_reason === "refusal") {
      throw new ClaudeUnavailableError("the model declined this request");
    }

    const text = extractText(response.content);
    if (!text) throw new ClaudeUnavailableError(`empty response (stop_reason: ${response.stop_reason})`);
    return text;
  } catch (err) {
    const unavailable = asUnavailable(err);
    if (unavailable) throw unavailable;
    throw err;
  }
}
