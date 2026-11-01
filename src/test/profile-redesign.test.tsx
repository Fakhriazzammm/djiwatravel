import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { safePhotoUrl } from "@/lib/safe-photo-url";

afterEach(cleanup);

describe("profile photo from Google sign-in", () => {
  it("accepts only https photo URLs", () => {
    expect(safePhotoUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toContain(
      "lh3.googleusercontent.com",
    );
    expect(safePhotoUrl("http://example.com/a.png")).toBeNull();
    expect(safePhotoUrl("javascript:alert(1)")).toBeNull();
    expect(safePhotoUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(safePhotoUrl("not a url")).toBeNull();
    expect(safePhotoUrl(null)).toBeNull();
  });

  it("draws the Google photo without sending a referrer", () => {
    render(<ProfileAvatar name="Azzam" image="https://lh3.googleusercontent.com/a/abc=s96-c" />);
    const img = screen.getByTestId("profile-avatar").querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("falls back to the initial when there is no photo or it fails to load", () => {
    const { unmount } = render(<ProfileAvatar name="azzam" image={null} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    unmount();
    render(<ProfileAvatar name="Rani" image="https://lh3.googleusercontent.com/broken" />);
    const img = screen.getByTestId("profile-avatar").querySelector("img");
    fireEvent.error(img!);
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.getByTestId("profile-avatar").querySelector("img")).toBeNull();
  });
});
