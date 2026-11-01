import clsx from "clsx";
import { formatDueDate, isOverdue, PRIORITY_LABELS, type Card } from "@/lib/kanban";

const priorityClass = {
  low: "bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]",
  medium: "bg-[var(--accent-yellow)]/20 text-[var(--navy-dark)]",
  high: "bg-[var(--secondary-purple)]/10 text-[var(--secondary-purple)]",
};

// Priority, due date, checklist progress and labels of a card; nothing when none are set.
export const CardMeta = ({ card }: { card: Card }) => {
  if (
    card.priority === "none" &&
    !card.dueDate &&
    card.labels.length === 0 &&
    card.checklist.length === 0
  ) {
    return null;
  }
  const overdue = isOverdue(card.dueDate);
  const done = card.checklist.filter((item) => item.done).length;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      {card.priority !== "none" && (
        <span className={clsx("rounded-full px-2 py-0.5", priorityClass[card.priority])}>
          {PRIORITY_LABELS[card.priority]} priority
        </span>
      )}
      {card.dueDate && (
        <span
          className={clsx(
            "rounded-full border px-2 py-0.5",
            overdue
              ? "border-[var(--secondary-purple)] text-[var(--secondary-purple)]"
              : "border-[var(--stroke)] text-[var(--gray-text)]"
          )}
        >
          {overdue ? "Overdue: " : "Due "}
          {formatDueDate(card.dueDate)}
        </span>
      )}
      {card.checklist.length > 0 && (
        <span
          aria-label={`Checklist: ${done} of ${card.checklist.length} done`}
          className={clsx(
            "rounded-full border px-2 py-0.5",
            done === card.checklist.length
              ? "border-[var(--primary-blue)] text-[var(--primary-blue)]"
              : "border-[var(--stroke)] text-[var(--gray-text)]"
          )}
        >
          Checklist {done}/{card.checklist.length}
        </span>
      )}
      {card.labels.map((label) => (
        <span key={label} className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[var(--navy-dark)]">
          {label}
        </span>
      ))}
    </div>
  );
};
