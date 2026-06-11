import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AuthPage from "../auth";

const loginMock = vi.fn().mockResolvedValue({ user: { id: 1 } });
const registerMock = vi.fn().mockResolvedValue({ user: { id: 1 } });

vi.mock("@/contexts/auth", () => ({
  useAuth: () => ({
    user: null,
    quota: null,
    isLoading: false,
    isAuthenticated: false,
    login: loginMock,
    register: registerMock,
    logout: vi.fn(),
    refetch: vi.fn(),
  }),
}));

describe("AuthPage", () => {
  beforeEach(() => {
    loginMock.mockClear();
    registerMock.mockClear();
  });

  it("accepts typed input in the login form", async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    const email = screen.getByPlaceholderText("you@example.com");
    const password = screen.getByPlaceholderText("••••••••");

    await user.type(email, "heck@example.com");
    await user.type(password, "hunter22");

    expect(email).toHaveValue("heck@example.com");
    expect(password).toHaveValue("hunter22");
  });

  it("submits the login form with the typed values", async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "heck@example.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "hunter22");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(loginMock).toHaveBeenCalledWith({ email: "heck@example.com", password: "hunter22" });
  });

  it("accepts typed input and submits the create-account form", async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    const name = screen.getByPlaceholderText("Your name");
    const email = screen.getByPlaceholderText("you@example.com");
    const password = screen.getByPlaceholderText("At least 8 characters");

    await user.type(name, "Heck");
    await user.type(email, "new@example.com");
    await user.type(password, "longenough8");

    expect(name).toHaveValue("Heck");
    expect(email).toHaveValue("new@example.com");
    expect(password).toHaveValue("longenough8");

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(registerMock).toHaveBeenCalledWith({
      displayName: "Heck",
      email: "new@example.com",
      password: "longenough8",
    });
  });

  it("login form still accepts input after toggling to register and back", async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.click(screen.getByRole("button", { name: /sign up/i }));
    await user.type(screen.getByPlaceholderText("Your name"), "x");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const email = screen.getByPlaceholderText("you@example.com");
    await user.type(email, "back@example.com");
    expect(email).toHaveValue("back@example.com");
  });

  it("shows a validation error for a short password instead of submitting", async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.click(screen.getByRole("button", { name: /sign up/i }));
    await user.type(screen.getByPlaceholderText("you@example.com"), "new@example.com");
    await user.type(screen.getByPlaceholderText("At least 8 characters"), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Must be at least 8 characters")).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });
});
