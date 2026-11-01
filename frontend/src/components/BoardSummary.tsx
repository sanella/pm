import clsx from "clsx";

type BoardSummaryProps = {
  summary: { total: number; overdue: number; dueSoon: number; highPriority: number };
};

export const BoardSummary = ({ summary }: BoardSummaryProps) => {
  const tiles = [
    { label: "Cards", value: summary.total, alert: false },
    { label: "Overdue", value: summary.overdue, alert: summary.overdue > 0 },
    { label: "Due in 7 days", value: summary.dueSoon, alert: false },
    { label: "High priority", value: summary.highPriority, alert: false },
  ];
  return (
    <dl aria-label="Board summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3"
        >
          <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {tile.label}
          </dt>
          <dd
            className={clsx(
              "mt-1 font-display text-2xl font-semibold",
              tile.alert ? "text-[var(--secondary-purple)]" : "text-[var(--navy-dark)]"
            )}
          >
            {tile.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};
