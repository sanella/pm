import { useState, type KeyboardEventHandler } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CardForm } from "@/components/CardForm";
import { CardMeta } from "@/components/CardMeta";
import type { Card, CardFields } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, fields: CardFields) => void;
  // Opens the card's checklist and comments.
  onOpen: (cardId: string) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit, onOpen }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: isEditing });
  // Pointer drags start anywhere on the card; keyboard drags only from the handle,
  // so Space/Enter on the Edit and Remove buttons still click them.
  const { onKeyDown, ...pointerListeners } = listeners ?? {};

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };


  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...pointerListeners}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <CardForm
          initial={card}
          submitLabel="Save"
          onSubmit={(fields) => {
            onEdit(card.id, fields);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            // dnd-kit types its listeners as plain `Function`.
            onKeyDown={onKeyDown as KeyboardEventHandler | undefined}
            aria-label={`Drag ${card.title}`}
            className="mt-0.5 cursor-grab touch-none rounded-md px-1 text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] active:cursor-grabbing"
          >
            <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" fill="currentColor">
              <circle cx="2" cy="2" r="1.5" />
              <circle cx="8" cy="2" r="1.5" />
              <circle cx="2" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="2" cy="14" r="1.5" />
              <circle cx="8" cy="14" r="1.5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
            {card.details && (
              <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">{card.details}</p>
            )}
            <CardMeta card={card} />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--stroke)]"
              aria-label={`Edit ${card.title}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onOpen(card.id)}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--stroke)]"
              aria-label={`Details for ${card.title}`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
              aria-label={`Delete ${card.title}`}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
