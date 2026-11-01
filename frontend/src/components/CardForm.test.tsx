import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardForm, emptyCard } from "@/components/CardForm";

const renderForm = (initial = emptyCard) => {
  const props = { onSubmit: vi.fn(), onCancel: vi.fn() };
  render(<CardForm initial={initial} submitLabel="Save" {...props} />);
  return props;
};

describe("CardForm", () => {
  it("submits every field, trimmed and parsed", async () => {
    const { onSubmit } = renderForm();
    await userEvent.type(screen.getByLabelText("Card title"), "  Launch  ");
    await userEvent.type(screen.getByLabelText("Card details"), " Notes ");
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "high");
    await userEvent.type(screen.getByLabelText("Due date"), "2026-12-24");
    await userEvent.type(screen.getByLabelText("Labels"), "ux, research, UX");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "Launch",
      details: "Notes",
      priority: "high",
      dueDate: "2026-12-24",
      labels: ["ux", "research"],
    });
  });

  it("starts from the card's values and can clear them", async () => {
    const { onSubmit } = renderForm({
      title: "Existing",
      details: "",
      priority: "low",
      dueDate: "2026-03-01",
      labels: ["a", "b"],
    });
    expect(screen.getByLabelText("Card title")).toHaveValue("Existing");
    expect(screen.getByLabelText("Priority")).toHaveValue("low");
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-03-01");
    expect(screen.getByLabelText("Labels")).toHaveValue("a, b");

    await userEvent.clear(screen.getByLabelText("Due date"));
    await userEvent.clear(screen.getByLabelText("Labels"));
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "none");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "Existing",
      details: "",
      priority: "none",
      dueDate: null,
      labels: [],
    });
  });

  it("does not submit without a title", async () => {
    const { onSubmit } = renderForm();
    await userEvent.type(screen.getByLabelText("Card title"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cancels", async () => {
    const { onCancel } = renderForm();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
