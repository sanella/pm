import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDialog } from "@/components/CardDialog";
import { addComment, deleteComment, listComments } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({ listComments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn() }));

const createdAt = new Date(2026, 2, 10, 14, 5).toISOString();
const card = initialData.cards["card-1"];
const mine = { id: "comment-1", author: "alice", text: "Looks good", createdAt, mine: true };
const theirs = { id: "comment-2", author: "bob", text: "Agreed", createdAt, mine: false };

const renderDialog = async () => {
  const props = { onClose: vi.fn(), onAddItem: vi.fn(), onToggleItem: vi.fn(), onRemoveItem: vi.fn() };
  render(<CardDialog boardId={5} card={card} {...props} />);
  await screen.findByRole("dialog", { name: "Align roadmap themes" });
  return props;
};

describe("CardDialog comments", () => {
  it("lists comments with authors, and delete only on your own", async () => {
    vi.mocked(listComments).mockResolvedValue([mine, theirs, { ...theirs, id: "comment-3", author: null }]);
    await renderDialog();
    const list = await screen.findByRole("list", { name: "Comments" });
    expect(listComments).toHaveBeenCalledWith(5, "card-1");
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "alice Mar 10, 2:05 PMDeleteLooks good",
      "bob Mar 10, 2:05 PMAgreed",
      "Deleted user Mar 10, 2:05 PMAgreed",
    ]);
    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });

  it("adds a comment", async () => {
    vi.mocked(listComments).mockResolvedValue([]);
    vi.mocked(addComment).mockResolvedValue([mine]);
    await renderDialog();
    expect(await screen.findByText("No comments yet.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("New comment"), "  Looks good  ");
    await userEvent.click(screen.getByRole("button", { name: /add comment/i }));

    expect(addComment).toHaveBeenCalledWith(5, "card-1", "Looks good");
    expect(await screen.findByText("Looks good")).toBeInTheDocument();
    expect(screen.getByLabelText("New comment")).toHaveValue("");
  });

  it("does not send a blank comment", async () => {
    vi.mocked(listComments).mockResolvedValue([]);
    await renderDialog();
    await userEvent.type(screen.getByLabelText("New comment"), "   ");
    await userEvent.click(screen.getByRole("button", { name: /add comment/i }));
    expect(addComment).not.toHaveBeenCalled();
  });

  it("deletes your own comment", async () => {
    vi.mocked(listComments).mockResolvedValue([mine]);
    vi.mocked(deleteComment).mockResolvedValue([]);
    await renderDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Delete comment: Looks good" }));
    expect(deleteComment).toHaveBeenCalledWith(5, "card-1", "comment-1");
    expect(await screen.findByText("No comments yet.")).toBeInTheDocument();
  });

  it.each([
    ["load", "Could not load the comments."],
    ["add", "Could not add the comment."],
    ["delete", "Could not delete the comment."],
  ])("reports a failed %s", async (action, message) => {
    vi.mocked(listComments).mockImplementation(async () => {
      if (action === "load") throw new Error("500");
      return [mine];
    });
    vi.mocked(addComment).mockRejectedValue(new Error("500"));
    vi.mocked(deleteComment).mockRejectedValue(new Error("500"));
    await renderDialog();
    if (action === "add") {
      await userEvent.type(screen.getByLabelText("New comment"), "Hi");
      await userEvent.click(screen.getByRole("button", { name: /add comment/i }));
    }
    if (action === "delete") {
      await userEvent.click(await screen.findByRole("button", { name: "Delete comment: Looks good" }));
    }
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});

describe("CardDialog checklist", () => {
  beforeEach(() => {
    vi.mocked(listComments).mockResolvedValue([]);
  });

  it("shows the items and progress", async () => {
    await renderDialog();
    const checklist = screen.getByRole("region", { name: "Checklist 1/2" });
    expect(within(checklist).getByLabelText("Collect metrics")).toBeChecked();
    expect(within(checklist).getByLabelText("Write themes")).not.toBeChecked();
  });

  it("toggles, removes and adds items", async () => {
    const { onToggleItem, onRemoveItem, onAddItem } = await renderDialog();
    await userEvent.click(screen.getByLabelText("Write themes"));
    expect(onToggleItem).toHaveBeenCalledWith("item-2", true);
    await userEvent.click(screen.getByLabelText("Collect metrics"));
    expect(onToggleItem).toHaveBeenLastCalledWith("item-1", false);

    await userEvent.click(screen.getByRole("button", { name: "Remove item: Write themes" }));
    expect(onRemoveItem).toHaveBeenCalledWith("item-2");

    await userEvent.type(screen.getByLabelText("New checklist item"), "  Share draft {Enter}");
    expect(onAddItem).toHaveBeenCalledWith("Share draft");
    expect(screen.getByLabelText("New checklist item")).toHaveValue("");
  });

  it("ignores a blank item", async () => {
    const { onAddItem } = await renderDialog();
    await userEvent.type(screen.getByLabelText("New checklist item"), "   {Enter}");
    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("has no progress for an empty checklist", async () => {
    vi.mocked(listComments).mockResolvedValue([]);
    render(
      <CardDialog
        boardId={5}
        card={initialData.cards["card-3"]}
        onClose={() => {}}
        onAddItem={() => {}}
        onToggleItem={() => {}}
        onRemoveItem={() => {}}
      />
    );
    expect(await screen.findByRole("region", { name: "Checklist" })).toBeInTheDocument();
  });
});
