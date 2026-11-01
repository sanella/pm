import {
  addChecklistItem,
  addColumn,
  addComment,
  addMember,
  changePassword,
  createBoard,
  createCard,
  deleteAccount,
  deleteBoard,
  deleteCard,
  deleteChecklistItem,
  deleteColumn,
  deleteComment,
  getBoard,
  getCurrentUser,
  listActivity,
  listBoards,
  listComments,
  listMembers,
  login,
  logout,
  moveCard,
  moveColumn,
  register,
  removeMember,
  RequestError,
  renameBoard,
  renameColumn,
  sendChat,
  updateCard,
  updateChecklistItem,
} from "@/lib/api";
import { initialData } from "@/lib/kanban";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => initialData });
});

describe("board api", () => {
  it.each([
    ["getBoard", () => getBoard(3), "/api/boards/3", "GET", undefined],
    [
      "renameColumn",
      () => renameColumn(3, "col-a", "Ideas"),
      "/api/boards/3/columns/col-a",
      "PATCH",
      { title: "Ideas" },
    ],
    [
      "createCard",
      () =>
        createCard(3, "col-a", {
          title: "Title",
          details: "Details",
          priority: "high",
          dueDate: "2026-12-24",
          labels: ["ux"],
        }),
      "/api/boards/3/cards",
      "POST",
      {
        columnId: "col-a",
        title: "Title",
        details: "Details",
        priority: "high",
        dueDate: "2026-12-24",
        labels: ["ux"],
      },
    ],
    [
      "updateCard",
      () => updateCard(3, "card-1", { priority: "low", dueDate: null }),
      "/api/boards/3/cards/card-1",
      "PATCH",
      { priority: "low", dueDate: null },
    ],
    ["deleteCard", () => deleteCard(3, "card-1"), "/api/boards/3/cards/card-1", "DELETE", undefined],
    [
      "moveCard",
      () => moveCard(3, "card-1", "col-b", 2),
      "/api/boards/3/cards/card-1/move",
      "POST",
      { columnId: "col-b", position: 2 },
    ],
    [
      "sendChat",
      () => sendChat(3, "Hi", [{ role: "user", content: "Earlier" }]),
      "/api/boards/3/chat",
      "POST",
      { message: "Hi", history: [{ role: "user", content: "Earlier" }] },
    ],
    ["addColumn", () => addColumn(3, "Blocked"), "/api/boards/3/columns", "POST", { title: "Blocked" }],
    [
      "moveColumn",
      () => moveColumn(3, "col-a", 2),
      "/api/boards/3/columns/col-a/move",
      "POST",
      { position: 2 },
    ],
    [
      "deleteColumn with its cards",
      () => deleteColumn(3, "col-a", null),
      "/api/boards/3/columns/col-a",
      "DELETE",
      undefined,
    ],
    [
      "deleteColumn moving its cards",
      () => deleteColumn(3, "col-a", "col-b"),
      "/api/boards/3/columns/col-a?moveTo=col-b",
      "DELETE",
      undefined,
    ],
    ["listMembers", () => listMembers(3), "/api/boards/3/members", "GET", undefined],
    ["addMember", () => addMember(3, "bob"), "/api/boards/3/members", "POST", { username: "bob" }],
    ["removeMember", () => removeMember(3, "bo b"), "/api/boards/3/members/bo%20b", "DELETE", undefined],
    ["listActivity", () => listActivity(3), "/api/boards/3/activity", "GET", undefined],
    ["listComments", () => listComments(3, "card-1"), "/api/boards/3/cards/card-1/comments", "GET", undefined],
    [
      "addComment",
      () => addComment(3, "card-1", "Hi"),
      "/api/boards/3/cards/card-1/comments",
      "POST",
      { text: "Hi" },
    ],
    [
      "deleteComment",
      () => deleteComment(3, "card-1", "comment-1"),
      "/api/boards/3/cards/card-1/comments/comment-1",
      "DELETE",
      undefined,
    ],
    [
      "addChecklistItem",
      () => addChecklistItem(3, "card-1", "Step"),
      "/api/boards/3/cards/card-1/checklist",
      "POST",
      { text: "Step" },
    ],
    [
      "updateChecklistItem",
      () => updateChecklistItem(3, "card-1", "item-1", { done: true }),
      "/api/boards/3/cards/card-1/checklist/item-1",
      "PATCH",
      { done: true },
    ],
    [
      "deleteChecklistItem",
      () => deleteChecklistItem(3, "card-1", "item-1"),
      "/api/boards/3/cards/card-1/checklist/item-1",
      "DELETE",
      undefined,
    ],
    ["listBoards", () => listBoards(), "/api/boards", "GET", undefined],
    ["createBoard", () => createBoard("Launch"), "/api/boards", "POST", { title: "Launch" }],
    ["renameBoard", () => renameBoard(3, "Roadmap"), "/api/boards/3", "PATCH", { title: "Roadmap" }],
    ["deleteBoard", () => deleteBoard(3), "/api/boards/3", "DELETE", undefined],
  ])("%s calls its route and returns the response", async (_, call, path, method, body) => {
    expect(await call()).toEqual(initialData);
    const [calledPath, init] = fetchMock.mock.calls[0];
    expect(calledPath).toBe(path);
    expect(init.method).toBe(method);
    expect(init.body && JSON.parse(init.body)).toEqual(body);
  });

  it("throws when the request fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await expect(deleteCard(3, "missing")).rejects.toThrow("404");
    await expect(deleteCard(3, "missing")).rejects.toBeInstanceOf(RequestError);
    await expect(deleteCard(3, "missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("account api", () => {
  it.each([
    ["register", () => register("alice", "secret-pass"), "/api/auth/register", { username: "alice", password: "secret-pass" }],
    ["changePassword", () => changePassword("old", "new-password"), "/api/auth/password", { currentPassword: "old", newPassword: "new-password" }],
    ["deleteAccount", () => deleteAccount("secret-pass"), "/api/auth/delete-account", { password: "secret-pass" }],
  ])("%s posts to its route and returns null on success", async (_, call, path, body) => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    expect(await call()).toBeNull();
    const [calledPath, init] = fetchMock.mock.calls[0];
    expect(calledPath).toBe(path);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it.each([
    [() => register("alice", "secret-pass"), 409, "That username is taken."],
    [() => register("a", "x"), 422, /3-32 letters/],
    [() => changePassword("bad", "new-password"), 403, "The current password is wrong."],
    [() => changePassword("old", "x"), 422, /at least 8 characters/],
    [() => deleteAccount("bad"), 403, "The password is wrong."],
  ])("returns a message for a refused request (%#)", async (call, status, message) => {
    fetchMock.mockResolvedValue({ ok: false, status });
    expect(await call()).toMatch(message);
  });

  it("throws on unexpected failures", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(register("alice", "secret-pass")).rejects.toThrow("500");
  });
});

describe("auth api", () => {
  it("returns the signed-in username, or null when signed out", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ username: "alice" }) });
    expect(await getCurrentUser()).toBe("alice");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me");

    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    expect(await getCurrentUser()).toBeNull();
  });

  it("logs in and returns the registered name, or null", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ username: "Alice" }) });
    expect(await login("alice", "secret-pass")).toBe("Alice");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/auth/login");
    expect(JSON.parse(init.body)).toEqual({ username: "alice", password: "secret-pass" });

    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    expect(await login("alice", "wrong")).toBeNull();
  });

  it("logs out", async () => {
    await logout();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });
});
