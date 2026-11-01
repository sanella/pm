import { useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, CardFields, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { DeleteColumnPanel } from "@/components/DeleteColumnPanel";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  // The column's cards that pass the board filter (all of them when none is set).
  cards: Card[];
  // The board's columns, for moving this one and choosing where its cards go.
  columns: Column[];
  // Changes after a failed save, so the title input shows the saved title again.
  failedSaves: number;
  onMove: (columnId: string, position: number) => void;
  onDelete: (columnId: string, moveCardsTo: string | null) => void;
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, fields: CardFields) => void;
  onDeleteCard: (cardId: string) => void;
  onEditCard: (cardId: string, fields: CardFields) => void;
  onOpenCard: (cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  columns,
  failedSaves,
  onMove,
  onDelete,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onOpenCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [deleting, setDeleting] = useState(false);
  const position = columns.findIndex((other) => other.id === column.id);
  const actionClass =
    "rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] disabled:opacity-30 disabled:hover:text-[var(--gray-text)]";

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {cards.length !== column.cardIds.length && `${cards.length} of `}
              {column.cardIds.length} {column.cardIds.length === 1 ? "card" : "cards"}
            </span>
          </div>
          <input
            // Remount when the saved title changes (or a save fails) so the input shows it.
            key={`${column.title}:${failedSaves}`}
            defaultValue={column.title}
            onBlur={(event) => {
              const title = event.target.value.trim();
              if (title && title !== column.title) {
                onRename(column.id, title);
              } else {
                event.target.value = column.title;
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(column.id, position - 1)}
              disabled={position === 0}
              aria-label={`Move column ${column.title} left`}
              className={actionClass}
            >
              &larr;
            </button>
            <button
              type="button"
              onClick={() => onMove(column.id, position + 1)}
              disabled={position === columns.length - 1}
              aria-label={`Move column ${column.title} right`}
              className={actionClass}
            >
              &rarr;
            </button>
            <button
              type="button"
              onClick={() => setDeleting(true)}
              disabled={columns.length === 1}
              aria-label={`Delete column ${column.title}`}
              className={clsx(actionClass, "ml-auto hover:text-[var(--secondary-purple)]")}
            >
              Delete
            </button>
          </div>
          {deleting && (
            <DeleteColumnPanel
              column={column}
              otherColumns={columns.filter((other) => other.id !== column.id)}
              onConfirm={(moveCardsTo) => {
                setDeleting(false);
                onDelete(column.id, moveCardsTo);
              }}
              onCancel={() => setDeleting(false)}
            />
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={onDeleteCard}
              onEdit={onEditCard}
              onOpen={onOpenCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {column.cardIds.length > 0 ? "No matching cards" : "Drop a card here"}
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(fields) => onAddCard(column.id, fields)}
      />
    </section>
  );
};
