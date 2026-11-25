"use client";

import type {
  RoutineDay,
  RoutineExercise,
  RoutineExerciseOption,
  WeeklyRoutine,
} from "@/lib/routine-plan";
import type { FormEvent } from "react";

type RoutineEditorProps = {
  routine: WeeklyRoutine;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (routine: WeeklyRoutine) => void;
};

function updateDay(
  routine: WeeklyRoutine,
  weekday: RoutineDay["weekday"],
  update: (day: RoutineDay) => RoutineDay,
): WeeklyRoutine {
  return {
    ...routine,
    days: routine.days.map((day) =>
      day.weekday === weekday ? update(day) : day,
    ),
  };
}

function updateExercise(
  day: RoutineDay,
  index: number,
  update: (exercise: RoutineExercise) => RoutineExercise,
): RoutineDay {
  return {
    ...day,
    exercises: day.exercises.map((exercise, exerciseIndex) =>
      exerciseIndex === index ? update(exercise) : exercise,
    ),
  };
}

function numberValue(value: string): number | null {
  if (value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function newExercise(day: RoutineDay, index: number): RoutineExercise {
  return {
    key: `custom-${day.weekday}-${crypto.randomUUID()}`,
    block: null,
    order: index + 1,
    sets: { min: 3, max: 3 },
    reps: { min: 8, max: 8 },
    restSeconds: 90,
    transitionSeconds: null,
    tempo: null,
    notes: "",
    options: [
      {
        name: "New exercise",
        equipment: "Dumbbell",
        minWeightKg: null,
        maxWeightKg: null,
        weightLabel: "choose at session",
        loadBasis: "choose-at-session",
        notes: "",
      },
    ],
  };
}

function newAlternative(): RoutineExerciseOption {
  return {
    name: "Alternative exercise",
    equipment: "Dumbbell",
    minWeightKg: null,
    maxWeightKg: null,
    weightLabel: "choose at session",
    loadBasis: "choose-at-session",
    notes: "",
  };
}

function newCardioSegment(): RoutineDay["cardioFinisher"][number] {
  return {
    durationMinutes: 5,
    speed: 0,
    speedUnit: null,
    inclinePercent: 0,
  };
}

function updateOption(
  exercise: RoutineExercise,
  optionIndex: number,
  update: (option: RoutineExerciseOption) => RoutineExerciseOption,
): RoutineExercise {
  return {
    ...exercise,
    options: exercise.options.map((option, index) =>
      index === optionIndex ? update(option) : option,
    ),
  };
}

export default function RoutineEditor({
  routine,
  saving,
  error,
  onCancel,
  onSubmit,
  onChange,
}: RoutineEditorProps) {
  function changeDay(
    weekday: RoutineDay["weekday"],
    update: (day: RoutineDay) => RoutineDay,
  ) {
    onChange(updateDay(routine, weekday, update));
  }

  function changeExercise(
    weekday: RoutineDay["weekday"],
    exerciseIndex: number,
    update: (exercise: RoutineExercise) => RoutineExercise,
  ) {
    changeDay(weekday, (day) =>
      updateExercise(day, exerciseIndex, update),
    );
  }

  function moveExercise(
    weekday: RoutineDay["weekday"],
    exerciseIndex: number,
    direction: -1 | 1,
  ) {
    changeDay(weekday, (day) => {
      const targetIndex = exerciseIndex + direction;
      if (targetIndex < 0 || targetIndex >= day.exercises.length) {
        return day;
      }
      const exercises = [...day.exercises];
      [exercises[exerciseIndex], exercises[targetIndex]] = [
        exercises[targetIndex],
        exercises[exerciseIndex],
      ];
      return {
        ...day,
        exercises: exercises.map((exercise, index) => ({
          ...exercise,
          order: index + 1,
        })),
      };
    });
  }

  return (
    <form className="routine-editor" onSubmit={onSubmit}>
      <div className="routine-editor-header">
        <div>
          <p className="eyebrow">WEEK OVERRIDE</p>
          <h4>Edit this week&apos;s plan</h4>
          <p className="routine-editor-hint">
            Changes apply only to the selected week. Other weeks and completed
            workouts are left unchanged.
          </p>
        </div>
        <div className="routine-editor-actions">
          <button
            className="button button-outline button-compact"
            type="button"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button className="button button-compact" type="submit" disabled={saving}>
            {saving ? "Saving week…" : "Save this week"}
          </button>
        </div>
      </div>

      {error && (
        <p className="message" role="alert">
          {error}
        </p>
      )}

      <fieldset className="routine-editor-settings">
        <legend>Routine settings</legend>
        <label className="routine-editor-wide-field">
          <span>Routine name</span>
          <input
            className="text-input"
            value={routine.name}
            maxLength={80}
            required
            onChange={(event) =>
              onChange({ ...routine, name: event.target.value })
            }
          />
        </label>
        <div className="routine-editor-top-fields">
          <label>
            <span>Training starts</span>
            <input
              className="text-input"
              type="time"
              value={routine.trainingWindow.start}
              required
              onChange={(event) =>
                onChange({
                  ...routine,
                  trainingWindow: {
                    ...routine.trainingWindow,
                    start: event.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            <span>Training ends</span>
            <input
              className="text-input"
              type="time"
              value={routine.trainingWindow.end}
              required
              onChange={(event) =>
                onChange({
                  ...routine,
                  trainingWindow: {
                    ...routine.trainingWindow,
                    end: event.target.value,
                  },
                })
              }
            />
          </label>
        </div>
        <p className="routine-editor-hint">
          Protein target remains {routine.proteinTargetGrams.min}–
          {routine.proteinTargetGrams.max} g/day.
        </p>
        <label className="routine-editor-wide-field">
          <span>Progression rule</span>
          <textarea
            className="text-input routine-editor-textarea"
            value={routine.progressionRule}
            maxLength={500}
            required
            onChange={(event) =>
              onChange({ ...routine, progressionRule: event.target.value })
            }
          />
        </label>
      </fieldset>

      <div className="routine-editor-days">
        {routine.days.map((day) => (
          <details className="routine-editor-day" key={day.weekday}>
            <summary>
              <span>{day.title}</span>
              <span className="routine-editor-day-type">
                {day.kind.replace("-", " ")}
              </span>
            </summary>
            <div className="routine-editor-day-content">
              <div className="routine-editor-day-fields">
                <label>
                  <span>Day focus</span>
                  <input
                    className="text-input"
                    value={day.title}
                    maxLength={80}
                    required
                    onChange={(event) =>
                      changeDay(day.weekday, (current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Day type</span>
                  <select
                    className="text-input"
                    value={day.kind}
                    onChange={(event) => {
                      const kind = event.target.value as RoutineDay["kind"];
                      if (
                        kind !== "lifting" &&
                        (day.exercises.length > 0 ||
                          day.cardioFinisher.length > 0) &&
                        !window.confirm(
                          "Changing this day to recovery or rest removes its planned exercises and cardio. Continue?",
                        )
                      ) {
                        event.currentTarget.value = day.kind;
                        return;
                      }
                      changeDay(day.weekday, (current) => ({
                        ...current,
                        kind,
                        exercises:
                          kind === "lifting" ? current.exercises : [],
                        cardioFinisher:
                          kind === "lifting" ? current.cardioFinisher : [],
                      }));
                    }}
                  >
                    <option value="lifting">Lifting day</option>
                    <option value="active-recovery">Active recovery</option>
                    <option value="rest">Full rest</option>
                  </select>
                </label>
              </div>

              <label className="routine-editor-wide-field">
                <span>Day notes</span>
                <textarea
                  className="text-input routine-editor-textarea"
                  value={day.notes}
                  maxLength={500}
                  onChange={(event) =>
                    changeDay(day.weekday, (current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>

              {day.kind === "active-recovery" && (
                <label className="routine-editor-wide-field">
                  <span>Recovery activities (one per line)</span>
                  <textarea
                    className="text-input routine-editor-textarea"
                    value={day.recoveryActivities.join("\n")}
                    onChange={(event) =>
                      changeDay(day.weekday, (current) => ({
                        ...current,
                        recoveryActivities: event.target.value
                          .split(/\r?\n/)
                          .map((activity) => activity.trim())
                          .filter(Boolean)
                          .slice(0, 8),
                      }))
                    }
                  />
                </label>
              )}

              {day.kind === "lifting" && (
                <>
                  <div className="routine-editor-list-heading">
                    <h5>Exercises</h5>
                    <button
                      className="button button-outline button-compact"
                      type="button"
                      disabled={day.exercises.length >= 20 || saving}
                      onClick={() =>
                        changeDay(day.weekday, (current) => ({
                          ...current,
                          exercises: [
                            ...current.exercises,
                            newExercise(current, current.exercises.length),
                          ],
                        }))
                      }
                    >
                      Add exercise
                    </button>
                  </div>

                  {day.exercises.map((exercise, exerciseIndex) => (
                    <fieldset
                      className="routine-editor-exercise"
                      key={exercise.key}
                    >
                      <legend>
                        {exercise.block
                          ? `Block ${exercise.block} · ${exercise.block}${exercise.order}`
                          : `Exercise ${exercise.order}`}
                      </legend>
                      <div className="routine-editor-exercise-actions">
                        <button
                          className="button button-text button-compact"
                          type="button"
                          aria-label={`Move ${exercise.options[0]?.name ?? "exercise"} up`}
                          disabled={exerciseIndex === 0 || saving}
                          onClick={() =>
                            moveExercise(day.weekday, exerciseIndex, -1)
                          }
                        >
                          Move up
                        </button>
                        <button
                          className="button button-text button-compact"
                          type="button"
                          aria-label={`Move ${exercise.options[0]?.name ?? "exercise"} down`}
                          disabled={
                            exerciseIndex === day.exercises.length - 1 || saving
                          }
                          onClick={() =>
                            moveExercise(day.weekday, exerciseIndex, 1)
                          }
                        >
                          Move down
                        </button>
                        <button
                          className="button button-text button-compact"
                          type="button"
                          aria-label={`Remove ${exercise.options[0]?.name ?? "exercise"}`}
                          disabled={saving}
                          onClick={() =>
                            changeDay(day.weekday, (current) => ({
                              ...current,
                              exercises: current.exercises
                                .filter((_, index) => index !== exerciseIndex)
                                .map((item, index) => ({
                                  ...item,
                                  order: index + 1,
                                })),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>

                      <div className="routine-editor-exercise-fields">
                        <label>
                          <span>Superset block</span>
                          <select
                            className="text-input"
                            value={exercise.block ?? ""}
                            onChange={(event) =>
                              changeExercise(day.weekday, exerciseIndex, (item) => ({
                                ...item,
                                block:
                                  event.target.value === ""
                                    ? null
                                    : (event.target.value as "A" | "B" | "C"),
                              }))
                            }
                          >
                            <option value="">No block</option>
                            <option value="A">Block A</option>
                            <option value="B">Block B</option>
                            <option value="C">Block C</option>
                          </select>
                        </label>
                        <label>
                          <span>Sets min / max</span>
                          <div className="routine-editor-range">
                            <input
                              className="text-input"
                              type="number"
                              min="1"
                              max="20"
                              value={exercise.sets.min}
                              aria-label="Minimum sets"
                              required
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                changeExercise(day.weekday, exerciseIndex, (item) => ({
                                  ...item,
                                  sets: { ...item.sets, min: value },
                                }));
                              }}
                            />
                            <input
                              className="text-input"
                              type="number"
                              min="1"
                              max="20"
                              value={exercise.sets.max}
                              aria-label="Maximum sets"
                              required
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                changeExercise(day.weekday, exerciseIndex, (item) => ({
                                  ...item,
                                  sets: { ...item.sets, max: value },
                                }));
                              }}
                            />
                          </div>
                        </label>
                        <label>
                          <span>Reps min / max</span>
                          <div className="routine-editor-range">
                            <input
                              className="text-input"
                              type="number"
                              min="1"
                              max="100"
                              value={exercise.reps.min}
                              aria-label="Minimum reps"
                              required
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                changeExercise(day.weekday, exerciseIndex, (item) => ({
                                  ...item,
                                  reps: { ...item.reps, min: value },
                                }));
                              }}
                            />
                            <input
                              className="text-input"
                              type="number"
                              min="1"
                              max="100"
                              value={exercise.reps.max}
                              aria-label="Maximum reps"
                              required
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                changeExercise(day.weekday, exerciseIndex, (item) => ({
                                  ...item,
                                  reps: { ...item.reps, max: value },
                                }));
                              }}
                            />
                          </div>
                        </label>
                        <label>
                          <span>Rest (seconds)</span>
                          <input
                            className="text-input"
                            type="number"
                            min="0"
                            max="600"
                            value={exercise.restSeconds ?? ""}
                            onChange={(event) =>
                              changeExercise(day.weekday, exerciseIndex, (item) => ({
                                ...item,
                                restSeconds: numberValue(event.target.value),
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Transition (seconds)</span>
                          <input
                            className="text-input"
                            type="number"
                            min="0"
                            max="600"
                            value={exercise.transitionSeconds ?? ""}
                            onChange={(event) =>
                              changeExercise(day.weekday, exerciseIndex, (item) => ({
                                ...item,
                                transitionSeconds: numberValue(event.target.value),
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Tempo</span>
                          <input
                            className="text-input"
                            value={exercise.tempo ?? ""}
                            maxLength={100}
                            onChange={(event) =>
                              changeExercise(day.weekday, exerciseIndex, (item) => ({
                                ...item,
                                tempo: event.target.value || null,
                              }))
                            }
                          />
                        </label>
                      </div>

                      <label className="routine-editor-wide-field">
                        <span>Exercise instructions</span>
                        <textarea
                          className="text-input routine-editor-textarea"
                          value={exercise.notes}
                          maxLength={500}
                          onChange={(event) =>
                            changeExercise(day.weekday, exerciseIndex, (item) => ({
                              ...item,
                              notes: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <div className="routine-editor-list-heading">
                        <h6>Exercise options</h6>
                        <button
                          className="button button-outline button-compact"
                          type="button"
                          disabled={exercise.options.length >= 5 || saving}
                          onClick={() =>
                            changeExercise(day.weekday, exerciseIndex, (item) => ({
                              ...item,
                              options: [...item.options, newAlternative()],
                            }))
                          }
                        >
                          Add alternative
                        </button>
                      </div>

                      {exercise.options.map((option, optionIndex) => (
                        <div
                          className="routine-editor-option"
                          key={`${exercise.key}-option-${optionIndex}`}
                        >
                          <div className="routine-editor-option-header">
                            <strong>Option {String.fromCharCode(65 + optionIndex)}</strong>
                            <button
                              className="button button-text button-compact"
                              type="button"
                              disabled={exercise.options.length <= 1 || saving}
                              aria-label={`Remove option ${String.fromCharCode(65 + optionIndex)}`}
                              onClick={() =>
                                changeExercise(day.weekday, exerciseIndex, (item) => ({
                                  ...item,
                                  options: item.options.filter(
                                    (_, index) => index !== optionIndex,
                                  ),
                                }))
                              }
                            >
                              Remove option
                            </button>
                          </div>
                          <div className="routine-editor-option-fields">
                            <label>
                              <span>Exercise name</span>
                              <input
                                className="text-input"
                                value={option.name}
                                maxLength={80}
                                required
                                onChange={(event) =>
                                  changeExercise(
                                    day.weekday,
                                    exerciseIndex,
                                    (item) =>
                                      updateOption(item, optionIndex, (current) => ({
                                        ...current,
                                        name: event.target.value,
                                      })),
                                  )
                                }
                              />
                            </label>
                            <label>
                              <span>Equipment</span>
                              <input
                                className="text-input"
                                value={option.equipment}
                                maxLength={60}
                                required
                                onChange={(event) =>
                                  changeExercise(
                                    day.weekday,
                                    exerciseIndex,
                                    (item) =>
                                      updateOption(item, optionIndex, (current) => ({
                                        ...current,
                                        equipment: event.target.value,
                                      })),
                                  )
                                }
                              />
                            </label>
                            <label>
                              <span>Minimum load (kg)</span>
                              <input
                                className="text-input"
                                type="number"
                                min="0"
                                max="1000"
                                step="0.25"
                                value={option.minWeightKg ?? ""}
                                onChange={(event) =>
                                  changeExercise(
                                    day.weekday,
                                    exerciseIndex,
                                    (item) =>
                                      updateOption(item, optionIndex, (current) => ({
                                        ...current,
                                        minWeightKg: numberValue(event.target.value),
                                      })),
                                  )
                                }
                              />
                            </label>
                            <label>
                              <span>Maximum load (kg)</span>
                              <input
                                className="text-input"
                                type="number"
                                min="0"
                                max="1000"
                                step="0.25"
                                value={option.maxWeightKg ?? ""}
                                onChange={(event) =>
                                  changeExercise(
                                    day.weekday,
                                    exerciseIndex,
                                    (item) =>
                                      updateOption(item, optionIndex, (current) => ({
                                        ...current,
                                        maxWeightKg: numberValue(event.target.value),
                                      })),
                                  )
                                }
                              />
                            </label>
                            <label>
                              <span>Load label</span>
                              <input
                                className="text-input"
                                value={option.weightLabel}
                                maxLength={50}
                                required
                                onChange={(event) =>
                                  changeExercise(
                                    day.weekday,
                                    exerciseIndex,
                                    (item) =>
                                      updateOption(item, optionIndex, (current) => ({
                                        ...current,
                                        weightLabel: event.target.value,
                                      })),
                                  )
                                }
                              />
                            </label>
                            <label>
                              <span>Load type</span>
                              <select
                                className="text-input"
                                value={option.loadBasis}
                                onChange={(event) =>
                                  changeExercise(
                                    day.weekday,
                                    exerciseIndex,
                                    (item) =>
                                      updateOption(item, optionIndex, (current) => ({
                                        ...current,
                                        loadBasis: event.target.value as RoutineExerciseOption["loadBasis"],
                                      })),
                                  )
                                }
                              >
                                <option value="baseline">Plan load</option>
                                <option value="suggested-start">Suggested start</option>
                                <option value="progression-target">Progression option</option>
                                <option value="choose-at-session">Choose at workout</option>
                              </select>
                            </label>
                          </div>
                          <label className="routine-editor-wide-field">
                            <span>Option notes</span>
                            <textarea
                              className="text-input routine-editor-textarea"
                              value={option.notes}
                              maxLength={500}
                              onChange={(event) =>
                                changeExercise(
                                  day.weekday,
                                  exerciseIndex,
                                  (item) =>
                                    updateOption(item, optionIndex, (current) => ({
                                      ...current,
                                      notes: event.target.value,
                                    })),
                                )
                              }
                            />
                          </label>
                        </div>
                      ))}
                    </fieldset>
                  ))}

                  <div className="routine-editor-list-heading">
                    <h5>Treadmill finisher</h5>
                    <button
                      className="button button-outline button-compact"
                      type="button"
                      disabled={day.cardioFinisher.length >= 4 || saving}
                      onClick={() =>
                        changeDay(day.weekday, (current) => ({
                          ...current,
                          cardioFinisher: [
                            ...current.cardioFinisher,
                            newCardioSegment(),
                          ],
                        }))
                      }
                    >
                      Add segment
                    </button>
                  </div>
                  {day.cardioFinisher.map((segment, segmentIndex) => (
                    <fieldset
                      className="routine-editor-cardio"
                      key={`${day.weekday}-cardio-${segmentIndex}`}
                    >
                      <legend>Segment {segmentIndex + 1}</legend>
                      <div className="routine-editor-option-fields">
                        <label>
                          <span>Duration (minutes)</span>
                          <input
                            className="text-input"
                            type="number"
                            min="1"
                            max="180"
                            value={segment.durationMinutes}
                            required
                            onChange={(event) =>
                              changeDay(day.weekday, (current) => ({
                                ...current,
                                cardioFinisher: current.cardioFinisher.map(
                                  (item, index) =>
                                    index === segmentIndex
                                      ? {
                                          ...item,
                                          durationMinutes: Number(event.target.value),
                                        }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Speed</span>
                          <input
                            className="text-input"
                            type="number"
                            min="0"
                            max="30"
                            step="0.1"
                            value={segment.speed}
                            required
                            onChange={(event) =>
                              changeDay(day.weekday, (current) => ({
                                ...current,
                                cardioFinisher: current.cardioFinisher.map(
                                  (item, index) =>
                                    index === segmentIndex
                                      ? { ...item, speed: Number(event.target.value) }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Speed unit (optional)</span>
                          <input
                            className="text-input"
                            value={segment.speedUnit ?? ""}
                            maxLength={16}
                            onChange={(event) =>
                              changeDay(day.weekday, (current) => ({
                                ...current,
                                cardioFinisher: current.cardioFinisher.map(
                                  (item, index) =>
                                    index === segmentIndex
                                      ? {
                                          ...item,
                                          speedUnit: event.target.value || null,
                                        }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Incline (%)</span>
                          <input
                            className="text-input"
                            type="number"
                            min="0"
                            max="50"
                            step="0.5"
                            value={segment.inclinePercent}
                            required
                            onChange={(event) =>
                              changeDay(day.weekday, (current) => ({
                                ...current,
                                cardioFinisher: current.cardioFinisher.map(
                                  (item, index) =>
                                    index === segmentIndex
                                      ? {
                                          ...item,
                                          inclinePercent: Number(event.target.value),
                                        }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </label>
                      </div>
                      <button
                        className="button button-text button-compact"
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          changeDay(day.weekday, (current) => ({
                            ...current,
                            cardioFinisher: current.cardioFinisher.filter(
                              (_, index) => index !== segmentIndex,
                            ),
                          }))
                        }
                      >
                        Remove segment
                      </button>
                    </fieldset>
                  ))}
                </>
              )}
            </div>
          </details>
        ))}
      </div>

      <div className="routine-editor-footer">
        <button
          className="button button-outline button-compact"
          type="button"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="button button-compact" type="submit" disabled={saving}>
          {saving ? "Saving week…" : "Save this week"}
        </button>
      </div>
    </form>
  );
}
