import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddColumnForm } from "@/components/AddColumnForm";

describe("AddColumnForm", () => {
  it("adds a column with a trimmed name and closes", async () => {
    const onAdd = vi.fn();
    render(<AddColumnForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add column/i }));
    await userEvent.type(screen.getByLabelText("New column name"), "  Blocked {Enter}");
    expect(onAdd).toHaveBeenCalledWith("Blocked");
    expect(screen.queryByLabelText("New column name")).not.toBeInTheDocument();
  });

  it("ignores a blank name and can be cancelled", async () => {
    const onAdd = vi.fn();
    render(<AddColumnForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add column/i }));
    await userEvent.type(screen.getByLabelText("New column name"), "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByRole("button", { name: /add column/i })).toBeInTheDocument();
  });
});
