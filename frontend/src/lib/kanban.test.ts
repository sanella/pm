import { findCardPosition, moveCard, type Column } from "@/lib/kanban";

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
