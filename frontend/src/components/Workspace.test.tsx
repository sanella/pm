import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import { createBoard, deleteBoard, getBoard, listBoards, listMembers, removeMember, renameBoard } from "@/lib/api";
import { initialData, type BoardData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  listBoards: vi.fn(),
  createBoard: vi.fn(),
  renameBoard: vi.fn(),
  deleteBoard: vi.fn(),
  getBoard: vi.fn(),
  listMembers: vi.fn(),
  removeMember: vi.fn(),
}));

// Board 2 has a single card, so the open board can be told apart.
const launchBoard: BoardData = {
  columns: initialData.columns.map((column, index) => ({
    ...column,
    cardIds: index === 0 ? ["card-launch"] : [],
  })),
  cards: { "card-launch": { id: "card-launch", title: "Launch card", details: "", priority: "none", dueDate: null, labels: [], checklist: [] } },
};

const renderWorkspace = async () => {
  render(<Workspace username="alice" onLogout={() => {}} onAccountDeleted={() => {}} />);
  await screen.findAllByTestId(/column-/);
};

const nav = () => screen.getByRole("navigation", { name: "Boards" });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(listBoards).mockResolvedValue([
    { id: 1, title: "My board", owner: "alice", isOwner: true },
    { id: 2, title: "Launch", owner: "alice", isOwner: true },
  ]);
  vi.mocked(getBoard).mockImplementation(async (id) => (id === 2 ? launchBoard : initialData));
});

describe("Workspace", () => {
  it("opens the first board", async () => {
    await renderWorkspace();
    expect(getBoard).toHaveBeenCalledWith(1);
    expect(within(nav()).getByRole("button", { name: "My board" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("switches boards and remembers the choice", async () => {
    await renderWorkspace();
    await userEvent.click(within(nav()).getByRole("button", { name: "Launch" }));

    expect(await screen.findByText("Launch card")).toBeInTheDocument();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(localStorage.getItem("pm.lastBoard.alice")).toBe("2");
  });

  it("reopens the remembered board", async () => {
    localStorage.setItem("pm.lastBoard.alice", "2");
    await renderWorkspace();
    expect(getBoard).toHaveBeenCalledWith(2);
    expect(screen.getByText("Launch card")).toBeInTheDocument();
  });

  it("ignores a remembered board that no longer exists", async () => {
    localStorage.setItem("pm.lastBoard.alice", "99");
    await renderWorkspace();
    expect(getBoard).toHaveBeenCalledWith(1);
  });

  it("creates a board and opens it", async () => {
    vi.mocked(createBoard).mockResolvedValue({ id: 2, title: "Launch", owner: "alice", isOwner: true });
    vi.mocked(listBoards).mockResolvedValue([{ id: 1, title: "My board", owner: "alice", isOwner: true }]);
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "Launch{Enter}");

    expect(createBoard).toHaveBeenCalledWith("Launch");
    expect(await within(nav()).findByRole("button", { name: "Launch" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(await screen.findByText("Launch card")).toBeInTheDocument();
  });

  it("renames the open board", async () => {
    vi.mocked(renameBoard).mockResolvedValue({ id: 1, title: "Roadmap", owner: "alice", isOwner: true });
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: /rename board/i }));
    await userEvent.clear(screen.getByLabelText("Board name"));
    await userEvent.type(screen.getByLabelText("Board name"), "Roadmap{Enter}");

    expect(renameBoard).toHaveBeenCalledWith(1, "Roadmap");
    expect(await within(nav()).findByRole("button", { name: "Roadmap" })).toBeInTheDocument();
  });

  it("deletes the open board and opens the next one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteBoard).mockResolvedValue({ status: "ok" });
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));

    expect(deleteBoard).toHaveBeenCalledWith(1);
    expect(await screen.findByText("Launch card")).toBeInTheDocument();
    expect(within(nav()).queryByRole("button", { name: "My board" })).not.toBeInTheDocument();
  });

  it("shows an error when a board action fails", async () => {
    vi.mocked(createBoard).mockRejectedValue(new Error("500"));
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "Launch{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create the board.");
    expect(within(nav()).queryByRole("button", { name: "Launch" })).toBeInTheDocument();
  });

  it("shows an error when the boards cannot be loaded", async () => {
    vi.mocked(listBoards).mockRejectedValue(new Error("500"));
    render(<Workspace username="alice" onLogout={() => {}} onAccountDeleted={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your boards.");
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });
});

describe("Workspace while a board loads", () => {
  it("keeps the board switcher when a board cannot be loaded", async () => {
    vi.mocked(getBoard).mockImplementation(async (id) => {
      if (id === 1) throw new Error("500");
      return launchBoard;
    });
    render(<Workspace username="alice" onLogout={() => {}} onAccountDeleted={() => {}} />);

    expect(await screen.findByText(/could not load the board/i)).toBeInTheDocument();
    await userEvent.click(within(nav()).getByRole("button", { name: "Launch" }));
    expect(await screen.findByText("Launch card")).toBeInTheDocument();
  });
});

describe("Workspace with a shared board", () => {
  it("leaves a shared board and opens the first own board", async () => {
    vi.mocked(listBoards).mockResolvedValue([
      { id: 1, title: "My board", owner: "alice", isOwner: true },
      { id: 2, title: "Launch", owner: "bob", isOwner: false },
    ]);
    vi.mocked(listMembers).mockResolvedValue({ owner: "bob", members: ["alice"] });
    vi.mocked(removeMember).mockResolvedValue({ owner: "bob", members: [] });
    localStorage.setItem("pm.lastBoard.alice", "2");
    await renderWorkspace();
    expect(screen.getByText("Launch card")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await userEvent.click(await screen.findByRole("button", { name: /leave board/i }));

    expect(removeMember).toHaveBeenCalledWith(2, "alice");
    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(nav()).queryByRole("button", { name: /launch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the share dialog", async () => {
    vi.mocked(listMembers).mockResolvedValue({ owner: "alice", members: [] });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    const dialog = await screen.findByRole("dialog", { name: "Share My board" });
    await userEvent.click(within(dialog).getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
