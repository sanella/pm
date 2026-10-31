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

  it("shows an error on invalid credentials", async () => {
    vi.mocked(login).mockResolvedValue(false);
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);

    await fillAndSubmit("user", "wrong");

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid username or password/i);
  });
});
