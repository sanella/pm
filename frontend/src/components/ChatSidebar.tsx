import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { sendChat, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

// Match the backend limits: the latest 40 turns are sent, a message is at most 4000 characters.
export const CHAT_HISTORY_LIMIT = 40;
const MESSAGE_LIMIT = 4000;

type ChatSidebarProps = {
  boardId: number;
  open: boolean;
  onClose: () => void;
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ boardId, open, onClose, onBoardUpdate }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) {
      return;
    }
    // The history sent is the conversation before this message.
    const history = messages;
    setMessages([...history, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    setError("");
    try {
      const reply = await sendChat(boardId, text, history.slice(-CHAT_HISTORY_LIMIT));
      setMessages((prev) => [...prev, { role: "assistant", content: reply.message }]);
      if (reply.board) {
        onBoardUpdate(reply.board);
      }
    } catch {
      // Drop the unanswered message so the conversation sent next time stays consistent.
      setMessages(history);
      setInput(text);
      setError("The assistant could not answer. Please try again.");
    }
    setSending(false);
  };

  return (
    // Hidden rather than unmounted when closed, so the conversation is kept.
    <aside
      aria-label="AI assistant"
      className={clsx(
        "fixed inset-y-0 right-0 z-20 flex w-full max-w-[400px] flex-col border-l border-[var(--stroke)] bg-[var(--surface-strong)] shadow-[var(--shadow)]",
        !open && "hidden"
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-5">
        <div>
          <div className="h-1 w-10 rounded-full bg-[var(--accent-yellow)]" />
          <h2 className="mt-3 font-display text-xl font-semibold text-[var(--navy-dark)]">
            AI Assistant
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

      <ol className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-5" aria-live="polite">
        {messages.length === 0 && (
          <li className="text-sm leading-6 text-[var(--gray-text)]">
            Ask about your board, or ask me to create, edit, move or delete cards.
          </li>
        )}
        {messages.map((message, index) => (
          <li
            key={index}
            className={clsx(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6",
              message.role === "user"
                ? "self-end bg-[var(--navy-dark)] text-white"
                : "self-start bg-[var(--surface)] text-[var(--navy-dark)]"
            )}
          >
            {message.content}
          </li>
        ))}
        {sending && (
          <li className="self-start text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary-blue)]">
            Thinking...
          </li>
        )}
      </ol>

      <form onSubmit={handleSubmit} className="space-y-3 border-t border-[var(--stroke)] px-6 py-5">
        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
            {error}
          </p>
        )}
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Message the assistant"
          aria-label="Message"
          rows={3}
          maxLength={MESSAGE_LIMIT}
          className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
