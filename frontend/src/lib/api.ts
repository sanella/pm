import type { BoardData, CardFields } from "@/lib/kanban";

export const getCurrentUser = async (): Promise<string | null> => {
  const response = await fetch("/api/auth/me");
  if (!response.ok) {
    return null;
  }
  const data: { username: string } = await response.json();
  return data.username;
};

// The username as registered (sign-in ignores case), or null for wrong credentials.
export const login = async (username: string, password: string): Promise<string | null> => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    return null;
  }
  const data: { username: string } = await response.json();
  return data.username;
};

export const logout = async () => {
  await fetch("/api/auth/logout", { method: "POST" });
};

// Every board content route returns the full updated board.
const boardRequest = (path: string, method = "GET", body?: unknown) =>
  jsonRequest<BoardData>(path, method, body);

export const getBoard = (boardId: number) => boardRequest(`/api/boards/${boardId}`);

export const renameColumn = (boardId: number, columnId: string, title: string) =>
  boardRequest(`/api/boards/${boardId}/columns/${columnId}`, "PATCH", { title });

export const createCard = (boardId: number, columnId: string, fields: CardFields) =>
  boardRequest(`/api/boards/${boardId}/cards`, "POST", { columnId, ...fields });

// Only the fields given are changed.
export const updateCard = (boardId: number, cardId: string, fields: Partial<CardFields>) =>
  boardRequest(`/api/boards/${boardId}/cards/${cardId}`, "PATCH", fields);

export const deleteCard = (boardId: number, cardId: string) =>
  boardRequest(`/api/boards/${boardId}/cards/${cardId}`, "DELETE");

export const moveCard = (boardId: number, cardId: string, columnId: string, position: number) =>
  boardRequest(`/api/boards/${boardId}/cards/${cardId}/move`, "POST", { columnId, position });

// `owner` is a username; `isOwner` is false for boards shared with the user.
export type BoardSummary = { id: number; title: string; owner: string; isOwner: boolean };

export type BoardMembers = { owner: string; members: string[] };

// A request the server refused; `status` lets callers explain known refusals.
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const jsonRequest = async <T>(path: string, method: string, body?: unknown): Promise<T> => {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new RequestError(`${method} ${path} failed with ${response.status}`, response.status);
  }
  return response.json();
};

export const listBoards = () => jsonRequest<BoardSummary[]>("/api/boards", "GET");

export const createBoard = (title: string) =>
  jsonRequest<BoardSummary>("/api/boards", "POST", { title });

export const renameBoard = (boardId: number, title: string) =>
  jsonRequest<BoardSummary>(`/api/boards/${boardId}`, "PATCH", { title });

export const deleteBoard = (boardId: number) =>
  jsonRequest<{ status: string }>(`/api/boards/${boardId}`, "DELETE");

export type ChatMessage = { role: "user" | "assistant"; content: string };

// `board` is the updated board when the AI changed it, otherwise null.
export const sendChat = (boardId: number, message: string, history: ChatMessage[]) =>
  jsonRequest<{ message: string; board: BoardData | null }>(
    `/api/boards/${boardId}/chat`,
    "POST",
    { message, history }
  );

const postJson = (path: string, body: unknown) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// Account actions return null on success or a message for the user; other failures throw.
const accountResult = async (
  response: Response,
  messages: Record<number, string>
): Promise<string | null> => {
  if (response.ok) {
    return null;
  }
  if (messages[response.status]) {
    return messages[response.status];
  }
  throw new Error(`Request failed with ${response.status}`);
};

export const register = async (username: string, password: string) =>
  accountResult(await postJson("/api/auth/register", { username, password }), {
    409: "That username is taken.",
    422: "Use 3-32 letters, digits, dots, dashes or underscores for the username, and at least 8 characters for the password.",
  });

export const changePassword = async (currentPassword: string, newPassword: string) =>
  accountResult(await postJson("/api/auth/password", { currentPassword, newPassword }), {
    403: "The current password is wrong.",
    422: "The new password needs at least 8 characters.",
  });

export const deleteAccount = async (password: string) =>
  accountResult(await postJson("/api/auth/delete-account", { password }), {
    403: "The password is wrong.",
  });

export const addColumn = (boardId: number, title: string) =>
  boardRequest(`/api/boards/${boardId}/columns`, "POST", { title });

export const moveColumn = (boardId: number, columnId: string, position: number) =>
  boardRequest(`/api/boards/${boardId}/columns/${columnId}/move`, "POST", { position });

// Without `moveCardsTo`, the column's cards are deleted with it.
export const deleteColumn = (boardId: number, columnId: string, moveCardsTo: string | null) =>
  boardRequest(
    `/api/boards/${boardId}/columns/${columnId}` +
      (moveCardsTo ? `?moveTo=${encodeURIComponent(moveCardsTo)}` : ""),
    "DELETE"
  );

export const listMembers = (boardId: number) =>
  jsonRequest<BoardMembers>(`/api/boards/${boardId}/members`, "GET");

export const addMember = (boardId: number, username: string) =>
  jsonRequest<BoardMembers>(`/api/boards/${boardId}/members`, "POST", { username });

// The owner removes anyone; a member removes themselves to leave the board.
export const removeMember = (boardId: number, username: string) =>
  jsonRequest<BoardMembers>(
    `/api/boards/${boardId}/members/${encodeURIComponent(username)}`,
    "DELETE"
  );

// `author` is null once that account has been deleted.
export type ActivityEntry = { id: number; author: string | null; message: string; createdAt: string };

export type CardComment = {
  id: string;
  author: string | null;
  text: string;
  createdAt: string;
  // The signed-in user's own comment, which they may delete.
  mine: boolean;
};

export const listActivity = (boardId: number) =>
  jsonRequest<ActivityEntry[]>(`/api/boards/${boardId}/activity`, "GET");

const commentsPath = (boardId: number, cardId: string) =>
  `/api/boards/${boardId}/cards/${cardId}/comments`;

export const listComments = (boardId: number, cardId: string) =>
  jsonRequest<CardComment[]>(commentsPath(boardId, cardId), "GET");

export const addComment = (boardId: number, cardId: string, text: string) =>
  jsonRequest<CardComment[]>(commentsPath(boardId, cardId), "POST", { text });

export const deleteComment = (boardId: number, cardId: string, commentId: string) =>
  jsonRequest<CardComment[]>(`${commentsPath(boardId, cardId)}/${commentId}`, "DELETE");

const checklistPath = (boardId: number, cardId: string) =>
  `/api/boards/${boardId}/cards/${cardId}/checklist`;

export const addChecklistItem = (boardId: number, cardId: string, text: string) =>
  boardRequest(checklistPath(boardId, cardId), "POST", { text });

export const updateChecklistItem = (
  boardId: number,
  cardId: string,
  itemId: string,
  changes: { text?: string; done?: boolean }
) => boardRequest(`${checklistPath(boardId, cardId)}/${itemId}`, "PATCH", changes);

export const deleteChecklistItem = (boardId: number, cardId: string, itemId: string) =>
  boardRequest(`${checklistPath(boardId, cardId)}/${itemId}`, "DELETE");
