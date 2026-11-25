import type { RoutineDay } from "./routine-plan";

export type PublicUser = {
  id: number;
  username: string;
};

export type WorkoutExercise = {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
};

export type WorkoutSetResult = {
  setNumber: number;
  targetReps: number;
  targetWeightKg: number;
  actualReps: number | null;
  actualWeightKg: number | null;
  completedAt: string | null;
};

export type WorkoutSessionExercise = WorkoutExercise & {
  id: number;
  setResults: WorkoutSetResult[];
};

export type WorkoutRoutineSnapshot = {
  weekStart: string;
  weekday: number;
  day: RoutineDay;
  cardioCompleted: boolean;
};

export type WorkoutSetInput = {
  exerciseId: number;
  setNumber: number;
  actualReps: number;
  actualWeightKg: number;
  completed: boolean;
};

export type WorkoutSession = {
  id: number;
  title: string;
  date: string;
  notes: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  routine: WorkoutRoutineSnapshot | null;
  exercises: WorkoutSessionExercise[];
};
