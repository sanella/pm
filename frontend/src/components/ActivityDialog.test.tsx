import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityDialog } from "@/components/ActivityDialog";
import { listActivity } from "@/lib/api";

vi.mock("@/lib/api", () => ({ listActivity: vi.fn() }));

const at = (hour: number) => new Date(2026, 2, 10, hour, 5).toISOString();

describe("ActivityDialog", () => {
  it("lists the board's activity with who and when", async () => {
    vi.mocked(listActivity).mockResolvedValue([
      { id: 2, author: "bob", message: 'moved card "Ship" to "Done"', createdAt: at(14) },
      { id: 1, author: null, message: 'added column "Blocked"', createdAt: at(9) },
    ]);
    render(<ActivityDialog boardId={5} onClose={() => {}} />);

    const items = within(await screen.findByRole("list", { name: "Recent activity" })).getAllByRole("listitem");
    expect(listActivity).toHaveBeenCalledWith(5);
    expect(items.map((item) => item.textContent)).toEqual([
      'bob moved card "Ship" to "Done"Mar 10, 2:05 PM',
      'Deleted user added column "Blocked"Mar 10, 9:05 AM',
    ]);
  });

  it("says when nothing has happened yet, and closes", async () => {
    vi.mocked(listActivity).mockResolvedValue([]);
    const onClose = vi.fn();
    render(<ActivityDialog boardId={5} onClose={onClose} />);
    expect(await screen.findByText(/nothing has happened/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reports a failed load", async () => {
    vi.mocked(listActivity).mockRejectedValue(new Error("500"));
    render(<ActivityDialog boardId={5} onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the activity.");
  });
});
