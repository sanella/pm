import { act, render, screen, waitFor, within } from "@testing-library/react";
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
  render(<KanbanBoard boardId={1} username="user" onLogout={onLogout} onAccountDeleted={() => {}} />);
  await screen.findAllByTestId(/column-/i);
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

describe("KanbanBoard", () => {
  it("loads the board from the API", async () => {
    await renderBoard();
    expect(lastRequest()).toEqual({ path: "/api/boards/1", method: "GET", body: undefined });
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("shows a loading state until the board arrives", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<KanbanBoard boardId={1} username="user" onLogout={() => {}} onAccountDeleted={() => {}} />);
    expect(screen.getByText(/loading board/i)).toBeInTheDocument();
  });

  it("shows an error when the board cannot be loaded", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    render(<KanbanBoard boardId={1} username="user" onLogout={() => {}} onAccountDeleted={() => {}} />);
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
      path: "/api/boards/1/columns/col-backlog",
      method: "PATCH",
      body: { title: "New Name" },
    });
    expect(await screen.findByText("New Name")).toBeInTheDocument();
    expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue("New Name");
  });

  it("saves a column title on Enter", async () => {
    await renderBoard();
    respond(initialData);
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas{Enter}");
    expect(lastRequest()).toMatchObject({ method: "PATCH", body: { title: "Ideas" } });
    expect(input).not.toHaveFocus();
  });

  it("shows the saved column title again when a rename fails", async () => {
    await renderBoard();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Rejected{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save your change/i);
    expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue("Backlog");
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
      cards: { ...initialData.cards, "card-new": { id: "card-new", title: "New card", details: "Notes", priority: "none", dueDate: null, labels: [], checklist: [] } },
    });
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(lastRequest()).toEqual({
      path: "/api/boards/1/cards",
      method: "POST",
      body: {
        columnId: "col-backlog",
        title: "New card",
        details: "Notes",
        priority: "none",
        dueDate: null,
        labels: [],
      },
    });
    expect(await within(column).findByText("New card")).toBeInTheDocument();
  });

  it("shows card priority, due dates and labels", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-1");
    expect(within(card).getByText("High priority")).toBeInTheDocument();
    expect(within(card).getByText("Overdue: Jan 15, 2020")).toBeInTheDocument();
    expect(within(card).getByText("planning")).toBeInTheDocument();
    expect(within(screen.getByTestId("card-card-2")).getByText("Due Jun 30, 2099")).toBeInTheDocument();
  });

  it("adds a card with priority, due date and labels", async () => {
    await renderBoard();
    respond(initialData);
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByLabelText("Card title"), "Ship it");
    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "medium");
    await userEvent.type(within(column).getByLabelText("Due date"), "2026-12-24");
    await userEvent.type(within(column).getByLabelText("Labels"), "release, ops");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(lastRequest().body).toEqual({
      columnId: "col-backlog",
      title: "Ship it",
      details: "",
      priority: "medium",
      dueDate: "2026-12-24",
      labels: ["release", "ops"],
    });
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
    expect(lastRequest()).toEqual({ path: "/api/boards/1/cards/card-1", method: "DELETE", body: undefined });
    expect(await screen.findByRole("button", { name: /delete gather customer signals/i })).toBeInTheDocument();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("edits a card", async () => {
    await renderBoard();
    respond({
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { id: "card-1", title: "Updated title", details: "Updated details", priority: "none", dueDate: null, labels: [], checklist: [] },
      },
    });
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit align roadmap themes/i }));
    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");
    const detailsInput = within(card).getByLabelText("Card details");
    await userEvent.clear(detailsInput);
    await userEvent.type(detailsInput, "Updated details");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(lastRequest()).toEqual({
      path: "/api/boards/1/cards/card-1",
      method: "PATCH",
      // Card 1's other fields are sent unchanged.
      body: {
        title: "Updated title",
        details: "Updated details",
        priority: "high",
        dueDate: "2020-01-15",
        labels: ["planning", "q1"],
      },
    });
    expect(await within(card).findByText("Updated title")).toBeInTheDocument();
    expect(within(card).getByText("Updated details")).toBeInTheDocument();
  });

  it("does not save a card edit with a blank title", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit align roadmap themes/i }));
    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "   ");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));
    expect(within(card).getByLabelText("Card title")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("cancels editing without changes", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit align roadmap themes/i }));
    const titleInput = within(card).getByLabelText("Card title");
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

  it("shows cards the AI assistant adds without a reload", async () => {
    await renderBoard();
    const board: BoardData = {
      columns: initialData.columns.map((column, index) =>
        index === 4 ? { ...column, cardIds: [...column.cardIds, "card-ai"] } : column
      ),
      cards: { ...initialData.cards, "card-ai": { id: "card-ai", title: "From the AI", details: "", priority: "none", dueDate: null, labels: [], checklist: [] } },
    };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ message: "Added it.", board }) });

    await userEvent.click(screen.getByRole("button", { name: /ai assistant/i }));
    await userEvent.type(screen.getByLabelText("Message"), "Add a card to Done");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(lastRequest()).toEqual({
      path: "/api/boards/1/chat",
      method: "POST",
      body: { message: "Add a card to Done", history: [] },
    });
    expect(await screen.findByText("Added it.")).toBeInTheDocument();
    expect(within(screen.getByTestId("column-col-done")).getByText("From the AI")).toBeInTheDocument();
  });

  it("adds a column", async () => {
    await renderBoard();
    respond({ ...initialData, columns: [...initialData.columns, { id: "col-new", title: "Blocked", cardIds: [] }] });
    await userEvent.click(screen.getByRole("button", { name: /add column/i }));
    await userEvent.type(screen.getByLabelText("New column name"), "Blocked{Enter}");

    expect(lastRequest()).toEqual({ path: "/api/boards/1/columns", method: "POST", body: { title: "Blocked" } });
    expect(await screen.findByTestId("column-col-new")).toBeInTheDocument();
  });

  it("moves columns left and right, but not past the ends", async () => {
    await renderBoard();
    expect(screen.getByRole("button", { name: "Move column Backlog left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move column Done right" })).toBeDisabled();

    const [backlog, discovery, ...rest] = initialData.columns;
    respond({ ...initialData, columns: [discovery, backlog, ...rest] });
    await userEvent.click(screen.getByRole("button", { name: "Move column Backlog right" }));
    expect(lastRequest()).toEqual({
      path: "/api/boards/1/columns/col-backlog/move",
      method: "POST",
      body: { position: 1 },
    });
    await waitFor(() =>
      expect(screen.getAllByTestId(/^column-/).map((el) => el.dataset.testid)).toEqual([
        "column-col-discovery",
        "column-col-backlog",
        "column-col-progress",
        "column-col-review",
        "column-col-done",
      ])
    );

    respond(initialData);
    await userEvent.click(screen.getByRole("button", { name: "Move column Done left" }));
    expect(lastRequest().body).toEqual({ position: 3 });
  });

  it("deletes a column, moving its cards", async () => {
    await renderBoard();
    respond({ ...initialData, columns: initialData.columns.slice(1) });
    await userEvent.click(screen.getByRole("button", { name: "Delete column Backlog" }));
    await userEvent.selectOptions(screen.getByLabelText("What happens to the cards"), "Move to Done");
    await userEvent.click(screen.getByRole("button", { name: /^delete column$/i }));

    expect(lastRequest()).toEqual({
      path: "/api/boards/1/columns/col-backlog?moveTo=col-done",
      method: "DELETE",
      body: undefined,
    });
    await waitFor(() => expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument());
  });

  it("summarises the board", async () => {
    await renderBoard();
    const summary = screen.getByLabelText("Board summary");
    expect(within(summary).getByText("Cards").nextElementSibling).toHaveTextContent("8");
    expect(within(summary).getByText("Overdue").nextElementSibling).toHaveTextContent("1");
    expect(within(summary).getByText("High priority").nextElementSibling).toHaveTextContent("1");
  });

  it("filters cards by text and clears the filter", async () => {
    await renderBoard();
    await userEvent.type(screen.getByLabelText("Search cards"), "customer");

    expect(screen.getByText("Gather customer signals")).toBeInTheDocument();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(within(screen.getByRole("search", { name: "Filter cards" })).getByRole("status")).toHaveTextContent(
      "Showing 1 of 8 cards"
    );
    expect(within(getFirstColumn()).getByText("1 of 2 cards")).toBeInTheDocument();
    expect(within(screen.getByTestId("column-col-done")).getByText("No matching cards")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(screen.getByLabelText("Search cards")).toHaveValue("");
  });

  it("filters by label, priority and overdue", async () => {
    await renderBoard();
    await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "planning");
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(["Align roadmap themes"]);

    await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "");
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "low");
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(["Gather customer signals"]);

    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "any");
    await userEvent.click(screen.getByLabelText("Overdue only"));
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(["Align roadmap themes"]);
  });

  it("opens a card's details and the board activity", async () => {
    await renderBoard();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await userEvent.click(screen.getByRole("button", { name: "Details for Align roadmap themes" }));
    const comments = await screen.findByRole("dialog", { name: "Align roadmap themes" });
    expect(lastRequest().path).toBe("/api/boards/1/cards/card-1/comments");
    await userEvent.click(within(comments).getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await userEvent.click(screen.getByRole("button", { name: /^activity$/i }));
    const activity = await screen.findByRole("dialog", { name: "Activity" });
    expect(lastRequest().path).toBe("/api/boards/1/activity");
    await userEvent.click(within(activity).getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("saves checklist changes from the card details", async () => {
    await renderBoard();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await userEvent.click(screen.getByRole("button", { name: "Details for Align roadmap themes" }));
    const dialog = await screen.findByRole("dialog", { name: "Align roadmap themes" });
    expect(within(screen.getByTestId("card-card-1")).getByText("Checklist 1/2")).toBeInTheDocument();

    const checked: BoardData = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": {
          ...initialData.cards["card-1"],
          checklist: initialData.cards["card-1"].checklist.map((item) => ({ ...item, done: true })),
        },
      },
    };
    respond(checked);
    await userEvent.click(within(dialog).getByLabelText("Write themes"));
    expect(lastRequest()).toEqual({
      path: "/api/boards/1/cards/card-1/checklist/item-2",
      method: "PATCH",
      body: { done: true },
    });
    expect(await within(screen.getByTestId("card-card-1")).findByText("Checklist 2/2")).toBeInTheDocument();

    respond(initialData);
    await userEvent.type(within(dialog).getByLabelText("New checklist item"), "Share{Enter}");
    expect(lastRequest()).toEqual({
      path: "/api/boards/1/cards/card-1/checklist",
      method: "POST",
      body: { text: "Share" },
    });

    respond(initialData);
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove item: Collect metrics" }));
    expect(lastRequest()).toEqual({
      path: "/api/boards/1/cards/card-1/checklist/item-1",
      method: "DELETE",
      body: undefined,
    });
  });

  it("ticks a checklist item at once and unticks it if saving fails", async () => {
    await renderBoard();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await userEvent.click(screen.getByRole("button", { name: "Details for Align roadmap themes" }));
    const dialog = await screen.findByRole("dialog", { name: "Align roadmap themes" });

    let reply: (value: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (reply = resolve)));
    await userEvent.click(within(dialog).getByLabelText("Write themes"));
    expect(within(dialog).getByLabelText("Write themes")).toBeChecked();

    await act(async () => reply({ ok: false, status: 500 }));
    expect(within(dialog).getByLabelText("Write themes")).not.toBeChecked();
    expect(screen.getAllByRole("alert").some((el) => /could not save/i.test(el.textContent ?? ""))).toBe(true);
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
