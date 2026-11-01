import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountDialog } from "@/components/AccountDialog";
import { changePassword, deleteAccount } from "@/lib/api";

vi.mock("@/lib/api", () => ({ changePassword: vi.fn(), deleteAccount: vi.fn() }));

const renderDialog = () => {
  const props = { onClose: vi.fn(), onAccountDeleted: vi.fn() };
  render(<AccountDialog username="alice" {...props} />);
  return props;
};

const submitPasswordChange = async (current: string, next: string) => {
  await userEvent.type(screen.getByLabelText("Current password"), current);
  await userEvent.type(screen.getByLabelText("New password"), next);
  await userEvent.click(screen.getByRole("button", { name: /change password/i }));
};

const submitDelete = async (password: string) => {
  await userEvent.type(screen.getByLabelText("Password to confirm deletion"), password);
  await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
};

describe("AccountDialog", () => {
  it("shows who is signed in and closes", async () => {
    const { onClose } = renderDialog();
    expect(screen.getByRole("dialog", { name: "Account" })).toHaveTextContent("Signed in as alice");
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("changes the password and clears the form", async () => {
    vi.mocked(changePassword).mockResolvedValue(null);
    renderDialog();
    await submitPasswordChange("old-pass", "new-password");

    expect(changePassword).toHaveBeenCalledWith("old-pass", "new-password");
    expect(await screen.findByRole("status")).toHaveTextContent("Password changed.");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("shows why a password change was refused and keeps the input", async () => {
    vi.mocked(changePassword).mockResolvedValue("The current password is wrong.");
    renderDialog();
    await submitPasswordChange("bad-pass", "new-password");

    expect(await screen.findByRole("status")).toHaveTextContent("The current password is wrong.");
    expect(screen.getByLabelText("New password")).toHaveValue("new-password");
  });

  it("reports a failed password change request", async () => {
    vi.mocked(changePassword).mockRejectedValue(new Error("500"));
    renderDialog();
    await submitPasswordChange("old-pass", "new-password");
    expect(await screen.findByRole("status")).toHaveTextContent(/could not change the password/i);
  });

  it("deletes the account", async () => {
    vi.mocked(deleteAccount).mockResolvedValue(null);
    const { onAccountDeleted } = renderDialog();
    await submitDelete("secret-pass");

    expect(deleteAccount).toHaveBeenCalledWith("secret-pass");
    expect(onAccountDeleted).toHaveBeenCalledOnce();
  });

  it("keeps the account when the password is wrong", async () => {
    vi.mocked(deleteAccount).mockResolvedValue("The password is wrong.");
    const { onAccountDeleted } = renderDialog();
    await submitDelete("wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("The password is wrong.");
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it("reports a failed delete request and keeps the account", async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new Error("500"));
    const { onAccountDeleted } = renderDialog();
    await submitDelete("secret-pass");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not delete the account/i);
    expect(onAccountDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /delete account/i })).toBeEnabled();
  });
});
