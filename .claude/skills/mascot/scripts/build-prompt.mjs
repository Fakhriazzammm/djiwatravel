#!/usr/bin/env node
// Builds the Helipod request for the Djiwa Travel mascot.
// The BASE prompt is locked: it is never edited, reordered or paraphrased. Extras are appended
// after it, and anything that would change the character itself is rejected.
//
// Usage:
//   node build-prompt.mjs [--object "a small paper map"] [--pose "flying upward with a wink"]
//                         [--position "small in the lower right of the frame"] [--extra "..."]
// Prints JSON: { model, projectId, size, prompt, extras }.

export const MODEL = "seedream-image-v5.0-flash";
export const PROJECT_ID = "7f6dbc1d-16dc-4774-a1a2-15c8d9478f8e";
export const SIZE = "2048x2048";

// Locked character prompt (approved 2026-11-02, option B). Do not edit.
export const BASE_PROMPT =
  "Cute furry plush 3D airplane character, side profile facing right, a soft egg-shaped red fuzzy body where the face itself is the front of the plane: completely smooth rounded face, no nose, no beak, no nose cone, nothing sticking out in front, two big round shiny eyes, bright red blush cheeks and a small smile, two stubby fluffy wings on the sides, tiny rounded tail, white fluffy tummy, brown leather pilot cap with round goggles, soft studio lighting, no shadow, no ground, floating on perfectly flat pure white background, no text";

// Words that would alter the character or break the transparent-background workflow.
const FORBIDDEN = [
  /\bnose\b/i, /\bsnout\b/i, /\bbeak\b/i, /\bcone\b/i, /\bpropeller\b/i, /\bwing(s)?\b/i, /\btail\b/i,
  /\beye(s)?\b/i, /\bcheek(s)?\b/i, /\bsmile\b/i, /\btummy\b|\bbelly\b/i, /\bcap\b|\bhat\b|\bhelmet\b|\bgoggles\b/i,
  /\b(fur|fuzzy|plush)\b/i, /\b(red|blue|green|yellow|purple|pink|black|white|orange)\s+(body|face|fur)\b/i,
  /\bbackground\b/i, /\bshadow\b/i, /\bground\b/i, /\bfloor\b/i, /\btext\b/i, /\blogo\b/i,
  /\bfacing (left|front|camera)\b/i, /\bfront view\b|\bback view\b/i,
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1] ?? "";
    i += 1;
  }
  return out;
}

export function buildPrompt({ object, pose, position, extra } = {}) {
  const extras = [];
  if (object) extras.push(`holding or accompanied by ${object.trim()}`);
  if (pose) extras.push(`pose and motion: ${pose.trim()}`);
  if (position) extras.push(`placement in the frame: ${position.trim()}`);
  if (extra) extras.push(extra.trim());
  for (const text of extras) {
    const hit = FORBIDDEN.find((pattern) => pattern.test(text));
    if (hit) {
      throw new Error(
        `Extra "${text}" touches the locked character or background (${hit}). ` +
          "Describe only an added object, a pose/motion, or a placement.",
      );
    }
  }
  const prompt = extras.length ? `${BASE_PROMPT}, ${extras.join(", ")}` : BASE_PROMPT;
  return { model: MODEL, projectId: PROJECT_ID, size: SIZE, prompt, extras };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(buildPrompt(parseArgs(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
