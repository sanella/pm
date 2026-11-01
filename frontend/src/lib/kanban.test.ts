import {
  addDays,
  boardLabels,
  boardSummary,
  emptyFilter,
  findCardPosition,
  isFilterActive,
  matchesFilter,
  formatDueDate,
  formatTimestamp,
  isOverdue,
  moveCard,
  parseLabels,
  planMove,
  todayISO,
  type BoardData,
  type Card,
  type CardFilter,
  type Column,
} from "@/lib/kanban";

describe("findCardPosition", () => {
  const columns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: [] },
  ];

  it("returns the column and index of a card", () => {
    expect(findCardPosition(columns, "card-2")).toEqual({ columnId: "col-a", position: 1 });
  });

  it("returns undefined for an unknown card", () => {
    expect(findCardPosition(columns, "missing")).toBeUndefined();
  });
});

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("returns the columns unchanged for unknown ids", () => {
    expect(moveCard(baseColumns, "missing", "col-b")).toBe(baseColumns);
    expect(moveCard(baseColumns, "card-1", "missing")).toBe(baseColumns);
  });

  it("returns the columns unchanged when dropping a card on itself", () => {
    expect(moveCard(baseColumns, "card-1", "card-1")).toBe(baseColumns);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("card field helpers", () => {
  it("gives today's local date as YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("is overdue only before today", () => {
    expect(isOverdue("2026-01-04", "2026-01-05")).toBe(true);
    expect(isOverdue("2026-01-05", "2026-01-05")).toBe(false);
    expect(isOverdue("2026-02-01", "2026-01-05")).toBe(false);
    expect(isOverdue(null, "2026-01-05")).toBe(false);
  });

  it("formats due dates without shifting the day", () => {
    expect(formatDueDate("2026-12-24")).toBe("Dec 24, 2026");
    expect(formatDueDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("parses comma separated labels", () => {
    expect(parseLabels(" design, Research ,, design, DESIGN ,ux ")).toEqual(["design", "Research", "ux"]);
    expect(parseLabels("   ")).toEqual([]);
  });
});

describe("filters and summary", () => {
  const card = (fields: Partial<Card>): Card => ({
    id: "card-x",
    title: "Write launch notes",
    details: "Covers the new API",
    priority: "medium",
    dueDate: null,
    labels: ["Docs", "release"],
    checklist: [],
    ...fields,
  });
  const today = "2026-03-10";

  it("matches everything without a filter", () => {
    expect(isFilterActive(emptyFilter)).toBe(false);
    expect(matchesFilter(card({}), emptyFilter, today)).toBe(true);
  });

  it.each([
    [{ text: "LAUNCH" }, true],
    [{ text: "api" }, true],
    [{ text: "docs" }, true],
    [{ text: "  " }, true],
    [{ text: "budget" }, false],
    [{ priority: "medium" }, true],
    [{ priority: "high" }, false],
    [{ label: "docs" }, true],
    [{ label: "Doc" }, false],
    [{ overdueOnly: true }, false],
  ] as [Partial<CardFilter>, boolean][])("filter %o matches: %s", (fields, expected) => {
    const filter = { ...emptyFilter, ...fields };
    expect(matchesFilter(card({}), filter, today)).toBe(expected);
  });

  it("combines filters and checks overdue against today", () => {
    const filter: CardFilter = { text: "launch", priority: "medium", label: "release", overdueOnly: true };
    expect(isFilterActive(filter)).toBe(true);
    expect(matchesFilter(card({ dueDate: "2026-03-09" }), filter, today)).toBe(true);
    expect(matchesFilter(card({ dueDate: "2026-03-10" }), filter, today)).toBe(false);
  });

  it("lists the board's labels once each, sorted", () => {
    const board: BoardData = {
      columns: [],
      cards: {
        a: card({ id: "a", labels: ["ux", "Docs"] }),
        b: card({ id: "b", labels: ["docs", "api"] }),
      },
    };
    expect(boardLabels(board)).toEqual(["api", "Docs", "ux"]);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-01-30", 7)).toBe("2026-02-06");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("summarises the board", () => {
    const board: BoardData = {
      columns: [],
      cards: {
        a: card({ id: "a", priority: "high", dueDate: "2026-03-01" }),
        b: card({ id: "b", priority: "high", dueDate: "2026-03-10" }),
        c: card({ id: "c", dueDate: "2026-03-17" }),
        d: card({ id: "d", dueDate: "2026-03-18" }),
        e: card({ id: "e" }),
      },
    };
    expect(boardSummary(board, today)).toEqual({ total: 5, overdue: 1, dueSoon: 2, highPriority: 2 });
  });
});

describe("moveCard edge cases and planMove", () => {
  const columns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2", "card-3"] },
    { id: "col-b", title: "B", cardIds: ["card-4"] },
    { id: "col-c", title: "C", cardIds: [] },
  ];

  it("moves a card to the end of its own column when dropped on that column", () => {
    expect(moveCard(columns, "card-1", "col-a")[0].cardIds).toEqual(["card-2", "card-3", "card-1"]);
  });

  it("reorders downwards within a column", () => {
    expect(moveCard(columns, "card-1", "card-3")[0].cardIds).toEqual(["card-2", "card-3", "card-1"]);
  });

  it("inserts before the card it is dropped on in another column, leaving other columns alone", () => {
    const result = moveCard(columns, "card-2", "card-4");
    expect(result.map((column) => column.cardIds)).toEqual([["card-1", "card-3"], ["card-2", "card-4"], []]);
    expect(result[2]).toBe(columns[2]);
  });

  it("plans a move with where the card lands", () => {
    expect(planMove(columns, "card-3", "col-c")).toEqual({
      columns: [
        { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
        columns[1],
        { id: "col-c", title: "C", cardIds: ["card-3"] },
      ],
      columnId: "col-c",
      position: 0,
    });
    expect(planMove(columns, "card-2", "card-1")).toMatchObject({ columnId: "col-a", position: 0 });
  });

  it("plans nothing when the card stays put or is unknown", () => {
    expect(planMove(columns, "card-1", "card-1")).toBeNull();
    expect(planMove(columns, "missing", "col-b")).toBeNull();
    expect(planMove(columns, "card-1", "missing")).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("shows a timestamp in local time", () => {
    expect(formatTimestamp(new Date(2026, 2, 10, 14, 5).toISOString())).toBe("Mar 10, 2:05 PM");
    expect(formatTimestamp(new Date(2026, 11, 1, 0, 30).toISOString())).toBe("Dec 1, 12:30 AM");
  });
});
