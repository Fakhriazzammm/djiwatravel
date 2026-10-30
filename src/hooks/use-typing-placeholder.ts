import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type TypingPlaceholderOptions = {
  fallback: string;
  examples: string[];
  paused?: boolean;
};

/** A small, accessible typewriter hint for empty search fields. */
export function useTypingPlaceholder({
  fallback,
  examples,
  paused = false,
}: TypingPlaceholderOptions) {
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState(fallback);
  const exampleKey = examples.join("\u0000");

  useEffect(() => {
    if (reduceMotion || paused || examples.length === 0) {
      setText(fallback);
      return;
    }

    let wordIndex = 0;
    let characterCount = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const word = examples[wordIndex] ?? "";
      characterCount += deleting ? -1 : 1;
      setText(`${fallback.replace(/[^\s]+$/, "")} ${word.slice(0, characterCount)}`.trim());

      if (!deleting && characterCount >= word.length) {
        deleting = true;
        timeout = setTimeout(tick, 1_000);
      } else if (deleting && characterCount <= 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % examples.length;
        timeout = setTimeout(tick, 250);
      } else {
        timeout = setTimeout(tick, deleting ? 42 : 80);
      }
    };

    timeout = setTimeout(tick, 500);
    return () => clearTimeout(timeout);
  }, [exampleKey, fallback, paused, reduceMotion]);

  return text;
}
