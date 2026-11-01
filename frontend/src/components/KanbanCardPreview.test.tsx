import { render, screen } from "@testing-library/react";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { initialData } from "@/lib/kanban";

describe("KanbanCardPreview", () => {
  it("shows the dragged card with its details and fields", () => {
    render(<KanbanCardPreview card={initialData.cards["card-1"]} />);
    expect(screen.getByRole("heading", { name: "Align roadmap themes" })).toBeInTheDocument();
    expect(screen.getByText(/quarterly themes/)).toBeInTheDocument();
    expect(screen.getByText("High priority")).toBeInTheDocument();
  });

  it("leaves out empty details", () => {
    const card = { ...initialData.cards["card-3"], details: "" };
    const { container } = render(<KanbanCardPreview card={card} />);
    expect(container.querySelector("p")).toBeNull();
  });
});
