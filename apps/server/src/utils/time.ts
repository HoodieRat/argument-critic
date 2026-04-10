export function nowIso(): string {
  return new Date().toISOString();
}

export function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

export function compareIsoDescending(left: string, right: string): number {
  return right.localeCompare(left);
}