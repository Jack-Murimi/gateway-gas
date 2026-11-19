export const resizeReturns = (returns: string[], quantity: number, fill: string) =>
  Array.from({ length: quantity }, (_, i) => returns[i] ?? fill);

export function groupReturns(returns: string[]): Array<{ brand: string; quantity: number }> {
  const counts = new Map<string, number>();
  for (const brand of returns) counts.set(brand, (counts.get(brand) || 0) + 1);
  return [...counts].map(([brand, quantity]) => ({ brand, quantity }));
}
