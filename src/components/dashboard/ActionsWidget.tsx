import { CircleCheck } from "lucide-react";
import type { ActionFailure } from "@/lib/github/types";
import { CopyButton } from "@/components/ui/CopyButton";
import { RelativeTime } from "@/components/ui/RelativeTime";

export function ActionsWidget({ actions }: { actions: ActionFailure[] }) {
  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-10 text-center">
        <CircleCheck className="h-5 w-5 text-muted" strokeWidth={1.75} aria-hidden />
        <p className="text-sm text-muted">Every monitored main branch is passing.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {actions.map((a) => {
        const href = a.runUrl ?? a.repoUrl;
        return (
          <li key={a.repo} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <a href={href} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {a.repo}
              </a>
              <p className="mt-0.5 text-sm text-muted">
                {a.workflowName ? `${a.workflowName} · ` : "CI · "}
                {a.defaultBranch} · failing for{" "}
                <RelativeTime
                  iso={a.failingSince}
                  addSuffix={false}
                  className="font-medium text-red-600 dark:text-red-400"
                />
              </p>
            </div>
            <CopyButton value={href} />
          </li>
        );
      })}
    </ul>
  );
}
