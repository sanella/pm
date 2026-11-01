import { act, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";

// jsdom cannot run a real dnd-kit drag (every element measures 0x0), so DndContext is
// replaced by a stand-in that keeps the handlers the board gives it.
type DragHandlers = {
  onDragStart: (event: { active: { id: string } }) => void;
  onDragEnd: (event: { active: { id: string }; over: { id: string } | null }) => void;
};
let handlers: DragHandlers;

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({ children, ...props }: DragHandlers & { children: ReactNode }) => {
      handlers = props;
      return <>{children}</>;
    },
    DragOverlay: ({ children }: { children: ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  };
});

const fetchMock = vi.fn();

const renderBoard = async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => initialData });
  render(<KanbanBoard boardId={1} username="user" onLogout={() => {}} onAccountDeleted={() => {}} />);
  await screen.findAllByTestId(/^column-/);
};

const cardsIn = (columnId: string) =>
  within(screen.getByTestId(`column-${columnId}`))
    .queryAllByRole("heading", { level: 4 })
    .map((heading) => heading.textContent);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

describe("KanbanBoard dragging", () => {
  it("shows the dragged card in the overlay", async () => {
    await renderBoard();
    act(() => handlers.onDragStart({ active: { id: "card-3" } }));
    expect(within(screen.getByTestId("drag-overlay")).getByText("Prototype analytics view")).toBeInTheDocument();

    act(() => handlers.onDragEnd({ active: { id: "card-3" }, over: null }));
    expect(screen.getByTestId("drag-overlay")).toBeEmptyDOMElement();
  });

  it("moves the card at once and saves the move", async () => {
    await renderBoard();
    // The server's answer arrives later; the card must already be in place.
    let respond: (value: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));

    act(() => handlers.onDragEnd({ active: { id: "card-1" }, over: { id: "col-done" } }));

    expect(cardsIn("col-done")).toEqual(["Ship marketing page", "Close onboarding sprint", "Align roadmap themes"]);
    const [path, init] = fetchMock.mock.calls.at(-1)!;
    expect(path).toBe("/api/boards/1/cards/card-1/move");
    expect(JSON.parse(init.body)).toEqual({ columnId: "col-done", position: 2 });
    await act(async () => respond({ ok: true, json: async () => initialData }));
    // The board then shows what the server returned.
    expect(cardsIn("col-backlog")).toEqual(["Align roadmap themes", "Gather customer signals"]);
  });

  it("puts the card back and shows an error when the move fails", async () => {
    await renderBoard();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    await act(async () => handlers.onDragEnd({ active: { id: "card-1" }, over: { id: "card-7" } }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save your change/i);
    expect(cardsIn("col-backlog")).toEqual(["Align roadmap themes", "Gather customer signals"]);
    expect(cardsIn("col-done")).toEqual(["Ship marketing page", "Close onboarding sprint"]);
  });

  it("sends nothing when the card is dropped where it was", async () => {
    await renderBoard();
    act(() => handlers.onDragEnd({ active: { id: "card-1" }, over: { id: "card-1" } }));
    act(() => handlers.onDragEnd({ active: { id: "card-2" }, over: null }));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
