import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";
import { login, register } from "@/lib/api";

vi.mock("@/lib/api", () => ({ login: vi.fn(), register: vi.fn() }));

const fillAndSubmit = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("LoginForm", () => {
  it("calls onLogin with the registered name after a successful login", async () => {
    vi.mocked(login).mockResolvedValue("Alice");
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await fillAndSubmit(" alice ", "password");

    expect(login).toHaveBeenCalledWith("alice", "password");
    expect(onLogin).toHaveBeenCalledWith("Alice");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error when the server cannot be reached", async () => {
    vi.mocked(login).mockRejectedValue(new TypeError("Failed to fetch"));
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await fillAndSubmit("user", "password");

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/cannot reach the server/i);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });

  it("disables the button while signing in", async () => {
    let resolve: (username: string | null) => void = () => {};
    vi.mocked(login).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<LoginForm onLogin={vi.fn()} />);

    await fillAndSubmit("user", "password");

    expect(screen.getByRole("button", { name: /please wait/i })).toBeDisabled();
    resolve("user");
  });

  it("shows an error on invalid credentials", async () => {
    vi.mocked(login).mockResolvedValue(null);
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await fillAndSubmit("user", "wrong");

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid username or password/i);
  });

  describe("creating an account", () => {
    const fillAndRegister = async (username: string, password: string) => {
      await userEvent.click(screen.getByRole("button", { name: /create an account/i }));
      expect(screen.getByRole("heading", { name: /create account/i })).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("Username"), username);
      await userEvent.type(screen.getByLabelText("Password"), password);
      await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    };

    it("registers and signs in", async () => {
      vi.mocked(register).mockResolvedValue(null);
      const onLogin = vi.fn();
      render(<LoginForm onLogin={onLogin} />);

      await fillAndRegister(" alice ", "secret-pass");

      expect(register).toHaveBeenCalledWith("alice", "secret-pass");
      expect(login).not.toHaveBeenCalled();
      expect(onLogin).toHaveBeenCalledWith("alice");
    });

    it("shows the reason when registration is refused", async () => {
      vi.mocked(register).mockResolvedValue("That username is taken.");
      const onLogin = vi.fn();
      render(<LoginForm onLogin={onLogin} />);

      await fillAndRegister("alice", "secret-pass");

      expect(onLogin).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("That username is taken.");
    });

    it("switches back to signing in and clears the error", async () => {
      vi.mocked(register).mockResolvedValue("That username is taken.");
      render(<LoginForm onLogin={vi.fn()} />);
      await fillAndRegister("alice", "secret-pass");

      await userEvent.click(screen.getByRole("button", { name: /already have an account/i }));

      expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
