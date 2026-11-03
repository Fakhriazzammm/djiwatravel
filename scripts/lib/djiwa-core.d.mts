export function stripSqlLiterals(sql: string): string;
export function assertReadOnlySql(sql: string): string;
export function nextMigrationNumber(files: string[]): string;
export function slugify(name: string): string;
export function routeFileFor(urlPath: string): string;
export function parseEnvNames(text: string): string[];
export function extractAssets(html: string): string[];
export function fingerprint(value: string): string;
export function parseArgs(
  argv: string[],
  options?: { booleans?: string[]; aliases?: Record<string, string> },
): { flags: Record<string, string | boolean | undefined>; positional: string[] };
export function selectPaths(changed: string[], wanted: string[]): string[];
export function isBroadPath(entry: string): boolean;
