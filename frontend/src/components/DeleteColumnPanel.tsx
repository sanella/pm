import { useState } from "react";
import type { Column } from "@/lib/kanban";

type DeleteColumnPanelProps = {
  column: Column;
  otherColumns: Column[];
  onConfirm: (moveCardsTo: string | null) => void;
  onCancel: () => void;
};

// Asks what happens to the column's cards before deleting it.
export const DeleteColumnPanel = ({
  column,
  otherColumns,
  onConfirm,
  onCancel,
}: DeleteColumnPanelProps) => {
  const count = column.cardIds.length;
  // "" means delete the cards.
  const [target, setTarget] = useState(otherColumns[0]?.id ?? "");

  return (
    <div
      role="group"
      aria-label={`Delete column ${column.title}`}
      className="mt-3 space-y-3 rounded-2xl border border-[var(--secondary-purple)]/30 bg-[var(--surface)] p-3 text-sm text-[var(--navy-dark)]"
    >
      {count === 0 ? (
        <p>Delete this empty column?</p>
      ) : (
        <label className="block space-y-2">
          <span>
            {count} {count === 1 ? "card" : "cards"} in this column:
          </span>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            aria-label="What happens to the cards"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
          >
            {otherColumns.map((other) => (
              <option key={other.id} value={other.id}>
                Move to {other.title}
              </option>
            ))}
            <option value="">Delete the cards</option>
          </select>
        </label>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onConfirm(count === 0 ? null : target || null)}
          className="rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Delete column
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
