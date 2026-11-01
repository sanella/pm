import { useEffect, useState, type FormEvent } from "react";
import {
  addMember,
  listMembers,
  removeMember,
  RequestError,
  type BoardMembers,
  type BoardSummary,
} from "@/lib/api";

type ShareDialogProps = {
  board: BoardSummary;
  username: string;
  onClose: () => void;
  // Called after the signed-in user leaves a board shared with them.
  onLeft: () => void;
};

const ADD_ERRORS: Record<number, string> = {
  404: "There is no user with that name.",
  409: "That user can already open this board.",
};

const smallButton =
  "rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition";

export const ShareDialog = ({ board, username, onClose, onLeft }: ShareDialogProps) => {
  const [members, setMembers] = useState<BoardMembers | null>(null);
  const [newMember, setNewMember] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listMembers(board.id)
      .then(setMembers)
      .catch(() => setError("Could not load the members."));
  }, [board.id]);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newMember.trim();
    if (!name) {
      return;
    }
    try {
      setMembers(await addMember(board.id, name));
      setNewMember("");
      setError("");
    } catch (failure) {
      setError(
        (failure instanceof RequestError && ADD_ERRORS[failure.status]) ||
          "Could not add the member."
      );
    }
  };

  const handleRemove = async (name: string) => {
    try {
      const updated = await removeMember(board.id, name);
      if (name === username) {
        onLeft();
        return;
      }
      setMembers(updated);
      setError("");
    } catch {
      setError(name === username ? "Could not leave the board." : "Could not remove the member.");
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(3,33,71,0.35)] px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="w-full max-w-md space-y-5 rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="share-title" className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
              Share {board.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--gray-text)]">
              Members can see and change the cards and columns.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`${smallButton} text-[var(--gray-text)] hover:text-[var(--navy-dark)]`}
          >
            Close
          </button>
        </div>

        {members && (
          <ul aria-label="People with access" className="space-y-2">
            <li className="flex items-center justify-between text-sm text-[var(--navy-dark)]">
              <span>{members.owner}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                Owner
              </span>
            </li>
            {members.members.map((name) => (
              <li key={name} className="flex items-center justify-between text-sm text-[var(--navy-dark)]">
                <span>{name}</span>
                {board.isOwner && (
                  <button
                    type="button"
                    onClick={() => handleRemove(name)}
                    aria-label={`Remove ${name}`}
                    className={`${smallButton} text-[var(--gray-text)] hover:text-[var(--secondary-purple)]`}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {board.isOwner ? (
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              value={newMember}
              onChange={(event) => setNewMember(event.target.value)}
              aria-label="Username to add"
              placeholder="Username"
              maxLength={32}
              className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Add member
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => handleRemove(username)}
            className="rounded-full border border-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--secondary-purple)] transition hover:bg-[var(--secondary-purple)] hover:text-white"
          >
            Leave board
          </button>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
