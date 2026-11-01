import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { deleteAccount, getBoard, getCurrentUser, listBoards, login, logout } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getBoard: vi.fn(),
  listBoards: vi.fn(),
  deleteAccount: vi.fn(),
}));

describe("Home", () => {
  beforeEach(() => {
    vi.mocked(getBoard).mockResolvedValue(initialData);
    vi.mocked(listBoards).mockResolvedValue([{ id: 1, title: "My board", owner: "alice", isOwner: true }]);
  });

  it("shows the login form when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(<Home />);
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kanban Studio" })).not.toBeInTheDocument();
  });

  it("shows an error with a retry button when the server is unreachable", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Home />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot reach the server/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows the board when signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue("user");
    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeInTheDocument();
  });

  it("shows the board after logging in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(login).mockResolvedValue("user");
    render(<Home />);

    await userEvent.type(await screen.findByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeInTheDocument();
  });

  it("returns to the login form after logging out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue("user");
    vi.mocked(logout).mockResolvedValue();
    render(<Home />);

    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows the signed-in user and returns to sign in after deleting the account", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue("alice");
    vi.mocked(deleteAccount).mockResolvedValue(null);
    render(<Home />);

    expect(await screen.findByText("Signed in as alice")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^account$/i }));
    await userEvent.type(screen.getByLabelText("Password to confirm deletion"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });
});
