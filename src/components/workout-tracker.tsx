"use client";

import { useState, type FormEvent } from "react";
import type {
  RoutineDay,
  RoutineExerciseOption,
} from "@/lib/routine-plan";
import type { WorkoutSession } from "@/lib/types";
import type { RoutineExerciseChoice } from "@/lib/routine-session";
import { parseLocalDate } from "@/lib/routine-dates";

type SetDraft = {
  actualReps: string;
  actualWeightKg: string;
};

type RoutineWorkoutSetupProps = {
  day: RoutineDay;
  date: string;
  weekStart: string;
  disabled: boolean;
  onCancel: () => void;
  onStart: (
    weekStart: string,
    date: string,
    exerciseChoices: RoutineExerciseChoice[],
  ) => Promise<void>;
};

type WorkoutTrackerProps = {
  session: WorkoutSession;
  setPending: string | null;
  cardioPending: boolean;
  finishPending: boolean;
  error: string;
  onSetUpdate: (
    sessionId: number,
    exerciseId: number,
    setNumber: number,
    actualReps: number,
    actualWeightKg: number,
    completed: boolean,
  ) => Promise<void>;
  onCardioUpdate: (
    sessionId: number,
    completed: boolean,
  ) => Promise<void>;
  onFinish: (sessionId: number) => Promise<void>;
  onClose: () => void;
};

type SetupChoice = {
  exerciseKey: string;
  optionIndex: number;
  weightKg: string;
};

function defaultLoad(option: RoutineExerciseOption): number {
  return option.minWeightKg ?? option.maxWeightKg ?? 0;
}

function formatRoutineDate(value: string): string {
  const date = parseLocalDate(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function setKey(exerciseId: number, setNumber: number): string {
  return `${exerciseId}:${setNumber}`;
}

export function RoutineWorkoutSetup({
  day,
  date,
  weekStart,
  disabled,
  onCancel,
  onStart,
}: RoutineWorkoutSetupProps) {
  const [choices, setChoices] = useState<SetupChoice[]>(() =>
    day.exercises.map((exercise) => {
      const option = exercise.options[0];
      return {
        exerciseKey: exercise.key,
        optionIndex: 0,
        weightKg: option ? String(defaultLoad(option)) : "0",
      };
    }),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function changeChoice(
    index: number,
    update: (choice: SetupChoice) => SetupChoice,
  ) {
    setChoices((current) =>
      current.map((choice, choiceIndex) =>
        choiceIndex === index ? update(choice) : choice,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) {
      return;
    }

    const exerciseChoices: RoutineExerciseChoice[] = [];
    for (const choice of choices) {
      const weightKg = Number(choice.weightKg);
      if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000) {
        setError("Enter a planned load between 0 and 1,000 kg for each exercise.");
        return;
      }
      exerciseChoices.push({
        exerciseKey: choice.exerciseKey,
        optionIndex: choice.optionIndex,
        weightKg,
      });
    }

    setPending(true);
    setError("");
    try {
      await onStart(weekStart, date, exerciseChoices);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "The workout could not be started. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="routine-workout-setup" onSubmit={handleSubmit}>
      <div className="routine-workout-header">
        <div>
          <p className="eyebrow">WORKOUT SETUP / {formatRoutineDate(date)}</p>
          <h3>{day.title}</h3>
          <p className="routine-day-description">
            Choose an exercise option and confirm the planned load before you
            start. Your routine will be saved with this workout.
          </p>
        </div>
      </div>

      <div className="routine-setup-exercises">
        {day.exercises.map((exercise, index) => {
          const choice = choices[index];
          const selectedOption = exercise.options[choice?.optionIndex ?? 0];
          if (!choice || !selectedOption) {
            return null;
          }
          return (
            <section className="routine-setup-exercise" key={exercise.key}>
              <div className="routine-setup-exercise-title">
                <span className="routine-exercise-order">
                  {exercise.block
                    ? `${exercise.block}${exercise.order}`
                    : String(exercise.order).padStart(2, "0")}
                </span>
                <div>
                  <h4>{selectedOption.name}</h4>
                  <p>
                    {exercise.sets.min === exercise.sets.max
                      ? exercise.sets.min
                      : `${exercise.sets.min}–${exercise.sets.max}`}{" "}
                    sets ×{" "}
                    {exercise.reps.min === exercise.reps.max
                      ? exercise.reps.min
                      : `${exercise.reps.min}–${exercise.reps.max}`}{" "}
                    reps
                  </p>
                </div>
              </div>

              <div className="routine-setup-fields">
                {exercise.options.length > 1 && (
                  <label>
                    <span>Exercise option</span>
                    <select
                      className="text-input"
                      value={choice.optionIndex}
                      disabled={pending || disabled}
                      onChange={(event) => {
                        const optionIndex = Number(event.target.value);
                        const option = exercise.options[optionIndex];
                        if (!option) {
                          return;
                        }
                        changeChoice(index, (current) => ({
                          ...current,
                          optionIndex,
                          weightKg: String(defaultLoad(option)),
                        }));
                      }}
                    >
                      {exercise.options.map((option, optionIndex) => (
                        <option value={optionIndex} key={`${exercise.key}-${optionIndex}`}>
                          {option.name} · {option.equipment}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span>
                    Planned load ({selectedOption.weightLabel || "kg"})
                  </span>
                  <input
                    className="text-input"
                    type="number"
                    min={
                      selectedOption.minWeightKg ??
                      (selectedOption.loadBasis === "choose-at-session"
                        ? 0.25
                        : 0)
                    }
                    max={selectedOption.maxWeightKg ?? 1000}
                    step="0.25"
                    value={choice.weightKg}
                    required
                    disabled={pending || disabled}
                    onChange={(event) =>
                      changeChoice(index, (current) => ({
                        ...current,
                        weightKg: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              {selectedOption.notes && (
                <p className="routine-setup-note">{selectedOption.notes}</p>
              )}
            </section>
          );
        })}
      </div>

      {error && (
        <p className="message" role="alert">
          {error}
        </p>
      )}
      <div className="routine-workout-actions">
        <button
          className="button button-outline button-compact"
          type="button"
          disabled={pending || disabled}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="button button-compact"
          type="submit"
          disabled={pending || disabled}
        >
          {pending ? "Starting…" : "Begin workout"}
        </button>
      </div>
    </form>
  );
}

function initialSetDrafts(session: WorkoutSession): Record<string, SetDraft> {
  const drafts: Record<string, SetDraft> = {};
  for (const exercise of session.exercises) {
    for (const set of exercise.setResults) {
      drafts[setKey(exercise.id, set.setNumber)] = {
        actualReps: String(set.actualReps ?? set.targetReps),
        actualWeightKg: String(
          set.actualWeightKg ?? set.targetWeightKg,
        ),
      };
    }
  }
  return drafts;
}

export function WorkoutTracker({
  session,
  setPending,
  cardioPending,
  finishPending,
  error,
  onSetUpdate,
  onCardioUpdate,
  onFinish,
  onClose,
}: WorkoutTrackerProps) {
  const [setDrafts, setSetDrafts] = useState(() => initialSetDrafts(session));
  const [localError, setLocalError] = useState("");
  const totalSets = session.exercises.reduce(
    (total, exercise) => total + exercise.sets,
    0,
  );
  const completedSets = session.exercises.reduce(
    (total, exercise) =>
      total +
      exercise.setResults.filter((set) => set.completedAt !== null).length,
    0,
  );
  const allSetRowsPresent = session.exercises.every(
    (exercise) => exercise.setResults.length === exercise.sets,
  );
  const cardioRequired =
    (session.routine?.day.cardioFinisher.length ?? 0) > 0;
  const canFinish =
    totalSets > 0 &&
    allSetRowsPresent &&
    completedSets === totalSets &&
    (!cardioRequired || session.routine?.cardioCompleted === true);
  const hasUnsavedSetValues = session.exercises.some((exercise) =>
    exercise.setResults.some((set) => {
      const key = setKey(exercise.id, set.setNumber);
      const draft = setDrafts[key];
      return (
        draft !== undefined &&
        (draft.actualReps !== String(set.actualReps ?? set.targetReps) ||
          draft.actualWeightKg !==
            String(set.actualWeightKg ?? set.targetWeightKg))
      );
    }),
  );

  async function saveSet(
    exerciseId: number,
    setNumber: number,
    completed: boolean,
  ) {
    const key = setKey(exerciseId, setNumber);
    const draft = setDrafts[key];
    if (!draft || setPending !== null || session.completed) {
      return;
    }
    const actualReps = Number(draft.actualReps);
    const actualWeightKg = Number(draft.actualWeightKg);
    if (
      !Number.isInteger(actualReps) ||
      actualReps < 1 ||
      actualReps > 100 ||
      !Number.isFinite(actualWeightKg) ||
      actualWeightKg < 0 ||
      actualWeightKg > 1000
    ) {
      setLocalError("Enter valid actual reps and weight before saving this set.");
      return;
    }
    setLocalError("");
    try {
      await onSetUpdate(
        session.id,
        exerciseId,
        setNumber,
        actualReps,
        actualWeightKg,
        completed,
      );
    } catch (saveError) {
      setLocalError(
        saveError instanceof Error
          ? saveError.message
          : "The set could not be saved. Please try again.",
      );
    }
  }

  async function toggleCardio() {
    if (!session.routine || cardioPending || session.completed) {
      return;
    }
    try {
      await onCardioUpdate(
        session.id,
        !session.routine.cardioCompleted,
      );
    } catch (cardioError) {
      setLocalError(
        cardioError instanceof Error
          ? cardioError.message
          : "The treadmill finisher could not be updated.",
      );
    }
  }

  async function finishWorkout() {
    if (!canFinish || finishPending || session.completed) {
      return;
    }
    try {
      await onFinish(session.id);
    } catch (finishError) {
      setLocalError(
        finishError instanceof Error
          ? finishError.message
          : "The workout could not be finished.",
      );
    }
  }

  function closeTracker() {
    if (
      hasUnsavedSetValues &&
      !window.confirm(
        "Some actual set values have not been saved. Close the tracker and discard those changes?",
      )
    ) {
      return;
    }
    onClose();
  }

  return (
    <section className="workout-tracker" aria-labelledby="workoutTrackerHeading">
      <div className="routine-workout-header">
        <div>
          <p className="eyebrow">
            {session.completed ? "WORKOUT COMPLETE" : "ACTIVE WORKOUT"} /{" "}
            {session.date}
          </p>
          <h3 id="workoutTrackerHeading">{session.title}</h3>
          <p className="routine-day-description">
            {completedSets} of {totalSets} sets complete
            {cardioRequired
              ? ` · treadmill ${session.routine?.cardioCompleted ? "complete" : "not complete"}`
              : ""}
          </p>
        </div>
        <button
          className="button button-outline button-compact"
          type="button"
          onClick={closeTracker}
        >
          Close tracker
        </button>
      </div>

      {(error || localError) && (
        <p className="message" role="alert">
          {localError || error}
        </p>
      )}

      <div className="workout-tracker-exercises">
        {session.exercises.map((exercise, exerciseIndex) => (
          <section className="workout-tracker-exercise" key={exercise.id}>
            <div className="workout-tracker-exercise-header">
              <span className="routine-exercise-order">
                {String(exerciseIndex + 1).padStart(2, "0")}
              </span>
              <div>
                <h4>{exercise.name}</h4>
                <p>
                  Plan: {exercise.sets} × {exercise.reps} · {exercise.weightKg}{" "}
                  kg
                </p>
              </div>
            </div>
            <div className="workout-set-list">
              {exercise.setResults.map((set) => {
                const key = setKey(exercise.id, set.setNumber);
                const draft = setDrafts[key] ?? {
                  actualReps: String(set.targetReps),
                  actualWeightKg: String(set.targetWeightKg),
                };
                const isComplete = set.completedAt !== null;
                return (
                  <div className="workout-set-row" key={key}>
                    <div className="workout-set-target">
                      <strong>Set {set.setNumber}</strong>
                      <span>
                        Target {set.targetReps} reps · {set.targetWeightKg} kg
                      </span>
                    </div>
                    <label>
                      <span>Actual reps</span>
                      <input
                        className="text-input"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={draft.actualReps}
                        disabled={session.completed || setPending !== null}
                        onChange={(event) => {
                          setSetDrafts((current) => ({
                            ...current,
                            [key]: {
                              ...draft,
                              actualReps: event.target.value,
                            },
                          }));
                        }}
                      />
                    </label>
                    <label>
                      <span>Actual kg</span>
                      <input
                        className="text-input"
                        type="number"
                        min="0"
                        max="1000"
                        step="0.25"
                        value={draft.actualWeightKg}
                        disabled={session.completed || setPending !== null}
                        onChange={(event) => {
                          setSetDrafts((current) => ({
                            ...current,
                            [key]: {
                              ...draft,
                              actualWeightKg: event.target.value,
                            },
                          }));
                        }}
                      />
                    </label>
                    <button
                      className={`button button-compact workout-set-toggle${isComplete ? " is-set-complete" : ""}`}
                      type="button"
                      disabled={session.completed || setPending !== null}
                      aria-label={`${isComplete ? "Undo completion of" : "Mark"} set ${set.setNumber} for ${exercise.name}`}
                      onClick={() =>
                        void saveSet(exercise.id, set.setNumber, !isComplete)
                      }
                    >
                      {setPending === key
                        ? "Saving…"
                        : isComplete
                          ? "Done ✓"
                          : "Complete set"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {cardioRequired && session.routine && (
        <section className="workout-cardio-check">
          <div>
            <p className="eyebrow">CARDIO FINISHER</p>
            <h4>Treadmill · {session.routine.day.cardioFinisher.reduce(
              (total, segment) => total + segment.durationMinutes,
              0,
            )} min</h4>
            <p>
              {session.routine.day.cardioFinisher
                .map(
                  (segment) =>
                    `${segment.durationMinutes} min · Speed ${segment.speed.toFixed(1)} · Incline ${segment.inclinePercent}%`,
                )
                .join(" / ")}
            </p>
          </div>
          <button
            className={`button button-compact${session.routine.cardioCompleted ? " is-set-complete" : ""}`}
            type="button"
            disabled={cardioPending || session.completed}
            onClick={() => void toggleCardio()}
          >
            {cardioPending
              ? "Saving…"
              : session.routine.cardioCompleted
                ? "Finisher complete ✓"
                : "Mark finisher complete"}
          </button>
        </section>
      )}

      <div className="workout-tracker-footer">
        {session.completed ? (
          <p className="message" data-kind="success" role="status">
            Workout saved as complete in your training history.
          </p>
        ) : (
          <>
            <p className="workout-tracker-hint">
              Your set and finisher updates save as you mark them complete.
              Finish is enabled when all planned work is checked off.
            </p>
            <button
              className="button button-compact"
              type="button"
              disabled={!canFinish || finishPending}
              onClick={() => void finishWorkout()}
            >
              {finishPending ? "Finishing…" : "Finish workout"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
