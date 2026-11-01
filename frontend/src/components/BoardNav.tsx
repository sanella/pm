import { useState, type FormEvent } from "react";
import clsx from "clsx";
import type { BoardSummary } from "@/lib/api";

type BoardNavProps = {
  boards: BoardSummary[];
  currentId: number;
  error: string;
  onSelect: (boardId: number) => void;
  onCreate: (title: string) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onShare: () => void;
};

const buttonClass =
  "rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition";

export const BoardNav = ({
  boards,
  currentId,
  error,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onShare,
}: BoardNavProps) => {
  // Which inline form is open, if any.
  const [form, setForm] = useState<"create" | "rename" | null>(null);
  const [title, setTitle] = useState("");
  const current = boards.find((board) => board.id === currentId);
  // Shared boards do not count: a user always keeps one board of their own.
  const ownBoards = boards.filter((board) => board.isOwner).length;

  const openForm = (kind: "create" | "rename") => {
    setForm(kind);
    setTitle(kind === "rename" ? (current?.title ?? "") : "");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    if (form === "create") {
      onCreate(trimmed);
    } else {
      onRename(trimmed);
    }
    setForm(null);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete the board "${current?.title}" and all its cards?`)) {
      onDelete();
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-[var(--stroke)] bg-white/80 px-5 py-4 shadow-[var(--shadow)] backdrop-blur">
      <nav aria-label="Boards" className="flex flex-wrap items-center gap-2">
        {boards.map((board) => (
          <button
            key={board.id}
            type="button"
            onClick={() => onSelect(board.id)}
            aria-current={board.id === currentId ? "page" : undefined}
            className={clsx(
              buttonClass,
              board.id === currentId
                ? "border-[var(--primary-blue)] bg-[var(--primary-blue)] text-white"
                : "text-[var(--navy-dark)] hover:border-[var(--primary-blue)]"
            )}
          >
            {board.isOwner ? board.title : `${board.title} · ${board.owner}`}
          </button>
        ))}
        <button
          type="button"
          onClick={() => openForm("create")}
          className={clsx(buttonClass, "border-dashed text-[var(--primary-blue)] hover:border-[var(--primary-blue)]")}
        >
          New board
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--stroke)]" aria-hidden="true" />
        <button
          type="button"
          onClick={onShare}
          className={clsx(buttonClass, "text-[var(--primary-blue)] hover:border-[var(--primary-blue)]")}
        >
          Share
        </button>
        {/* Only the owner renames or deletes a board. */}
        {current?.isOwner && (
          <>
            <button
              type="button"
              onClick={() => openForm("rename")}
              className={clsx(buttonClass, "text-[var(--gray-text)] hover:text-[var(--navy-dark)]")}
            >
              Rename board
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={ownBoards === 1}
              title={ownBoards === 1 ? "Your only board cannot be deleted" : undefined}
              className={clsx(
                buttonClass,
                "text-[var(--gray-text)] hover:text-[var(--secondary-purple)] disabled:opacity-40 disabled:hover:text-[var(--gray-text)]"
              )}
            >
              Delete board
            </button>
          </>
        )}
      </nav>
      {form && (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Board name"
            placeholder="Board name"
            maxLength={200}
            autoFocus
            className="min-w-[220px] rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            {form === "create" ? "Create board" : "Save name"}
          </button>
          <button
            type="button"
            onClick={() => setForm(null)}
            className={clsx(buttonClass, "text-[var(--gray-text)] hover:text-[var(--navy-dark)]")}
          >
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
          {error}
        </p>
      )}
    </div>
  );
};
