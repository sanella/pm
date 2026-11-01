import { useEffect, useState } from "react";
import { BoardNav } from "@/components/BoardNav";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ShareDialog } from "@/components/ShareDialog";
import {
  createBoard,
  deleteBoard,
  listBoards,
  renameBoard,
  type BoardSummary,
} from "@/lib/api";

type WorkspaceProps = {
  username: string;
  onLogout: () => void;
  onAccountDeleted: () => void;
};

// The signed-in view: the user's boards and the board currently open.
export const Workspace = ({ username, onLogout, onAccountDeleted }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  // Remembers the last open board per user in this browser.
  const storageKey = `pm.lastBoard.${username}`;

  const select = (boardId: number) => {
    setCurrentId(boardId);
    localStorage.setItem(storageKey, String(boardId));
  };

  useEffect(() => {
    listBoards()
      .then((list) => {
        const saved = Number(localStorage.getItem(storageKey));
        setBoards(list);
        setCurrentId(list.some((board) => board.id === saved) ? saved : list[0].id);
      })
      .catch(() => setError("Could not load your boards."));
  }, [storageKey]);

  if (!boards || currentId === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        {error ? (
          <p role="alert" className="font-display text-xl font-semibold text-[var(--navy-dark)]">
            {error}
          </p>
        ) : (
          <p className="text-sm text-[var(--gray-text)]">Loading boards...</p>
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

  // Runs a board list change; failures are shown in the nav.
  const run = async (action: () => Promise<void>, failure: string) => {
    try {
      await action();
      setError("");
    } catch {
      setError(failure);
    }
  };

  const handleCreate = (title: string) =>
    run(async () => {
      const board = await createBoard(title);
      setBoards([...boards, board]);
      select(board.id);
    }, "Could not create the board.");

  const handleRename = (title: string) =>
    run(async () => {
      const renamed = await renameBoard(currentId, title);
      setBoards(boards.map((board) => (board.id === renamed.id ? renamed : board)));
    }, "Could not rename the board.");

  const handleDelete = () =>
    run(async () => {
      await deleteBoard(currentId);
      const rest = boards.filter((board) => board.id !== currentId);
      setBoards(rest);
      select(rest[0].id);
    }, "Could not delete the board.");

  const handleLeft = () => {
    const rest = boards.filter((board) => board.id !== currentId);
    setShareOpen(false);
    setBoards(rest);
    select(rest[0].id);
  };

  return (
    <>
      {/* Outside KanbanBoard, so it stays put (and keeps its state) while boards load. */}
      <div className="relative z-10 mx-auto max-w-[1500px] px-6 pt-8">
        <BoardNav
          boards={boards}
          currentId={currentId}
          error={error}
          onSelect={select}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={handleDelete}
          onShare={() => setShareOpen(true)}
        />
      </div>
      {shareOpen && (
        <ShareDialog
          board={boards.find((board) => board.id === currentId)!}
          username={username}
          onClose={() => setShareOpen(false)}
          onLeft={handleLeft}
        />
      )}
      <KanbanBoard
        // A new key gives each board fresh state (including its chat).
        key={currentId}
        boardId={currentId}
        username={username}
        onLogout={onLogout}
        onAccountDeleted={onAccountDeleted}
      />
    </>
  );
};
