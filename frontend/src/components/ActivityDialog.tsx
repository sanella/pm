import { useEffect, useState } from "react";
import { listActivity, type ActivityEntry } from "@/lib/api";
import { formatTimestamp } from "@/lib/kanban";

type ActivityDialogProps = {
  boardId: number;
  onClose: () => void;
};

export const ActivityDialog = ({ boardId, onClose }: ActivityDialogProps) => {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listActivity(boardId)
      .then(setEntries)
      .catch(() => setError("Could not load the activity."));
  }, [boardId]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(3,33,71,0.35)] px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-title"
        className="flex max-h-[80vh] w-full max-w-lg flex-col gap-5 rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="activity-title" className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Activity
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
            {error}
          </p>
        )}
        {entries && entries.length === 0 && (
          <p className="text-sm text-[var(--gray-text)]">Nothing has happened on this board yet.</p>
        )}
        {entries && entries.length > 0 && (
          <ol aria-label="Recent activity" className="space-y-3 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="text-sm leading-6 text-[var(--navy-dark)]">
                <span className="font-semibold">{entry.author ?? "Deleted user"}</span> {entry.message}
                <span className="block text-xs text-[var(--gray-text)]">{formatTimestamp(entry.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};
