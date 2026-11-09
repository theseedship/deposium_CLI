/** Fit menus to the terminal: complete feature menus, bounded data catalogues. */
export function menuPageSize(
  count: number,
  kind: 'features' | 'catalogue' = 'features',
  rows = process.stdout.rows ?? 24
): number {
  const available = Math.max(3, Math.floor(rows) - 9);
  // Inquirer counts wrapped display rows, not choices. Leave room for long feature labels.
  if (kind === 'features') return Math.min(available, 20);
  return Math.max(1, Math.min(count, available, 15));
}
