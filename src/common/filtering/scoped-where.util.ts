export function buildScopedWhere<T extends object>(
  baseWhere: T,
  narrowingWhere: Partial<T>,
): { AND: [T, Partial<T>] } {
  return { AND: [baseWhere, narrowingWhere] };
}
