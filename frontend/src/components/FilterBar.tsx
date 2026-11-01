import { emptyFilter, isFilterActive, PRIORITY_LABELS, type CardFilter, type Priority } from "@/lib/kanban";

type FilterBarProps = {
  filter: CardFilter;
  labels: string[];
  shown: number;
  total: number;
  onChange: (filter: CardFilter) => void;
};

const controlClass =
  "rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const FilterBar = ({ filter, labels, shown, total, onChange }: FilterBarProps) => {
  const active = isFilterActive(filter);
  return (
    <div role="search" aria-label="Filter cards" className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={filter.text}
        onChange={(event) => onChange({ ...filter, text: event.target.value })}
        placeholder="Search cards"
        aria-label="Search cards"
        className={`${controlClass} min-w-[220px] flex-1`}
      />
      <select
        value={filter.priority}
        onChange={(event) => onChange({ ...filter, priority: event.target.value as Priority | "any" })}
        aria-label="Filter by priority"
        className={controlClass}
      >
        <option value="any">Any priority</option>
        {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={filter.label}
        onChange={(event) => onChange({ ...filter, label: event.target.value })}
        aria-label="Filter by label"
        className={controlClass}
      >
        <option value="">Any label</option>
        {labels.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-[var(--navy-dark)]">
        <input
          type="checkbox"
          checked={filter.overdueOnly}
          onChange={(event) => onChange({ ...filter, overdueOnly: event.target.checked })}
          className="h-4 w-4 accent-[var(--secondary-purple)]"
        />
        Overdue only
      </label>
      {active && (
        <>
          <span role="status" className="text-xs font-semibold text-[var(--gray-text)]">
            Showing {shown} of {total} cards
          </span>
          <button
            type="button"
            onClick={() => onChange(emptyFilter)}
            className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
          >
            Clear filters
          </button>
        </>
      )}
    </div>
  );
};
