import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardNav } from "@/components/BoardNav";

const boards = [
  { id: 1, title: "My board", owner: "alice", isOwner: true },
  { id: 2, title: "Launch", owner: "alice", isOwner: true },
];

const renderNav = (overrides = {}) => {
  const props = {
    boards,
    currentId: 2,
    error: "",
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onShare: vi.fn(),
    ...overrides,
  };
  render(<BoardNav {...props} />);
  return props;
};

describe("BoardNav", () => {
  it("lists the boards and marks the current one", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Boards" });
    expect(nav).toHaveTextContent("My board");
    expect(screen.getByRole("button", { name: "Launch" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "My board" })).not.toHaveAttribute("aria-current");
  });

  it("selects a board", async () => {
    const { onSelect } = renderNav();
    await userEvent.click(screen.getByRole("button", { name: "My board" }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("creates a board", async () => {
    const { onCreate } = renderNav();
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "  Roadmap  ");
    await userEvent.click(screen.getByRole("button", { name: /create board/i }));
    expect(onCreate).toHaveBeenCalledWith("Roadmap");
    expect(screen.queryByLabelText("Board name")).not.toBeInTheDocument();
  });

  it("does not create a board without a name", async () => {
    const { onCreate } = renderNav();
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: /create board/i }));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("renames the current board, starting from its name", async () => {
    const { onRename } = renderNav();
    await userEvent.click(screen.getByRole("button", { name: /rename board/i }));
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("Launch");
    await userEvent.clear(input);
    await userEvent.type(input, "Launch v2{Enter}");
    expect(onRename).toHaveBeenCalledWith("Launch v2");
  });

  it("cancels the form", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByLabelText("Board name")).not.toBeInTheDocument();
  });

  it("deletes the current board after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onDelete } = renderNav();
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Launch"));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("keeps the board when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onDelete } = renderNav();
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("cannot delete the only board", () => {
    renderNav({ boards: [boards[0]], currentId: 1 });
    expect(screen.getByRole("button", { name: /delete board/i })).toBeDisabled();
  });

  it("shows an error", () => {
    renderNav({ error: "Could not create the board." });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not create the board.");
  });

  describe("shared boards", () => {
    const shared = { id: 3, title: "Launch", owner: "bob", isOwner: false };

    it("shows who owns a shared board", () => {
      renderNav({ boards: [...boards, shared] });
      expect(screen.getByRole("button", { name: "Launch · bob" })).toBeInTheDocument();
    });

    it("hides owner-only actions on a shared board but keeps Share", async () => {
      const { onShare } = renderNav({ boards: [...boards, shared], currentId: 3 });
      expect(screen.queryByRole("button", { name: /rename board/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete board/i })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Share" }));
      expect(onShare).toHaveBeenCalledOnce();
    });

    it("does not count shared boards when deciding whether a board can be deleted", () => {
      renderNav({ boards: [boards[0], shared], currentId: 1 });
      expect(screen.getByRole("button", { name: /delete board/i })).toBeDisabled();
    });
  });
});
