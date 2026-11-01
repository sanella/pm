import { useEffect, useState, type FormEvent } from "react";
import { addComment, deleteComment, listComments, type CardComment } from "@/lib/api";
import { formatTimestamp, type Card } from "@/lib/kanban";

type CardDialogProps = {
  boardId: number;
  card: Card;
  onClose: () => void;
  // Checklist changes go through the board, which saves them and shows the result.
  onAddItem: (text: string) => void;
  onToggleItem: (itemId: string, done: boolean) => void;
  onRemoveItem: (itemId: string) => void;
};

// A card's checklist and comments.
export const CardDialog = ({
  boardId,
  card,
  onClose,
  onAddItem,
  onToggleItem,
  onRemoveItem,
}: CardDialogProps) => {
  const [comments, setComments] = useState<CardComment[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [newItem, setNewItem] = useState("");
  const done = card.checklist.filter((item) => item.done).length;

  const handleAddItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newItem.trim()) {
      return;
    }
    onAddItem(newItem.trim());
    setNewItem("");
  };

  useEffect(() => {
    listComments(boardId, card.id)
      .then(setComments)
      .catch(() => setError("Could not load the comments."));
  }, [boardId, card.id]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }
    try {
      setComments(await addComment(boardId, card.id, text.trim()));
      setText("");
      setError("");
    } catch {
      setError("Could not add the comment.");
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      setComments(await deleteComment(boardId, card.id, commentId));
      setError("");
    } catch {
      setError("Could not delete the comment.");
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(3,33,71,0.35)] px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-title"
        className="flex max-h-[80vh] w-full max-w-lg flex-col gap-5 rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">Card</p>
            <h2 id="card-title" className="mt-1 font-display text-2xl font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>

        <section aria-labelledby="checklist-title" className="space-y-3">
          <h3
            id="checklist-title"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
          >
            Checklist {card.checklist.length > 0 && `${done}/${card.checklist.length}`}
          </h3>
          {card.checklist.length > 0 && (
            <ul className="space-y-2">
              {card.checklist.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm text-[var(--navy-dark)]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={(event) => onToggleItem(item.id, event.target.checked)}
                      className="h-4 w-4 accent-[var(--secondary-purple)]"
                    />
                    <span className={item.done ? "text-[var(--gray-text)] line-through" : undefined}>
                      {item.text}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    aria-label={`Remove item: ${item.text}`}
                    className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--secondary-purple)]"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddItem} className="flex gap-2">
            <input
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              aria-label="New checklist item"
              placeholder="Add an item"
              maxLength={200}
              className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
            <button
              type="submit"
              className="rounded-full border border-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--secondary-purple)] transition hover:bg-[var(--secondary-purple)] hover:text-white"
            >
              Add item
            </button>
          </form>
        </section>

        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">Comments</h3>
        {comments && comments.length === 0 && (
          <p className="text-sm text-[var(--gray-text)]">No comments yet.</p>
        )}
        {comments && comments.length > 0 && (
          <ol aria-label="Comments" className="space-y-3 overflow-y-auto">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-2xl bg-[var(--surface)] px-4 py-3">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--gray-text)]">
                  <span>
                    <span className="font-semibold text-[var(--navy-dark)]">
                      {comment.author ?? "Deleted user"}
                    </span>{" "}
                    {formatTimestamp(comment.createdAt)}
                  </span>
                  {comment.mine && (
                    <button
                      type="button"
                      onClick={() => handleDelete(comment.id)}
                      aria-label={`Delete comment: ${comment.text}`}
                      className="font-semibold uppercase tracking-wide transition hover:text-[var(--secondary-purple)]"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--navy-dark)]">{comment.text}</p>
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="New comment"
            placeholder="Write a comment"
            rows={3}
            maxLength={2000}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          {error && (
            <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Add comment
          </button>
        </form>
      </div>
    </div>
  );
};
