import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CHAT_HISTORY_LIMIT, ChatSidebar } from "@/components/ChatSidebar";
import { sendChat } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({ sendChat: vi.fn() }));

const renderSidebar = (onBoardUpdate = vi.fn()) => {
  render(<ChatSidebar boardId={7} open onClose={() => {}} onBoardUpdate={onBoardUpdate} />);
  return onBoardUpdate;
};

const send = async (text: string) => {
  await userEvent.type(screen.getByLabelText("Message"), text);
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
};

describe("ChatSidebar", () => {
  it("sends a message and shows the reply", async () => {
    vi.mocked(sendChat).mockResolvedValue({ message: "Hi there", board: null });
    renderSidebar();
    await send("Hello");

    expect(sendChat).toHaveBeenCalledWith(7, "Hello", []);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(await screen.findByText("Hi there")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("sends the earlier conversation as history", async () => {
    vi.mocked(sendChat)
      .mockResolvedValueOnce({ message: "First reply", board: null })
      .mockResolvedValueOnce({ message: "Second reply", board: null });
    renderSidebar();
    await send("First");
    await screen.findByText("First reply");
    await send("Second");

    expect(sendChat).toHaveBeenLastCalledWith(7, "Second", [
      { role: "user", content: "First" },
      { role: "assistant", content: "First reply" },
    ]);
    expect(await screen.findByText("Second reply")).toBeInTheDocument();
  });

  it("sends with Enter", async () => {
    vi.mocked(sendChat).mockResolvedValue({ message: "Reply", board: null });
    renderSidebar();
    await userEvent.type(screen.getByLabelText("Message"), "Hello{Enter}");
    expect(sendChat).toHaveBeenCalledWith(7, "Hello", []);
  });

  it("shows a loading state and blocks sending while waiting", async () => {
    vi.mocked(sendChat).mockReturnValue(new Promise(() => {}));
    renderSidebar();
    await send("Hello");

    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Message"), "Again");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("shows an error and restores the message when sending fails", async () => {
    vi.mocked(sendChat).mockRejectedValue(new Error("502"));
    renderSidebar();
    await send("Hello");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not answer/i);
    expect(screen.getByLabelText("Message")).toHaveValue("Hello");
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("passes a board update to the board", async () => {
    vi.mocked(sendChat).mockResolvedValue({ message: "Added", board: initialData });
    const onBoardUpdate = renderSidebar();
    await send("Add a card");

    await screen.findByText("Added");
    expect(onBoardUpdate).toHaveBeenCalledWith(initialData);
  });

  it("does not update the board when the reply has no board", async () => {
    vi.mocked(sendChat).mockResolvedValue({ message: "Just chatting", board: null });
    const onBoardUpdate = renderSidebar();
    await send("Hi");

    await screen.findByText("Just chatting");
    expect(onBoardUpdate).not.toHaveBeenCalled();
  });

  it("does not send a blank message", async () => {
    renderSidebar();
    await userEvent.type(screen.getByLabelText("Message"), "   {Enter}");
    expect(sendChat).not.toHaveBeenCalled();
  });

  it("sends only the latest turns as history", async () => {
    vi.mocked(sendChat).mockImplementation(async (_, text) => ({ message: `Re: ${text}`, board: null }));
    renderSidebar();
    // 21 exchanges make 42 turns; the next message carries the latest 40.
    for (let i = 0; i < 21; i++) {
      await send(`m${i}`);
      await screen.findByText(`Re: m${i}`);
    }
    await send("last");

    const history = vi.mocked(sendChat).mock.calls.at(-1)![2];
    expect(history).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(history[0]).toEqual({ role: "user", content: "m1" });
    expect(history.at(-1)).toEqual({ role: "assistant", content: "Re: m20" });
  });
});
