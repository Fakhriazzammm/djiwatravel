import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useTypingPlaceholder } from "@/hooks/use-typing-placeholder";

describe("useTypingPlaceholder", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("types an example and returns to the fallback while paused", () => {
    const { result, rerender } = renderHook(
      ({ paused }) =>
        useTypingPlaceholder({ fallback: "Cari negara atau kawasan", examples: ["Jepang"], paused }),
      { initialProps: { paused: false } },
    );

    expect(result.current).toBe("Cari negara atau kawasan");
    act(() => vi.advanceTimersByTime(500 + 80 * 2));
    expect(result.current).toContain("Jep");

    rerender({ paused: true });
    expect(result.current).toBe("Cari negara atau kawasan");
  });
});
