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

export type WorkoutSession = {
  id: number;
  title: string;
  date: string;
  notes: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  exercises: WorkoutExercise[];
};
