import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { getBoard, getCurrentUser, login, logout } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getBoard: vi.fn(),
}));

describe("Home", () => {
  beforeEach(() => {
    vi.mocked(getBoard).mockResolvedValue(initialData);
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
    vi.mocked(login).mockResolvedValue(true);
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
});
