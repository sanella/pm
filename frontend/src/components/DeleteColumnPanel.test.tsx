import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteColumnPanel } from "@/components/DeleteColumnPanel";

const others = [
  { id: "col-b", title: "Doing", cardIds: [] },
  { id: "col-c", title: "Done", cardIds: ["card-9"] },
];

const renderPanel = (cardIds: string[]) => {
  const props = { onConfirm: vi.fn(), onCancel: vi.fn() };
  render(
    <DeleteColumnPanel column={{ id: "col-a", title: "Todo", cardIds }} otherColumns={others} {...props} />
  );
  return props;
};

describe("DeleteColumnPanel", () => {
  it("moves the cards to the first other column by default", async () => {
    const { onConfirm } = renderPanel(["card-1", "card-2"]);
    expect(screen.getByText("2 cards in this column:")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /delete column/i }));
    expect(onConfirm).toHaveBeenCalledWith("col-b");
  });

  it("moves the cards to the chosen column", async () => {
    const { onConfirm } = renderPanel(["card-1"]);
    await userEvent.selectOptions(screen.getByLabelText("What happens to the cards"), "Move to Done");
    await userEvent.click(screen.getByRole("button", { name: /delete column/i }));
    expect(onConfirm).toHaveBeenCalledWith("col-c");
  });

  it("can delete the cards instead", async () => {
    const { onConfirm } = renderPanel(["card-1"]);
    await userEvent.selectOptions(screen.getByLabelText("What happens to the cards"), "Delete the cards");
    await userEvent.click(screen.getByRole("button", { name: /delete column/i }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it("asks a simple question for an empty column", async () => {
    const { onConfirm } = renderPanel([]);
    expect(screen.getByText("Delete this empty column?")).toBeInTheDocument();
    expect(screen.queryByLabelText("What happens to the cards")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /delete column/i }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it("cancels", async () => {
    const { onCancel, onConfirm } = renderPanel(["card-1"]);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
