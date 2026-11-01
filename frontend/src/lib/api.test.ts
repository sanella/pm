import {
  createCard,
  deleteCard,
  getBoard,
  moveCard,
  renameColumn,
  updateCard,
} from "@/lib/api";
import { initialData } from "@/lib/kanban";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => initialData });
});

describe("board api", () => {
  it.each([
    ["getBoard", () => getBoard(), "/api/board", "GET", undefined],
    [
      "renameColumn",
      () => renameColumn("col-a", "Ideas"),
      "/api/columns/col-a",
      "PATCH",
      { title: "Ideas" },
    ],
    [
      "createCard",
      () => createCard("col-a", "Title", "Details"),
      "/api/cards",
      "POST",
      { columnId: "col-a", title: "Title", details: "Details" },
    ],
    [
      "updateCard",
      () => updateCard("card-1", "Title", "Details"),
      "/api/cards/card-1",
      "PATCH",
      { title: "Title", details: "Details" },
    ],
    ["deleteCard", () => deleteCard("card-1"), "/api/cards/card-1", "DELETE", undefined],
    [
      "moveCard",
      () => moveCard("card-1", "col-b", 2),
      "/api/cards/card-1/move",
      "POST",
      { columnId: "col-b", position: 2 },
    ],
  ])("%s calls its route and returns the board", async (_, call, path, method, body) => {
    expect(await call()).toEqual(initialData);
    const [calledPath, init] = fetchMock.mock.calls[0];
    expect(calledPath).toBe(path);
    expect(init.method).toBe(method);
    expect(init.body && JSON.parse(init.body)).toEqual(body);
  });

  it("throws when the request fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await expect(deleteCard("missing")).rejects.toThrow("404");
  });
});
