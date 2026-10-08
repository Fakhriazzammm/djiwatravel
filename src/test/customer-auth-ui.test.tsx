import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerAuth } from "@/components/customer-auth";
import { getBetterAuthSession, signInEmail, signUpEmail, type BetterAuthSession } from "@/lib/better-auth-client";

vi.mock("@/lib/better-auth-client", () => ({ getBetterAuthSession: vi.fn(), signInEmail: vi.fn(), signUpEmail: vi.fn(), signInGoogle: vi.fn() }));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
function openForm() {
  const done = vi.fn();
  render(<CustomerAuth onAuthenticated={done} />);
  fireEvent.click(screen.getByText("Masuk / daftar dengan email"));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "traveler@example.com" } });
  return done;
}
function submit() {
  fireEvent.change(screen.getByLabelText("Kata sandi"), { target: { value: "secret-pass" } });
  fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
}
describe("Customer email authentication", () => {
  it("waits for a verified session before completing login", async () => {
    let resolveSession!: (value: BetterAuthSession) => void;
    vi.mocked(getBetterAuthSession).mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    const done = openForm();
    submit();
    await waitFor(() => expect(getBetterAuthSession).toHaveBeenCalledOnce());
    expect(signInEmail).toHaveBeenCalledWith("traveler@example.com", "secret-pass");
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Memverifikasi sesi…" })).toBeDisabled();
    resolveSession({ user: { id: "u1", name: "Traveler" }, session: { id: "s1", expiresAt: "2030-01-01" } });
    await waitFor(() => expect(done).toHaveBeenCalledWith({ id: "u1", name: "Traveler" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("registers with name and keeps the dialog open when no session exists", async () => {
    vi.mocked(getBetterAuthSession).mockResolvedValue(null);
    const done = openForm();
    fireEvent.click(screen.getByRole("button", { name: "Daftar", exact: true }));
    fireEvent.change(screen.getByLabelText("Nama"), { target: { value: "Traveler" } });
    submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("sesi belum aktif"));
    expect(signUpEmail).toHaveBeenCalledWith("Traveler", "traveler@example.com", "secret-pass");
    expect(done).not.toHaveBeenCalled();
  });
  it("does not complete a cancelled login after its session request resolves", async () => {
    let resolveSession!: (value: BetterAuthSession) => void;
    vi.mocked(getBetterAuthSession).mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    const done = openForm();
    submit();
    await waitFor(() => expect(getBetterAuthSession).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    resolveSession({ user: { id: "u1" }, session: { id: "s1", expiresAt: "2030-01-01" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(done).not.toHaveBeenCalled();
  });
  it("shows a safe error and allows cancellation", async () => {
    vi.mocked(signInEmail).mockRejectedValue(new Error("internal secret"));
    const done = openForm();
    submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Masuk gagal"));
    expect(screen.queryByText("internal secret")).not.toBeInTheDocument();
    expect(getBetterAuthSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(done).not.toHaveBeenCalled();
  });
});
