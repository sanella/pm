import { useState, type FormEvent } from "react";
import { changePassword, deleteAccount } from "@/lib/api";

type AccountDialogProps = {
  username: string;
  onClose: () => void;
  onAccountDeleted: () => void;
};

const inputClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const AccountDialog = ({ username, onClose, onAccountDeleted }: AccountDialogProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const problem = await changePassword(currentPassword, newPassword);
      setPasswordMessage(problem ?? "Password changed.");
      if (!problem) {
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch {
      setPasswordMessage("Could not change the password. Please try again.");
    }
    setBusy(false);
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const problem = await deleteAccount(deletePassword);
      if (!problem) {
        onAccountDeleted();
        return;
      }
      setDeleteError(problem);
    } catch {
      setDeleteError("Could not delete the account. Please try again.");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(3,33,71,0.35)] px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        className="w-full max-w-md space-y-6 rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="account-title" className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
              Account
            </h2>
            <p className="mt-1 text-sm text-[var(--gray-text)]">Signed in as {username}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Change password
          </h3>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            aria-label="Current password"
            placeholder="Current password"
            autoComplete="current-password"
            className={inputClass}
            required
          />
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            aria-label="New password"
            placeholder="New password (at least 8 characters)"
            autoComplete="new-password"
            className={inputClass}
            required
          />
          {passwordMessage && (
            <p role="status" className="text-sm font-semibold text-[var(--navy-dark)]">
              {passwordMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
          >
            Change password
          </button>
        </form>

        <form onSubmit={handleDelete} className="space-y-3 border-t border-[var(--stroke)] pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Delete account
          </h3>
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            Removes your account and all your boards. This cannot be undone.
          </p>
          <input
            type="password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            aria-label="Password to confirm deletion"
            placeholder="Password"
            autoComplete="current-password"
            className={inputClass}
            required
          />
          {deleteError && (
            <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
              {deleteError}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full border border-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--secondary-purple)] transition hover:bg-[var(--secondary-purple)] hover:text-white disabled:opacity-60"
          >
            Delete account
          </button>
        </form>
      </div>
    </div>
  );
};
