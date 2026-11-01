import { useState } from "react";
import { CardForm, emptyCard } from "@/components/CardForm";
import type { CardFields } from "@/lib/kanban";

type NewCardFormProps = {
  onAdd: (fields: CardFields) => void;
};

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-4">
      {isOpen ? (
        <CardForm
          initial={emptyCard}
          submitLabel="Add card"
          onSubmit={(fields) => {
            onAdd(fields);
            setIsOpen(false);
          }}
          onCancel={() => setIsOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
        >
          Add a card
        </button>
      )}
    </div>
  );
};
