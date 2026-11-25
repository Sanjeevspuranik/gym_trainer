import type { RoutineWeekday } from "./routine-plan";

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentLocalDate(): string {
  return localDateString(new Date());
}

export function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function routineWeekday(value: string): RoutineWeekday | null {
  const date = parseLocalDate(value);
  if (!date) {
    return null;
  }
  const day = date.getDay();
  return (day === 0 ? 7 : day) as RoutineWeekday;
}

export function isRoutineWeekStart(value: string): boolean {
  return routineWeekday(value) === 1;
}

export function routineWeekStart(value: string): string {
  const date = parseLocalDate(value);
  if (!date) {
    throw new RangeError("A valid local calendar date is required.");
  }
  const weekday = date.getDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  date.setDate(date.getDate() - daysSinceMonday);
  return localDateString(date);
}

export function shiftLocalDate(value: string, days: number): string {
  const date = parseLocalDate(value);
  if (!date || !Number.isInteger(days)) {
    throw new RangeError("A valid local date and whole-day offset are required.");
  }
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export function routineWeekDates(weekStart: string): string[] {
  if (!isRoutineWeekStart(weekStart)) {
    throw new RangeError("A Monday week start is required.");
  }
  return Array.from({ length: 7 }, (_, index) =>
    shiftLocalDate(weekStart, index),
  );
}

export function routineDateForWeekday(
  weekStart: string,
  weekday: RoutineWeekday,
): string {
  if (!isRoutineWeekStart(weekStart)) {
    throw new RangeError("A Monday week start is required.");
  }
  return shiftLocalDate(weekStart, weekday - 1);
}
