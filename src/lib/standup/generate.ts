import "server-only";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

export class ClaudeUnavailableError extends Error {}

/**
 * Pure: the headless CLI args. Deliberately NOT `--bare`: in current Claude Code,
 * bare mode ignores CLAUDE_CODE_OAUTH_TOKEN and reports "Not logged in", so we use
 * plain `-p` (which honors the subscription token). For images we only enable the
 * Read tool — the path is referenced in the prompt, NOT passed as a positional arg
 * (a bare positional image path is ignored by `claude -p`, which reads its prompt
 * from stdin).
 */
export function buildClaudeArgs(model: string, imagePath?: string): string[] {
  const args = ["-p", "--output-format", "json", "--model", model];
  if (imagePath) args.push("--allowedTools", "Read");
  return args;
}

/** Append the "read this screenshot" instruction so Claude opens the image via its Read tool. */
function withImage(prompt: string, imagePath?: string): string {
  if (!imagePath) return prompt;
  return `${prompt}\n\nThe screenshot to analyze is saved at this exact path — use the Read tool to open it, then follow the instructions above:\n${imagePath}`;
}

/**
 * Run Claude Code headless on the user's Max subscription. Prompt goes on stdin
 * (no shell interpolation). Returns the `.result` text. Throws
 * ClaudeUnavailableError if the CLI is missing or not authenticated.
 */
export function runClaude(prompt: string, model: string, imagePath?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY; // force subscription auth via CLAUDE_CODE_OAUTH_TOKEN
    // Run from a neutral cwd so it doesn't load this project's CLAUDE.md / local
    // config into the summarization context.
    const child = spawn("claude", buildClaudeArgs(model, imagePath), { env, cwd: tmpdir() });
    let out = "";
    let err = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGKILL");
        reject(new ClaudeUnavailableError("claude timed out"));
      });
    }, 120_000);
    child.on("error", (e) => finish(() => reject(new ClaudeUnavailableError(`Claude Code not runnable: ${e.message}`))));
    child.stdin.on("error", () => {}); // ignore EPIPE if claude exits before reading stdin (close/error handlers surface it)
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) =>
      finish(() => {
        if (code !== 0) return reject(new ClaudeUnavailableError(err.slice(0, 300) || `claude exited ${code}`));
        try {
          const parsed = JSON.parse(out);
          // `claude -p` exits 0 even for "Not logged in" / API errors, flagging them
          // via is_error — surface those as unavailable, not as standup text.
          if (parsed.is_error) {
            reject(new ClaudeUnavailableError(String(parsed.result ?? "claude returned an error")));
          } else {
            resolve(parsed.result ?? "");
          }
        } catch {
          reject(new ClaudeUnavailableError("could not parse claude output"));
        }
      }),
    );
    child.stdin.write(withImage(prompt, imagePath));
    child.stdin.end();
  });
}
