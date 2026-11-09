/** Fit menus to the terminal: complete feature menus, bounded data catalogues. */
export function menuPageSize(
  count: number,
  kind: 'features' | 'catalogue' = 'features',
  rows = process.stdout.rows ?? 24
): number {
  const available = Math.max(3, Math.floor(rows) - 9);
  return Math.max(1, Math.min(count, available, kind === 'catalogue' ? 15 : 20));
}
