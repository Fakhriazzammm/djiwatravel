import { useEffect, useState } from "react";

/** The same typing effect as the eSIM search line, for "<prefix><example>". Still text with reduced motion. */
export function useTypedHint(
  active: boolean,
  reduceMotion: boolean | null,
  examples: string[],
  fallback: string,
  prefix: string,
) {
  const [hint, setHint] = useState(fallback);
  useEffect(() => {
    if (!active || reduceMotion) {
      setHint(fallback);
      return;
    }
    let wordIndex = 0;
    let count = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      const word = examples[wordIndex] ?? "";
      count += deleting ? -1 : 1;
      setHint(`${prefix}${word.slice(0, count)}`);
      if (!deleting && count === word.length) {
        deleting = true;
        timeout = setTimeout(tick, 1000);
      } else if (deleting && count === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % examples.length;
        timeout = setTimeout(tick, 250);
      } else {
        timeout = setTimeout(tick, deleting ? 42 : 80);
      }
    };
    timeout = setTimeout(tick, 500);
    return () => clearTimeout(timeout);
  }, [active, reduceMotion, examples, fallback, prefix]);
  return hint;
}
