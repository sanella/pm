import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard onLogout={() => {}} />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
    // Saved on blur: the header chip shows the new title.
    await userEvent.tab();
    expect(screen.getAllByText("New Name")).toHaveLength(1);
    expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue("New Name");
  });

  it("saves a column title on Enter", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas{Enter}");
    expect(screen.getByText("Ideas")).toBeInTheDocument();
  });

  it("reverts an empty column title", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "   ");
    await userEvent.tab();
    expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue("Backlog");
  });

  it("does not add a card with a blank title", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const column = getFirstColumn();
    const before = within(column).getAllByRole("button", { name: /^drag /i }).length;
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "   ");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
    expect(within(column).getAllByRole("button", { name: /^drag /i })).toHaveLength(before);
  });

  it("does not save a card edit with a blank title", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: /edit align roadmap themes/i })
    );
    const titleInput = within(card).getByLabelText("Edit card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "   ");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));
    expect(within(card).getByLabelText("Edit card title")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: /cancel/i }));
    expect(within(card).getByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("uses singular and plural card counts", () => {
    render(<KanbanBoard onLogout={() => {}} />);
    expect(within(screen.getByTestId("column-col-discovery")).getByText("1 card")).toBeInTheDocument();
    expect(within(getFirstColumn()).getByText("2 cards")).toBeInTheDocument();
  });

  it("gives each card a labelled drag handle and keeps buttons out of it", () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const card = screen.getByTestId("card-card-1");
    expect(card).not.toHaveAttribute("role");
    expect(
      within(card).getByRole("button", { name: "Drag Align roadmap themes" })
    ).toBeInTheDocument();
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("edits a card", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: /edit align roadmap themes/i })
    );

    const titleInput = within(card).getByLabelText("Edit card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");
    const detailsInput = within(card).getByLabelText("Edit card details");
    await userEvent.clear(detailsInput);
    await userEvent.type(detailsInput, "Updated details");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(within(card).getByText("Updated title")).toBeInTheDocument();
    expect(within(card).getByText("Updated details")).toBeInTheDocument();
    expect(within(card).queryByLabelText("Edit card title")).not.toBeInTheDocument();
  });

  it("cancels editing without changes", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: /edit align roadmap themes/i })
    );
    const titleInput = within(card).getByLabelText("Edit card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Discarded");
    await userEvent.click(within(card).getByRole("button", { name: /cancel/i }));

    expect(within(card).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(card).queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("calls onLogout when log out is clicked", async () => {
    const onLogout = vi.fn();
    render(<KanbanBoard onLogout={onLogout} />);
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
