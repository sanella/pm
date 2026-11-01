import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareDialog } from "@/components/ShareDialog";
import { addMember, listMembers, removeMember, RequestError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  // RequestError stays real so the dialog can read its status.
  RequestError: (await importOriginal<typeof import("@/lib/api")>()).RequestError,
  listMembers: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
}));

const ownBoard = { id: 4, title: "Launch", owner: "alice", isOwner: true };
const sharedBoard = { ...ownBoard, owner: "bob", isOwner: false };

const renderDialog = async (board = ownBoard, username = "alice") => {
  const props = { onClose: vi.fn(), onLeft: vi.fn() };
  render(<ShareDialog board={board} username={username} {...props} />);
  await screen.findByRole("list", { name: "People with access" });
  return props;
};

const people = () =>
  within(screen.getByRole("list", { name: "People with access" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

beforeEach(() => {
  vi.mocked(listMembers).mockResolvedValue({ owner: "alice", members: ["carol"] });
});

describe("ShareDialog", () => {
  it("lists the owner and members", async () => {
    await renderDialog();
    expect(listMembers).toHaveBeenCalledWith(4);
    expect(screen.getByRole("dialog", { name: "Share Launch" })).toBeInTheDocument();
    expect(people()).toEqual(["aliceOwner", "carolRemove"]);
  });

  it("lets the owner add a member", async () => {
    vi.mocked(addMember).mockResolvedValue({ owner: "alice", members: ["bob", "carol"] });
    await renderDialog();
    await userEvent.type(screen.getByLabelText("Username to add"), " bob {Enter}");
    expect(addMember).toHaveBeenCalledWith(4, "bob");
    expect(await screen.findByText("bob")).toBeInTheDocument();
    expect(screen.getByLabelText("Username to add")).toHaveValue("");
  });

  it.each([
    [404, "There is no user with that name."],
    [409, "That user can already open this board."],
    [500, "Could not add the member."],
  ])("explains a refused add (%s)", async (status, message) => {
    vi.mocked(addMember).mockRejectedValue(new RequestError("refused", status));
    await renderDialog();
    await userEvent.type(screen.getByLabelText("Username to add"), "someone{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("does not send a blank username", async () => {
    await renderDialog();
    await userEvent.type(screen.getByLabelText("Username to add"), "   {Enter}");
    expect(addMember).not.toHaveBeenCalled();
  });

  it("lets the owner remove a member", async () => {
    vi.mocked(removeMember).mockResolvedValue({ owner: "alice", members: [] });
    await renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Remove carol" }));
    expect(removeMember).toHaveBeenCalledWith(4, "carol");
    await waitFor(() => expect(people()).toEqual(["aliceOwner"]));
  });

  it("reports a failed removal", async () => {
    vi.mocked(removeMember).mockRejectedValue(new Error("500"));
    await renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Remove carol" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove the member.");
  });

  it("lets a member leave, without owner controls", async () => {
    vi.mocked(listMembers).mockResolvedValue({ owner: "bob", members: ["alice"] });
    vi.mocked(removeMember).mockResolvedValue({ owner: "bob", members: [] });
    const { onLeft } = await renderDialog(sharedBoard, "alice");

    expect(screen.queryByLabelText("Username to add")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /leave board/i }));
    expect(removeMember).toHaveBeenCalledWith(4, "alice");
    expect(onLeft).toHaveBeenCalledOnce();
  });

  it("reports a failed leave", async () => {
    vi.mocked(removeMember).mockRejectedValue(new Error("500"));
    const { onLeft } = await renderDialog(sharedBoard, "alice");
    await userEvent.click(screen.getByRole("button", { name: /leave board/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not leave the board.");
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("reports members that cannot be loaded, and closes", async () => {
    vi.mocked(listMembers).mockRejectedValue(new Error("500"));
    const onClose = vi.fn();
    render(<ShareDialog board={ownBoard} username="alice" onClose={onClose} onLeft={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the members.");
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
