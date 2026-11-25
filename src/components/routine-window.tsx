"use client";

import { useState, type FormEvent } from "react";
import type { RoutineDay, RoutineExerciseOption, WeeklyRoutine } from "@/lib/routine-plan";
import type { RoutineExerciseChoice } from "@/lib/routine-session";
import type { WorkoutSession } from "@/lib/types";
import {
  parseLocalDate,
  routineWeekDates,
} from "@/lib/routine-dates";
import RoutineEditor from "@/components/routine-editor";
import {
  RoutineWorkoutSetup,
  WorkoutTracker,
} from "@/components/workout-tracker";

type RoutineWindowProps = {
  routine: WeeklyRoutine | null;
  selectedDate: string;
  todayDate: string;
  weekStart: string;
  loading: boolean;
  error: string;
  isOverride: boolean;
  activeWorkout: WorkoutSession | null;
  inProgressWorkout: WorkoutSession | null;
  startingWorkout: boolean;
  setPending: string | null;
  cardioPending: boolean;
  finishPending: boolean;
  onStartWorkout: (
    weekStart: string,
    date: string,
    exerciseChoices: RoutineExerciseChoice[],
  ) => Promise<void>;
  onResumeWorkout: (sessionId: number) => void;
  onSetUpdate: (
    sessionId: number,
    exerciseId: number,
    setNumber: number,
    actualReps: number,
    actualWeightKg: number,
    completed: boolean,
  ) => Promise<void>;
  onCardioUpdate: (sessionId: number, completed: boolean) => Promise<void>;
  onFinishWorkout: (sessionId: number) => Promise<void>;
  onCloseTracker: () => void;
  onSelectDate: (date: string) => void;
  onChangeWeek: (weekOffset: number) => void;
  onSaveRoutine: (
    weekStart: string,
    routine: WeeklyRoutine,
  ) => Promise<void>;
  onResetRoutine: (weekStart: string) => Promise<void>;
};

function formatDayName(dateValue: string, style: "short" | "long"): string {
  const date = parseLocalDate(dateValue);
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, { weekday: style }).format(date);
}

function formatDayNumber(dateValue: string): string {
  return parseLocalDate(dateValue)?.getDate().toString() ?? "";
}

function formatDate(dateValue: string): string {
  const date = parseLocalDate(dateValue);
  if (!date) {
    return dateValue;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatWeekRange(weekStart: string): string {
  const firstDay = parseLocalDate(weekStart);
  if (!firstDay) {
    return weekStart;
  }
  const lastDay = new Date(firstDay);
  lastDay.setDate(lastDay.getDate() + 6);
  const firstLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(firstDay);
  const lastLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(lastDay);
  return `${firstLabel} – ${lastLabel}`;
}

function formatTime(value: string): string {
  const [hoursValue, minutes] = value.split(":").map(Number);
  if (
    !Number.isInteger(hoursValue) ||
    !Number.isInteger(minutes) ||
    hoursValue < 0 ||
    hoursValue > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return value;
  }
  const period = hoursValue >= 12 ? "PM" : "AM";
  const hours = hoursValue % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

function getDayKindLabel(day: RoutineDay): string {
  if (day.kind === "active-recovery") {
    return "ACTIVE RECOVERY";
  }
  return day.kind === "rest" ? "FULL REST" : "LIFTING DAY";
}

function getLoadBasisLabel(basis: RoutineExerciseOption["loadBasis"]): string {
  switch (basis) {
    case "baseline":
      return "PLAN LOAD";
    case "suggested-start":
      return "SUGGESTED START";
    case "progression-target":
      return "PROGRESSION OPTION";
    case "choose-at-session":
      return "CHOOSE LOAD";
  }
}

function RoutineExerciseCard({
  day,
  exerciseIndex,
}: {
  day: RoutineDay;
  exerciseIndex: number;
}) {
  const exercise = day.exercises[exerciseIndex];
  if (!exercise) {
    return null;
  }

  const previousBlock =
    exerciseIndex > 0 ? day.exercises[exerciseIndex - 1]?.block : null;
  const showBlock = exercise.block !== null && exercise.block !== previousBlock;

  return (
    <>
      {showBlock && (
        <div className={`routine-block-label block-label-${exercise.block?.toLowerCase()}`}>
          <span>BLOCK {exercise.block}</span>
          <span>SUPERSET</span>
        </div>
      )}
      <article className="routine-exercise-card">
        <div className="routine-exercise-target">
          <span className="routine-exercise-order">
            {exercise.block
              ? `${exercise.block}${exercise.order}`
              : String(exercise.order).padStart(2, "0")}
          </span>
          <div className="routine-exercise-title">
            <h4>{exercise.options[0]?.name ?? "Exercise"}</h4>
            <p>
              {formatRange(exercise.sets.min, exercise.sets.max)} sets
              {" × "}
              {formatRange(exercise.reps.min, exercise.reps.max)} reps
            </p>
          </div>
        </div>

        <div className="routine-option-list">
          {exercise.options.map((option, optionIndex) => {
            const isAlternative = exercise.options.length > 1;
            const minWeight = option.minWeightKg;
            const maxWeight = option.maxWeightKg;
            const load =
              minWeight !== null && maxWeight !== null
                ? `${formatRange(minWeight, maxWeight)} ${option.weightLabel}`
                : option.weightLabel;

            return (
              <div
                className="routine-option"
                key={`${exercise.key}-${optionIndex}`}
              >
                <div className="routine-option-heading">
                  <span className="routine-option-name">
                    {isAlternative && (
                      <span className="routine-option-choice">
                        {optionIndex === 0 ? "OPTION A" : `OPTION ${String.fromCharCode(65 + optionIndex)}`}
                      </span>
                    )}
                    {option.name}
                  </span>
                  <span className="routine-load">{load}</span>
                </div>
                <div className="routine-option-meta">
                  <span>{option.equipment}</span>
                  <span className="routine-load-basis">
                    {getLoadBasisLabel(option.loadBasis)}
                  </span>
                </div>
                {option.notes && <p className="routine-option-note">{option.notes}</p>}
              </div>
            );
          })}
        </div>

        {(exercise.transitionSeconds !== null ||
          exercise.restSeconds !== null ||
          exercise.tempo) && (
          <div className="routine-exercise-guidance">
            {exercise.transitionSeconds !== null && (
              <span>{exercise.transitionSeconds}s transition</span>
            )}
            {exercise.restSeconds !== null && (
              <span>{exercise.restSeconds}s rest</span>
            )}
            {exercise.tempo && <span>{exercise.tempo}</span>}
            {exercise.notes && <span>{exercise.notes}</span>}
          </div>
        )}
      </article>
    </>
  );
}

export default function RoutineWindow({
  routine,
  selectedDate,
  todayDate,
  weekStart,
  loading,
  error,
  isOverride,
  activeWorkout,
  inProgressWorkout,
  startingWorkout,
  setPending,
  cardioPending,
  finishPending,
  onStartWorkout,
  onResumeWorkout,
  onSetUpdate,
  onCardioUpdate,
  onFinishWorkout,
  onCloseTracker,
  onSelectDate,
  onChangeWeek,
  onSaveRoutine,
  onResetRoutine,
}: RoutineWindowProps) {
  const [draft, setDraft] = useState<WeeklyRoutine | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [preparingWorkout, setPreparingWorkout] = useState(false);
  const daysInWeek = routineWeekDates(weekStart);
  const selectedDay = routine?.days.find(
    (day) => day.weekday === (parseLocalDate(selectedDate)?.getDay() || 7),
  );
  const proteinTarget =
    routine?.proteinTargetGrams ?? { min: 120, max: 150 };
  const trainingWindow =
    routine?.trainingWindow ?? { start: "07:00", end: "08:30" };
  const todayIsSelected = selectedDate === todayDate;
  const totalCardioMinutes =
    selectedDay?.cardioFinisher.reduce(
      (total, segment) => total + segment.durationMinutes,
      0,
    ) ?? 0;
  const hasUnsavedChanges =
    draft !== null &&
    routine !== null &&
    JSON.stringify(draft) !== JSON.stringify(routine);

  async function startWorkout(
    selectedWeekStart: string,
    date: string,
    exerciseChoices: RoutineExerciseChoice[],
  ) {
    await onStartWorkout(selectedWeekStart, date, exerciseChoices);
    setPreparingWorkout(false);
  }

  function beginEditing() {
    if (!routine) {
      return;
    }
    setEditError("");
    setDraft(structuredClone(routine));
  }

  function cancelEditing() {
    if (
      hasUnsavedChanges &&
      !window.confirm("Discard your unsaved edits to this week?")
    ) {
      return;
    }
    setDraft(null);
    setEditError("");
  }

  function changeWeek(weekOffset: number) {
    if (saving) {
      return;
    }
    if (draft && !cancelIfDirty()) {
      return;
    }
    onChangeWeek(weekOffset);
  }

  function cancelIfDirty(): boolean {
    if (hasUnsavedChanges) {
      if (!window.confirm("Discard your unsaved edits to this week?")) {
        return false;
      }
    }
    setDraft(null);
    setEditError("");
    return true;
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) {
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await onSaveRoutine(weekStart, draft);
      setDraft(null);
    } catch (saveError) {
      setEditError(
        saveError instanceof Error
          ? saveError.message
          : "The routine could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetWeek() {
    if (saving || !isOverride) {
      return;
    }
    if (
      !window.confirm(
        `Restore the week of ${formatWeekRange(weekStart)} to the default routine?`,
      )
    ) {
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await onResetRoutine(weekStart);
      setDraft(null);
    } catch (resetError) {
      setEditError(
        resetError instanceof Error
          ? resetError.message
          : "The default routine could not be restored. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="routine-window section-panel" aria-labelledby="routineHeading">
      <div className="routine-window-header">
        <div>
          <p className="eyebrow">YOUR PLAN / THIS WEEK</p>
          <h2 id="routineHeading">Weekly routine.</h2>
        </div>
        <div className="routine-chip-row" aria-label="Daily routine targets">
          <span className="routine-chip protein-target-chip">
            <span>PROTEIN TARGET</span>
            <strong>
              {proteinTarget.min}–{proteinTarget.max} g/day
            </strong>
          </span>
          <span className="routine-chip">
            <span>TRAINING WINDOW</span>
            <strong>
              {formatTime(trainingWindow.start)}–{formatTime(trainingWindow.end)}
            </strong>
          </span>
        </div>
      </div>

      <div className="routine-week-controls">
        <button
          className="button button-outline button-compact routine-week-button"
          type="button"
          aria-label="Show previous week"
          disabled={saving}
          onClick={() => changeWeek(-1)}
        >
          <span aria-hidden="true">←</span> Previous week
        </button>
        <p className="routine-week-range">{formatWeekRange(weekStart)}</p>
        <button
          className="button button-outline button-compact routine-week-button"
          type="button"
          aria-label="Show next week"
          disabled={saving}
          onClick={() => changeWeek(1)}
        >
          Next week <span aria-hidden="true">→</span>
        </button>
      </div>

      <nav className="routine-week-strip" aria-label="Select a routine day">
        {daysInWeek.map((date, index) => {
          const weekday = (index + 1) as RoutineDay["weekday"];
          const day = routine?.days.find((item) => item.weekday === weekday);
          const selected = date === selectedDate;
          const isToday = date === todayDate;
          return (
            <button
              className={`routine-day-button${selected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
              type="button"
              key={date}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={selected}
              disabled={saving}
              aria-label={`${formatDayName(date, "long")}, ${formatDate(date)}${day ? `, ${day.title}` : ""}${isToday ? ", today" : ""}`}
              onClick={() => onSelectDate(date)}
            >
              <span className="routine-day-name">{formatDayName(date, "short")}</span>
              <strong className="routine-day-number">{formatDayNumber(date)}</strong>
              <span className="routine-day-focus">{day?.title ?? "Plan"}</span>
              {isToday && <span className="routine-day-today">TODAY</span>}
            </button>
          );
        })}
      </nav>

      <div className="routine-day-panel" aria-live="polite" aria-busy={loading}>
        {activeWorkout ? (
          <WorkoutTracker
            key={activeWorkout.id}
            session={activeWorkout}
            error=""
            setPending={setPending}
            cardioPending={cardioPending}
            finishPending={finishPending}
            onSetUpdate={onSetUpdate}
            onCardioUpdate={onCardioUpdate}
            onFinish={onFinishWorkout}
            onClose={onCloseTracker}
          />
        ) : loading ? (
          <p className="routine-state-message" role="status">
            Loading this week’s routine…
          </p>
        ) : error ? (
          <p className="message" role="alert">
            {error}
          </p>
        ) : !routine || !selectedDay ? (
          <p className="message" role="alert">
            The selected day is not available in this routine.
          </p>
        ) : draft ? (
          <RoutineEditor
            routine={draft}
            saving={saving}
            error={editError}
            onCancel={cancelEditing}
            onSubmit={saveDraft}
            onChange={setDraft}
          />
        ) : (
          <>
            <div className="routine-day-header">
              <div>
                <p className="eyebrow">
                  {todayIsSelected ? "TODAY’S PLAN" : "DAY PREVIEW"} /{" "}
                  {formatDate(selectedDate)}
                </p>
                <h3>{selectedDay.title}</h3>
                <p className="routine-day-description">{selectedDay.notes}</p>
              </div>
              <span className={`routine-kind-badge kind-${selectedDay.kind}`}>
                {getDayKindLabel(selectedDay)}
              </span>
              <div className="routine-week-actions">
                {!preparingWorkout && inProgressWorkout ? (
                  <button
                    className="button button-compact"
                    type="button"
                    onClick={() => onResumeWorkout(inProgressWorkout.id)}
                  >
                    Continue in-progress workout
                  </button>
                ) : !preparingWorkout && (
                  selectedDay.kind === "lifting" && (
                    <button
                      className="button button-compact"
                      type="button"
                      disabled={startingWorkout}
                      onClick={() => setPreparingWorkout(true)}
                    >
                      {startingWorkout ? "Starting…" : "Start workout"}
                    </button>
                  )
                )}
                {isOverride && (
                  <button
                    className="button button-text button-compact"
                    type="button"
                    disabled={saving}
                    onClick={() => void resetWeek()}
                  >
                    Restore default
                  </button>
                )}
                <button
                  className="button button-outline button-compact"
                  type="button"
                  disabled={saving}
                  onClick={beginEditing}
                >
                  Edit this week
                </button>
              </div>
            </div>

            {preparingWorkout ? (
              <RoutineWorkoutSetup
                key={`${weekStart}-${selectedDay.weekday}`}
                day={selectedDay}
                date={selectedDate}
                weekStart={weekStart}
                disabled={Boolean(inProgressWorkout)}
                onCancel={() => setPreparingWorkout(false)}
                onStart={startWorkout}
              />
            ) : selectedDay.exercises.length > 0 ? (
              <div className="routine-exercise-list" aria-label="Planned exercises">
                {selectedDay.exercises.map((exercise, index) => (
                  <RoutineExerciseCard
                    key={exercise.key}
                    day={selectedDay}
                    exerciseIndex={index}
                  />
                ))}
              </div>
            ) : selectedDay.kind === "active-recovery" ? (
              <div className="routine-recovery-list">
                {selectedDay.recoveryActivities.map((activity, index) => (
                  <div className="routine-recovery-card" key={activity}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{activity}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="routine-rest-card">
                <span className="routine-rest-symbol" aria-hidden="true">
                  ×
                </span>
                <p>Rest day. No gym workout or cardio is scheduled.</p>
              </div>
            )}

            {selectedDay.cardioFinisher.length > 0 && (
              <section className="routine-cardio" aria-labelledby="cardioHeading">
                <div className="routine-cardio-heading">
                  <div>
                    <p className="eyebrow">AFTER WEIGHTS</p>
                    <h4 id="cardioHeading">
                      Treadmill finisher · {totalCardioMinutes} min
                    </h4>
                  </div>
                  <span className="routine-cardio-mark" aria-hidden="true">
                    +
                  </span>
                </div>
                <div className="routine-cardio-segments">
                  {selectedDay.cardioFinisher.map((segment, index) => (
                    <div className="routine-cardio-segment" key={`${segment.durationMinutes}-${index}`}>
                      <strong>{segment.durationMinutes} min</strong>
                      <span>Speed {segment.speed.toFixed(1)}</span>
                      <span>Incline {segment.inclinePercent}%</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="routine-plan-footer">
              <span>{routine.equipmentRule}</span>
              <details className="routine-progression">
                <summary>Progression rule</summary>
                <p>{routine.progressionRule}</p>
              </details>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
