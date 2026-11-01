import { render, screen } from "@testing-library/react";
import { CardMeta } from "@/components/CardMeta";
import type { Card } from "@/lib/kanban";

const card = (fields: Partial<Card>): Card => ({
  id: "card-1",
  title: "Card",
  details: "",
  priority: "none",
  dueDate: null,
  labels: [],
  checklist: [],
  ...fields,
});

describe("CardMeta", () => {
  it("renders nothing for a card without priority, due date or labels", () => {
    const { container } = render(<CardMeta card={card({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows priority, a future due date and labels", () => {
    render(<CardMeta card={card({ priority: "medium", dueDate: "2099-06-30", labels: ["ux", "api"] })} />);
    expect(screen.getByText("Medium priority")).toBeInTheDocument();
    expect(screen.getByText("Due Jun 30, 2099")).toBeInTheDocument();
    expect(screen.getByText("ux")).toBeInTheDocument();
    expect(screen.getByText("api")).toBeInTheDocument();
  });

  it("marks a past due date as overdue", () => {
    render(<CardMeta card={card({ dueDate: "2020-01-15" })} />);
    expect(screen.getByText("Overdue: Jan 15, 2020")).toBeInTheDocument();
  });

  it("shows checklist progress", () => {
    const item = (done: boolean) => ({ id: `item-${done}`, text: "Step", done });
    render(<CardMeta card={card({ checklist: [item(true), item(false)] })} />);
    expect(screen.getByLabelText("Checklist: 1 of 2 done")).toHaveTextContent("Checklist 1/2");
  });
});
