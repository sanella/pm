export type Priority = "none" | "low" | "medium" | "high";

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority;
  // ISO date (YYYY-MM-DD) or null.
  dueDate: string | null;
  labels: string[];
  checklist: ChecklistItem[];
};

// Everything set through the card form (the checklist has its own routes).
export type CardFields = Omit<Card, "id" | "checklist">;

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

export const initialData: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
      priority: "high",
      // Always in the past, so tests can rely on it being overdue.
      dueDate: "2020-01-15",
      labels: ["planning", "q1"],
      checklist: [
        { id: "item-1", text: "Collect metrics", done: true },
        { id: "item-2", text: "Write themes", done: false },
      ],
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
      priority: "low",
      dueDate: "2099-06-30",
      labels: [],
      checklist: [],
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
      priority: "none",
      dueDate: null,
      labels: [],
      checklist: [],
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
      priority: "none",
      dueDate: null,
      labels: [],
      checklist: [],
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
      priority: "none",
      dueDate: null,
      labels: [],
      checklist: [],
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
      priority: "none",
      dueDate: null,
      labels: [],
      checklist: [],
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
      priority: "none",
      dueDate: null,
      labels: [],
      checklist: [],
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
      priority: "none",
      dueDate: null,
      labels: [],
      checklist: [],
    },
  },
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

// The result of dropping card `activeId` on `overId` (a card or column id): the new columns
// and where the card lands, as the backend move route expects it; null when nothing moves.
export const planMove = (columns: Column[], activeId: string, overId: string) => {
  if (activeId === overId) {
    return null;
  }
  const next = moveCard(columns, activeId, overId);
  const target = findCardPosition(next, activeId);
  return next === columns || !target ? null : { columns: next, ...target };
};

// Where a card sits, as the backend move route expects it.
export const findCardPosition = (columns: Column[], cardId: string) => {
  const column = columns.find((column) => column.cardIds.includes(cardId));
  return column && { columnId: column.id, position: column.cardIds.indexOf(cardId) };
};

const pad = (value: number) => String(value).padStart(2, "0");

// Today's date in the user's time zone, as YYYY-MM-DD.
export const todayISO = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

// ISO dates compare correctly as strings.
export const isOverdue = (dueDate: string | null, today = todayISO()) =>
  dueDate !== null && dueDate < today;

// "Dec 24, 2026"; built from the parts so the date does not shift with the time zone.
export const formatDueDate = (dueDate: string) => {
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// "design, Research, design" -> ["design", "Research"] (repeats ignore case).
export const parseLabels = (text: string) => {
  const labels: string[] = [];
  for (const label of text.split(",").map((part) => part.trim())) {
    if (label && !labels.some((seen) => seen.toLowerCase() === label.toLowerCase())) {
      labels.push(label);
    }
  }
  return labels;
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export type CardFilter = {
  // Matches title, details or a label, ignoring case.
  text: string;
  priority: Priority | "any";
  // "" for any label.
  label: string;
  overdueOnly: boolean;
};

export const emptyFilter: CardFilter = { text: "", priority: "any", label: "", overdueOnly: false };

export const isFilterActive = (filter: CardFilter) =>
  filter.text.trim() !== "" ||
  filter.priority !== "any" ||
  filter.label !== "" ||
  filter.overdueOnly;

export const matchesFilter = (card: Card, filter: CardFilter, today = todayISO()) => {
  const text = filter.text.trim().toLowerCase();
  if (
    text &&
    ![card.title, card.details, ...card.labels].some((value) => value.toLowerCase().includes(text))
  ) {
    return false;
  }
  if (filter.priority !== "any" && card.priority !== filter.priority) {
    return false;
  }
  if (filter.label && !card.labels.some((label) => label.toLowerCase() === filter.label.toLowerCase())) {
    return false;
  }
  return !filter.overdueOnly || isOverdue(card.dueDate, today);
};

// Every label used on the board, once each (ignoring case), sorted.
export const boardLabels = (board: BoardData) =>
  parseLabels(Object.values(board.cards).flatMap((card) => card.labels).join(",")).sort((a, b) =>
    a.localeCompare(b)
  );

// The ISO date `days` after `iso`.
export const addDays = (iso: string, days: number) => {
  const [year, month, day] = iso.split("-").map(Number);
  return todayISO(new Date(year, month - 1, day + days));
};

export const boardSummary = (board: BoardData, today = todayISO()) => {
  const cards = Object.values(board.cards);
  const weekEnd = addDays(today, 7);
  return {
    total: cards.length,
    overdue: cards.filter((card) => isOverdue(card.dueDate, today)).length,
    // Due today or within the next 7 days.
    dueSoon: cards.filter((card) => card.dueDate && card.dueDate >= today && card.dueDate <= weekEnd)
      .length,
    highPriority: cards.filter((card) => card.priority === "high").length,
  };
};

// "Mar 10, 2:05 PM" in the user's time zone, from an ISO timestamp.
export const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
