import { useState, type FormEvent } from "react";
import { PRIORITY_LABELS, parseLabels, type CardFields, type Priority } from "@/lib/kanban";

type CardFormProps = {
  initial: CardFields;
  submitLabel: string;
  onSubmit: (fields: CardFields) => void;
  onCancel: () => void;
};

const inputClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const emptyCard: CardFields = {
  title: "",
  details: "",
  priority: "none",
  dueDate: null,
  labels: [],
};

// Used both to add a card and to edit one.
export const CardForm = ({ initial, submitLabel, onSubmit, onCancel }: CardFormProps) => {
  const [title, setTitle] = useState(initial.title);
  const [details, setDetails] = useState(initial.details);
  const [priority, setPriority] = useState<Priority>(initial.priority);
  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [labels, setLabels] = useState(initial.labels.join(", "));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onSubmit({
      title: title.trim(),
      details: details.trim(),
      priority,
      dueDate: dueDate || null,
      labels: parseLabels(labels),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Card title"
        aria-label="Card title"
        maxLength={200}
        className={`${inputClass} font-medium`}
        required
      />
      <textarea
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        placeholder="Details"
        aria-label="Card details"
        rows={3}
        maxLength={2000}
        className={`${inputClass} resize-none text-[var(--gray-text)]`}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value as Priority)}
          aria-label="Priority"
          className={inputClass}
        >
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          aria-label="Due date"
          className={inputClass}
        />
      </div>
      <input
        value={labels}
        onChange={(event) => setLabels(event.target.value)}
        placeholder="Labels, comma separated"
        aria-label="Labels"
        className={inputClass}
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
