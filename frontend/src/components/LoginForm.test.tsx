import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";
import { login } from "@/lib/api";

vi.mock("@/lib/api", () => ({ login: vi.fn() }));

const fillAndSubmit = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("LoginForm", () => {
  it("calls onLogin after a successful login", async () => {
    vi.mocked(login).mockResolvedValue(true);
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await fillAndSubmit("user", "password");

    expect(login).toHaveBeenCalledWith("user", "password");
    expect(onLogin).toHaveBeenCalledWith("user");
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
    let resolve: (ok: boolean) => void = () => {};
    vi.mocked(login).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<LoginForm onLogin={vi.fn()} />);

    await fillAndSubmit("user", "password");

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    resolve(true);
  });

  it("shows an error on invalid credentials", async () => {
    vi.mocked(login).mockResolvedValue(false);
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await fillAndSubmit("user", "wrong");

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid username or password/i);
  });
});
