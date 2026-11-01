"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { AccountDialog } from "@/components/AccountDialog";
import { ActivityDialog } from "@/components/ActivityDialog";
import { AddColumnForm } from "@/components/AddColumnForm";
import { BoardSummary } from "@/components/BoardSummary";
import { FilterBar } from "@/components/FilterBar";
import { ChatSidebar } from "@/components/ChatSidebar";
import { CardDialog } from "@/components/CardDialog";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import * as api from "@/lib/api";
import {
  boardLabels,
  boardSummary,
  emptyFilter,
  matchesFilter,
  planMove,
  todayISO,
  type BoardData,
  type CardFields,
  type CardFilter,
} from "@/lib/kanban";

// Prefer what the pointer is over: with closestCorners alone, a card dropped on an empty
// column can land on a card in a neighbouring column. Keyboard drags have no pointer.
const collisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  return collisions.length > 0 ? collisions : closestCorners(args);
};

type KanbanBoardProps = {
  boardId: number;
  username: string;
  onLogout: () => void;
  onAccountDeleted: () => void;
};

export const KanbanBoard = ({
  boardId,
  username,
  onLogout,
  onAccountDeleted,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CardFilter>(emptyFilter);
  // Counts failed saves; inputs keyed on it show the saved values again after a failure.
  const [failedSaves, setFailedSaves] = useState(0);

  useEffect(() => {
    api
      .getBoard(boardId)
      .then(setBoard)
      .catch(() => setError("Could not load the board."));
  }, [boardId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Show the board the server returns; on failure, go back to `previous`.
  const save = async (request: Promise<BoardData>, previous: BoardData) => {
    try {
      setBoard(await request);
      setError(null);
    } catch {
      setBoard(previous);
      setFailedSaves((count) => count + 1);
      setError("Could not save your change. Please try again.");
    }
  };

  if (!board) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        {error ? (
          <p role="alert" className="font-display text-xl font-semibold text-[var(--navy-dark)]">
            {error}
          </p>
        ) : (
          <p className="text-sm text-[var(--gray-text)]">Loading board...</p>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]"
        >
          Log out
        </button>
      </main>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    const cardId = active.id as string;
    const move = over && planMove(board.columns, cardId, over.id as string);
    if (!move) {
      return;
    }
    // Move right away so the card does not jump back while the request runs.
    setBoard({ ...board, columns: move.columns });
    save(api.moveCard(boardId, cardId, move.columnId, move.position), board);
  };

  const handleRenameColumn = (columnId: string, title: string) =>
    save(api.renameColumn(boardId, columnId, title), board);

  const handleAddCard = (columnId: string, fields: CardFields) =>
    save(api.createCard(boardId, columnId, fields), board);

  const handleEditCard = (cardId: string, fields: CardFields) =>
    save(api.updateCard(boardId, cardId, fields), board);

  const handleDeleteCard = (cardId: string) => save(api.deleteCard(boardId, cardId), board);

  // Ticked at once (a controlled checkbox would otherwise flip back until the reply).
  const handleToggleItem = (cardId: string, itemId: string, done: boolean) => {
    const card = board.cards[cardId];
    const checklist = card.checklist.map((item) => (item.id === itemId ? { ...item, done } : item));
    setBoard({ ...board, cards: { ...board.cards, [cardId]: { ...card, checklist } } });
    save(api.updateChecklistItem(boardId, cardId, itemId, { done }), board);
  };

  const handleAddColumn = (title: string) => save(api.addColumn(boardId, title), board);

  const handleMoveColumn = (columnId: string, position: number) =>
    save(api.moveColumn(boardId, columnId, position), board);

  const handleDeleteColumn = (columnId: string, moveCardsTo: string | null) =>
    save(api.deleteColumn(boardId, columnId, moveCardsTo), board);

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const today = todayISO();
  const visibleCards = (cardIds: string[]) =>
    cardIds.map((cardId) => board.cards[cardId]).filter((card) => matchesFilter(card, filter, today));
  const shown = board.columns.reduce((count, column) => count + visibleCards(column.cardIds).length, 0);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Project boards
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-end gap-2">
                <p className="text-xs text-[var(--gray-text)]">Signed in as {username}</p>
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                >
                  AI Assistant
                </button>
                <button
                  type="button"
                  onClick={() => setActivityOpen(true)}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
                >
                  Activity
                </button>
                <button
                  type="button"
                  onClick={() => setAccountOpen(true)}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
                >
                  Account
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
            <AddColumnForm onAdd={handleAddColumn} />
          </div>
        </header>

        <section aria-label="Overview and filters" className="flex flex-col gap-4">
          <BoardSummary summary={boardSummary(board, today)} />
          <FilterBar
            filter={filter}
            labels={boardLabels(board)}
            shown={shown}
            total={Object.keys(board.cards).length}
            onChange={setFilter}
          />
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-[var(--accent-yellow)] bg-white px-5 py-3 text-sm font-semibold text-[var(--navy-dark)]"
          >
            {error}
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* One grid column per board column; scrolls sideways when they do not fit. */}
          <section
            className="grid gap-6 lg:grid-cols-[repeat(var(--column-count),minmax(220px,1fr))] lg:overflow-x-auto lg:pb-2"
            style={{ "--column-count": board.columns.length } as CSSProperties}
          >
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={visibleCards(column.cardIds)}
                columns={board.columns}
                failedSaves={failedSaves}
                onMove={handleMoveColumn}
                onDelete={handleDeleteColumn}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
                onOpenCard={setOpenCardId}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
      {activityOpen && <ActivityDialog boardId={boardId} onClose={() => setActivityOpen(false)} />}
      {openCardId && board.cards[openCardId] && (
        <CardDialog
          boardId={boardId}
          card={board.cards[openCardId]}
          onClose={() => setOpenCardId(null)}
          onAddItem={(text) => save(api.addChecklistItem(boardId, openCardId, text), board)}
          onToggleItem={(itemId, done) => handleToggleItem(openCardId, itemId, done)}
          onRemoveItem={(itemId) =>
            save(api.deleteChecklistItem(boardId, openCardId, itemId), board)
          }
        />
      )}
      {accountOpen && (
        <AccountDialog
          username={username}
          onClose={() => setAccountOpen(false)}
          onAccountDeleted={onAccountDeleted}
        />
      )}
      <ChatSidebar
        boardId={boardId}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onBoardUpdate={setBoard}
      />
    </div>
  );
};
