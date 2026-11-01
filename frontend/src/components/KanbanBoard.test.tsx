import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

const fetchMock = vi.fn();

const respond = (board: BoardData) =>
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => board });

const lastRequest = () => {
  const [path, init] = fetchMock.mock.calls.at(-1)!;
  return { path, method: init?.method, body: init?.body && JSON.parse(init.body) };
};

// Renders the board loaded from the (mocked) API.
const renderBoard = async (onLogout = () => {}) => {
  respond(initialData);
  render(<KanbanBoard onLogout={onLogout} />);
  await screen.findAllByTestId(/column-/i);
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

describe("KanbanBoard", () => {
  it("loads the board from the API", async () => {
    await renderBoard();
    expect(lastRequest()).toEqual({ path: "/api/board", method: "GET", body: undefined });
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("shows a loading state until the board arrives", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<KanbanBoard onLogout={() => {}} />);
    expect(screen.getByText(/loading board/i)).toBeInTheDocument();
  });

  it("shows an error when the board cannot be loaded", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    render(<KanbanBoard onLogout={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the board/i);
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("renames a column", async () => {
    await renderBoard();
    respond({
      ...initialData,
      columns: initialData.columns.map((column, index) =>
        index === 0 ? { ...column, title: "New Name" } : column
      ),
    });
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    // Saved on blur: the header chip shows the new title.
    await userEvent.tab();
    expect(lastRequest()).toEqual({
      path: "/api/columns/col-backlog",
      method: "PATCH",
      body: { title: "New Name" },
    });
    expect(await screen.findByText("New Name")).toBeInTheDocument();
    expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue("New Name");
  });

  it("reverts an empty column title without a request", async () => {
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "   ");
    await userEvent.tab();
    expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue("Backlog");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("adds a card", async () => {
    await renderBoard();
    respond({
      columns: initialData.columns.map((column, index) =>
        index === 0 ? { ...column, cardIds: [...column.cardIds, "card-new"] } : column
      ),
      cards: { ...initialData.cards, "card-new": { id: "card-new", title: "New card", details: "Notes" } },
    });
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(lastRequest()).toEqual({
      path: "/api/cards",
      method: "POST",
      body: { columnId: "col-backlog", title: "New card", details: "Notes" },
    });
    expect(await within(column).findByText("New card")).toBeInTheDocument();
  });

  it("does not add a card with a blank title", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "   ");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("deletes a card", async () => {
    await renderBoard();
    respond({
      columns: initialData.columns.map((column) => ({
        ...column,
        cardIds: column.cardIds.filter((id) => id !== "card-1"),
      })),
      cards: Object.fromEntries(
        Object.entries(initialData.cards).filter(([id]) => id !== "card-1")
      ),
    });
    await userEvent.click(screen.getByRole("button", { name: /delete align roadmap themes/i }));
    expect(lastRequest()).toEqual({ path: "/api/cards/card-1", method: "DELETE", body: undefined });
    expect(await screen.findByRole("button", { name: /delete gather customer signals/i })).toBeInTheDocument();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("edits a card", async () => {
    await renderBoard();
    respond({
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { id: "card-1", title: "Updated title", details: "Updated details" },
      },
    });
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit align roadmap themes/i }));
    const titleInput = within(card).getByLabelText("Edit card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");
    const detailsInput = within(card).getByLabelText("Edit card details");
    await userEvent.clear(detailsInput);
    await userEvent.type(detailsInput, "Updated details");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(lastRequest()).toEqual({
      path: "/api/cards/card-1",
      method: "PATCH",
      body: { title: "Updated title", details: "Updated details" },
    });
    expect(await within(card).findByText("Updated title")).toBeInTheDocument();
    expect(within(card).getByText("Updated details")).toBeInTheDocument();
  });

  it("does not save a card edit with a blank title", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit align roadmap themes/i }));
    const titleInput = within(card).getByLabelText("Edit card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "   ");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));
    expect(within(card).getByLabelText("Edit card title")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("cancels editing without changes", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit align roadmap themes/i }));
    const titleInput = within(card).getByLabelText("Edit card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Discarded");
    await userEvent.click(within(card).getByRole("button", { name: /cancel/i }));

    expect(within(card).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(card).queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("shows an error and keeps the board when a change fails", async () => {
    await renderBoard();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await userEvent.click(screen.getByRole("button", { name: /delete align roadmap themes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save your change/i);
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("uses singular and plural card counts", async () => {
    await renderBoard();
    expect(within(screen.getByTestId("column-col-discovery")).getByText("1 card")).toBeInTheDocument();
    expect(within(getFirstColumn()).getByText("2 cards")).toBeInTheDocument();
  });

  it("gives each card a labelled drag handle and keeps buttons out of it", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-1");
    expect(card).not.toHaveAttribute("role");
    expect(within(card).getByRole("button", { name: "Drag Align roadmap themes" })).toBeInTheDocument();
  });

  it("calls onLogout when log out is clicked", async () => {
    const onLogout = vi.fn();
    await renderBoard(onLogout);
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
