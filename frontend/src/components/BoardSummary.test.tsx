import { render, screen, within } from "@testing-library/react";
import { BoardSummary } from "@/components/BoardSummary";

describe("BoardSummary", () => {
  it("shows each number under its label", () => {
    render(<BoardSummary summary={{ total: 12, overdue: 2, dueSoon: 3, highPriority: 4 }} />);
    const summary = screen.getByLabelText("Board summary");
    const value = (label: string) => within(summary).getByText(label).nextElementSibling;
    expect(value("Cards")).toHaveTextContent("12");
    expect(value("Overdue")).toHaveTextContent("2");
    expect(value("Due in 7 days")).toHaveTextContent("3");
    expect(value("High priority")).toHaveTextContent("4");
  });
});
