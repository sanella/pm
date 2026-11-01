import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { emptyFilter, type CardFilter } from "@/lib/kanban";

// Keeps the filter in state like the board does, and reports each change.
const Harness = ({ onChange }: { onChange: (filter: CardFilter) => void }) => {
  const [filter, setFilter] = useState(emptyFilter);
  return (
    <FilterBar
      filter={filter}
      labels={["api", "ux"]}
      shown={3}
      total={8}
      onChange={(next) => {
        setFilter(next);
        onChange(next);
      }}
    />
  );
};

describe("FilterBar", () => {
  it("updates each part of the filter", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.type(screen.getByLabelText("Search cards"), "qa");
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
    await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "ux");
    await userEvent.click(screen.getByLabelText("Overdue only"));

    expect(onChange).toHaveBeenLastCalledWith({ text: "qa", priority: "high", label: "ux", overdueOnly: true });
  });

  it("shows the count and a clear button only while filtering", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear filters/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Overdue only"));
    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 of 8 cards");

    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(onChange).toHaveBeenLastCalledWith(emptyFilter);
    expect(screen.getByLabelText("Overdue only")).not.toBeChecked();
  });

  it("lists the board's labels", () => {
    render(<Harness onChange={vi.fn()} />);
    const options = Array.from(
      (screen.getByLabelText("Filter by label") as HTMLSelectElement).options
    ).map((option) => option.text);
    expect(options).toEqual(["Any label", "api", "ux"]);
  });
});
