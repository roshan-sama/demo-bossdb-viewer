/**
 * Where an arrow, Home or End key moves focus in a row of `n` tabs when tab `i` has it, as in the ARIA tabs
 * pattern. Returns -1 for any other key.
 */
export function tabKeyTarget(key: string, i: number, n: number): number {
  switch (key) {
    case 'ArrowRight':
      return (i + 1) % n;
    case 'ArrowLeft':
      return (i - 1 + n) % n;
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
    default:
      return -1;
  }
}
