type ClassValue = string | number | false | null | undefined;

/**
 * Minimal class-name joiner (no external deps). Filters out falsy values
 * so conditional Tailwind classes can be expressed inline.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
