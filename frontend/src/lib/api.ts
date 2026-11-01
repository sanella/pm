import type { BoardData } from "@/lib/kanban";

export const getCurrentUser = async (): Promise<string | null> => {
  const response = await fetch("/api/auth/me");
  if (!response.ok) {
    return null;
  }
  const data: { username: string } = await response.json();
  return data.username;
};

export const login = async (
  username: string,
  password: string
): Promise<boolean> => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return response.ok;
};

export const logout = async () => {
  await fetch("/api/auth/logout", { method: "POST" });
};

// Every board route returns the full updated board.
const boardRequest = async (
  path: string,
  method = "GET",
  body?: unknown
): Promise<BoardData> => {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}`);
  }
  return response.json();
};

export const getBoard = () => boardRequest("/api/board");

export const renameColumn = (columnId: string, title: string) =>
  boardRequest(`/api/columns/${columnId}`, "PATCH", { title });

export const createCard = (columnId: string, title: string, details: string) =>
  boardRequest("/api/cards", "POST", { columnId, title, details });

export const updateCard = (cardId: string, title: string, details: string) =>
  boardRequest(`/api/cards/${cardId}`, "PATCH", { title, details });

export const deleteCard = (cardId: string) =>
  boardRequest(`/api/cards/${cardId}`, "DELETE");

export const moveCard = (cardId: string, columnId: string, position: number) =>
  boardRequest(`/api/cards/${cardId}/move`, "POST", { columnId, position });
