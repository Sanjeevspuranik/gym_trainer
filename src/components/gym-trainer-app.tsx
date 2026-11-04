"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import type {
  PublicUser,
  WorkoutExercise,
  WorkoutSession,
} from "@/lib/types";
import { USERNAME_HTML_PATTERN } from "@/lib/validation";
import {
  downloadSessionsPng,
  downloadSessionsSvg,
} from "@/lib/session-image-export";

type AuthMode = "login" | "register";
type ExportFormat = "png" | "svg";
type ExerciseDraft = {
  id: number;
  name: string;
  sets: string;
  reps: string;
  weightKg: string;
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...options,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? (await response.json()) as Record<string, unknown>
    : {};

  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function defaultDateValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function newExerciseDraft(id: number): ExerciseDraft {
  return { id, name: "", sets: "3", reps: "8", weightKg: "0" };
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function Landing({
  mode,
  error,
  pending,
  startupMessage,
  onModeChange,
  onSubmit,
}: {
  mode: AuthMode;
  error: string;
  pending: boolean;
  startupMessage: string;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isRegister = mode === "register";
  return (
    <section className="view auth-view" aria-labelledby="landingTitle">
      <div className="auth-layout">
        <div className="landing-copy">
          <p className="eyebrow">YOUR TRAINING. YOUR RECORD.</p>
          <h1 className="rgb-text" id="landingTitle">
            MAKE EVERY SET COUNT.
          </h1>
          <p className="landing-intro">
            Build a rhythm that lasts. Plan workouts, log every set, and keep
            your progress in one personal training space.
          </p>

          <div className="landing-art media" aria-hidden="true">
            <svg viewBox="0 0 640 220" role="presentation">
              <defs>
                <linearGradient id="barGradient" x1="0" x2="1">
                  <stop offset="0" stopColor="#ff1493" />
                  <stop offset=".52" stopColor="#bf00ff" />
                  <stop offset="1" stopColor="#00ffff" />
                </linearGradient>
              </defs>
              <path
                d="M92 109h456M168 66v86M133 79v60M472 66v86M507 79v60"
                fill="none"
                stroke="url(#barGradient)"
                strokeLinecap="round"
                strokeWidth="18"
              />
              <path
                d="M102 179h436"
                fill="none"
                stroke="#39ff14"
                strokeLinecap="round"
                strokeWidth="4"
                opacity=".7"
              />
              <circle cx="320" cy="109" r="44" fill="#ff1493" />
              <circle cx="320" cy="109" r="22" fill="#0d0d0d" />
              <path
                d="M296 109h48M320 85v48"
                stroke="#fff"
                strokeLinecap="round"
                strokeWidth="6"
              />
            </svg>
            <span className="shape shape-square" />
            <span className="shape shape-ring" />
          </div>

          <div className="feature-grid">
            <article className="feature-block">
              <span className="block-index">01 / LOG</span>
              <h2>Every rep, recorded.</h2>
            </article>
            <article className="feature-block">
              <span className="block-index">02 / OWN</span>
              <h2>Your sessions stay yours.</h2>
            </article>
            <article className="feature-block">
              <span className="block-index">03 / MOVE</span>
              <h2>Form cues, on hand.</h2>
            </article>
          </div>
        </div>

        <div className="auth-card surface-card">
          <p className="eyebrow">START HERE</p>
          <h2>{isRegister ? "Create your training space." : "Your training log awaits."}</h2>
          <div className="auth-tabs" role="group" aria-label="Choose account action">
            <button
              className={`auth-tab${!isRegister ? " is-active" : ""}`}
              type="button"
              aria-pressed={!isRegister}
              onClick={() => onModeChange("login")}
            >
              Sign in
            </button>
            <button
              className={`auth-tab${isRegister ? " is-active" : ""}`}
              type="button"
              aria-pressed={isRegister}
              onClick={() => onModeChange("register")}
            >
              Create account
            </button>
          </div>

          <form onSubmit={onSubmit}>
            <label className="field-label" htmlFor="username">
              Username
            </label>
            <input
              className="text-input"
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern={USERNAME_HTML_PATTERN}
              required
            />

            <label className="field-label" htmlFor="password">
              Passphrase
            </label>
            <input
              className="text-input"
              id="password"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? 12 : undefined}
              maxLength={128}
              required
            />
            {isRegister && (
              <p className="field-hint">
                Use 12–128 characters. A longer passphrase is easier to remember.
              </p>
            )}

            <button className="button button-primary auth-submit" type="submit" disabled={pending}>
              {pending
                ? "Please wait…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
            </button>
            {error && (
              <p className="message" role="alert">
                {error}
              </p>
            )}
            {startupMessage && (
              <p className="message" role="alert">
                {startupMessage}
              </p>
            )}
          </form>

          <p className="privacy-note">
            Each account has its own workout log. Sign out before another person
            uses this browser.
          </p>
        </div>
      </div>
    </section>
  );
}

function SessionCard({
  session,
  pending,
  onToggle,
  onDelete,
}: {
  session: WorkoutSession;
  pending: boolean;
  onToggle: (session: WorkoutSession) => void;
  onDelete: (session: WorkoutSession) => void;
}) {
  return (
    <article className="session-card">
      <div className="session-card-top">
        <div>
          <p className="session-date">
            <time dateTime={session.date}>{formatSessionDate(session.date)}</time>
          </p>
          <h3>{session.title}</h3>
        </div>
        <span className={`status-tag${session.completed ? " is-complete" : ""}`}>
          {session.completed ? "Complete" : "In progress"}
        </span>
      </div>

      {session.notes && <p className="session-notes">{session.notes}</p>}
      {session.exercises.length > 0 ? (
        <ul className="session-exercises">
          {session.exercises.map((exercise, index) => (
            <li key={`${session.id}-${index}`}>
              {exercise.name} · {exercise.sets} × {exercise.reps} ·{" "}
              {exercise.weightKg === 0
                ? "bodyweight"
                : `${exercise.weightKg} kg`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="session-notes">No exercises logged yet.</p>
      )}

      <div className="session-actions">
        <button
          className="button button-outline button-compact"
          type="button"
          disabled={pending}
          aria-label={`${session.completed ? "Reopen" : "Mark"} ${session.title} session ${
            session.completed ? "as in progress" : "complete"
          }`}
          onClick={() => onToggle(session)}
        >
          {session.completed ? "Reopen" : "Mark complete"}
        </button>
        <button
          className="button button-text button-compact"
          type="button"
          disabled={pending}
          aria-label={`Delete ${session.title} session`}
          onClick={() => onDelete(session)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export default function GymTrainerApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authError, setAuthError] = useState("");
  const [startupMessage, setStartupMessage] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const [sessionMessage, setSessionMessage] = useState("");
  const [exportMessage, setExportMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [sessionPending, setSessionPending] = useState(false);
  const [exportPending, setExportPending] = useState<ExportFormat | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<number | null>(null);
  const [exerciseDrafts, setExerciseDrafts] = useState<ExerciseDraft[]>([
    newExerciseDraft(1),
  ]);
  const [nextExerciseId, setNextExerciseId] = useState(2);
  const [sessionDate, setSessionDate] = useState(defaultDateValue);

  const refreshSessions = useCallback(async () => {
    const result = await apiRequest<{ sessions: WorkoutSession[] }>(
      "/api/sessions",
    );
    setSessions(result.sessions);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const account = await apiRequest<{ user: PublicUser }>("/api/auth/me");
        if (!active) {
          return;
        }
        setUser(account.user);
        const result = await apiRequest<{ sessions: WorkoutSession[] }>(
          "/api/sessions",
        );
        if (active) {
          setSessions(result.sessions);
        }
      } catch (error) {
        if (active && (!(error instanceof ApiError) || error.status !== 401)) {
          setStartupMessage(errorText(error));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadAccount();
    return () => {
      active = false;
    };
  }, []);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    setAuthError("");
    setAuthPending(true);

    try {
      const endpoint =
        authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const result = await apiRequest<{ user: PublicUser }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setUser(result.user);
      setStartupMessage("");
      setDashboardError("");
      setExportMessage(null);
      try {
        await refreshSessions();
      } catch (error) {
        setDashboardError(errorText(error));
      }
    } catch (error) {
      setAuthError(errorText(error));
    } finally {
      setAuthPending(false);
    }
  }

  async function handleLogout() {
    setDashboardError("");
    try {
      await apiRequest<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
        body: "{}",
      });
      setUser(null);
      setSessions([]);
      setAuthMode("login");
      setAuthError("");
      setSessionMessage("");
      setExportMessage(null);
    } catch (error) {
      setDashboardError(errorText(error));
    }
  }

  function updateExerciseDraft(
    id: number,
    field: keyof Omit<ExerciseDraft, "id">,
    value: string,
  ) {
    setExerciseDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, [field]: value } : draft,
      ),
    );
  }

  function addExerciseDraft() {
    setExerciseDrafts((current) => [
      ...current,
      newExerciseDraft(nextExerciseId),
    ]);
    setNextExerciseId((current) => current + 1);
  }

  function removeExerciseDraft(id: number) {
    setExerciseDrafts((current) =>
      current.length > 1 ? current.filter((draft) => draft.id !== id) : current,
    );
  }

  async function handleCreateSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const exercises: WorkoutExercise[] = exerciseDrafts.map((draft) => ({
      name: draft.name.trim(),
      sets: Number(draft.sets),
      reps: Number(draft.reps),
      weightKg: Number(draft.weightKg),
    }));
    setSessionMessage("");
    setDashboardError("");
    setSessionPending(true);

    try {
      await apiRequest<{ session: WorkoutSession }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: String(formData.get("title") ?? "").trim(),
          date: sessionDate,
          notes: String(formData.get("notes") ?? "").trim(),
          exercises,
        }),
      });
      form.reset();
      setSessionDate(defaultDateValue());
      setExerciseDrafts([newExerciseDraft(1)]);
      setNextExerciseId(2);
      setSessionMessage("Workout saved to your personal log.");
      try {
        await refreshSessions();
      } catch (error) {
        setDashboardError(errorText(error));
      }
    } catch (error) {
      setSessionMessage(errorText(error));
    } finally {
      setSessionPending(false);
    }
  }

  async function handleToggleSession(session: WorkoutSession) {
    setPendingSessionId(session.id);
    setDashboardError("");
    try {
      const result = await apiRequest<{ session: WorkoutSession }>(
        `/api/sessions/${session.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ completed: !session.completed }),
        },
      );
      setSessions((current) =>
        current.map((item) =>
          item.id === session.id ? result.session : item,
        ),
      );
    } catch (error) {
      setDashboardError(errorText(error));
    } finally {
      setPendingSessionId(null);
    }
  }

  async function handleDeleteSession(session: WorkoutSession) {
    if (!window.confirm(`Delete “${session.title}”? This cannot be undone.`)) {
      return;
    }
    setPendingSessionId(session.id);
    setDashboardError("");
    try {
      await apiRequest<{ ok: boolean }>(`/api/sessions/${session.id}`, {
        method: "DELETE",
      });
      setSessions((current) =>
        current.filter((item) => item.id !== session.id),
      );
    } catch (error) {
      setDashboardError(errorText(error));
    } finally {
      setPendingSessionId(null);
    }
  }

  async function handleExport(format: ExportFormat) {
    if (!user || sessions.length === 0) {
      return;
    }

    setExportMessage(null);
    setExportPending(format);
    try {
      if (format === "png") {
        await downloadSessionsPng(user, sessions);
      } else {
        downloadSessionsSvg(user, sessions);
      }
      setExportMessage({
        kind: "success",
        text: `${format.toUpperCase()} export is ready to download.`,
      });
    } catch (error) {
      setExportMessage({ kind: "error", text: errorText(error) });
    } finally {
      setExportPending(null);
    }
  }

  const completedCount = sessions.filter((session) => session.completed).length;
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthCount = sessions.filter((session) =>
    session.date.startsWith(monthPrefix),
  ).length;

  return (
    <div className="site-frame">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Gym Trainer home">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>
            GYM<span className="brand-slash">/</span>TRAINER
          </span>
        </Link>
        {user && (
          <div className="header-account">
            <span className="account-name">{user.username}</span>
            <button
              className="button button-outline button-compact"
              type="button"
              aria-label="Sign out of your Gym Trainer account"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <main>
        {isLoading ? (
          <section className="loading-view" role="status" aria-live="polite">
            <span className="loading-mark" aria-hidden="true">
              G
            </span>
            <p>Loading your training space…</p>
          </section>
        ) : user ? (
          <section
            className="view dashboard-view"
            aria-labelledby="dashboardTitle"
          >
            <div className="dashboard-hero section-panel">
              <div className="dashboard-hero-copy">
                <p className="eyebrow">
                  PERSONAL TRAINING LOG / TODAY
                </p>
                <h1 id="dashboardTitle">YOUR WORK. YOUR PACE.</h1>
                <p>
                  A good session is one you can build on. Log your work, mark
                  the finish, and keep the next step visible.
                </p>
              </div>
              <div className="hero-stamp" aria-hidden="true">
                <span className="stamp-top">TRAIN</span>
                <span className="stamp-symbol">×</span>
                <span className="stamp-bottom">REPEAT</span>
                <span className="shape shape-diamond" />
              </div>
            </div>

            <section className="stats-grid" aria-label="Your workout summary">
              <article className="block stat-block">
                <span className="block-index">01 / TOTAL</span>
                <strong className="stat-number">{sessions.length}</strong>
                <span className="stat-label">sessions logged</span>
              </article>
              <article className="block stat-block">
                <span className="block-index">02 / DONE</span>
                <strong className="stat-number">{completedCount}</strong>
                <span className="stat-label">sessions completed</span>
              </article>
              <article className="block stat-block">
                <span className="block-index">03 / THIS MONTH</span>
                <strong className="stat-number">{monthCount}</strong>
                <span className="stat-label">sessions this month</span>
              </article>
            </section>

            <div className="workout-layout section-panel">
              <section className="form-panel" aria-labelledby="newSessionHeading">
                <div className="section-heading">
                  <p className="eyebrow">BUILD A SESSION</p>
                  <h2 id="newSessionHeading">Start with a plan.</h2>
                </div>

                <form onSubmit={handleCreateSession}>
                  <label className="field-label" htmlFor="sessionTitle">
                    Session name
                  </label>
                  <input
                    className="text-input"
                    id="sessionTitle"
                    name="title"
                    type="text"
                    placeholder="Upper body A"
                    maxLength={80}
                    required
                  />

                  <div className="form-pair">
                    <div>
                      <label className="field-label" htmlFor="sessionDate">
                        Date
                      </label>
                      <input
                        className="text-input"
                        id="sessionDate"
                        name="date"
                        type="date"
                        value={sessionDate}
                        onChange={(event) => setSessionDate(event.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="sessionNotes">
                        Notes <span>(optional)</span>
                      </label>
                      <input
                        className="text-input"
                        id="sessionNotes"
                        name="notes"
                        type="text"
                        maxLength={500}
                        placeholder="How are you feeling?"
                      />
                    </div>
                  </div>

                  <div className="exercise-heading">
                    <div>
                      <p className="eyebrow">THE DETAILS</p>
                      <h3>Exercises &amp; sets</h3>
                    </div>
                    <button
                      className="button button-outline button-compact"
                      type="button"
                      onClick={addExerciseDraft}
                      disabled={exerciseDrafts.length >= 12}
                    >
                      Add exercise
                    </button>
                  </div>

                  <div className="exercise-rows">
                    {exerciseDrafts.map((draft, index) => (
                      <div className="exercise-row" key={draft.id}>
                        <label className="exercise-name-field">
                          <span>Exercise</span>
                          <input
                            className="text-input"
                            type="text"
                            value={draft.name}
                            maxLength={60}
                            placeholder="Squat"
                            required
                            onChange={(event) =>
                              updateExerciseDraft(
                                draft.id,
                                "name",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Sets</span>
                          <input
                            className="text-input"
                            type="number"
                            min="1"
                            max="20"
                            step="1"
                            value={draft.sets}
                            required
                            onChange={(event) =>
                              updateExerciseDraft(
                                draft.id,
                                "sets",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Reps</span>
                          <input
                            className="text-input"
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            value={draft.reps}
                            required
                            onChange={(event) =>
                              updateExerciseDraft(
                                draft.id,
                                "reps",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Weight (kg)</span>
                          <input
                            className="text-input"
                            type="number"
                            min="0"
                            max="1000"
                            step="0.25"
                            value={draft.weightKg}
                            required
                            onChange={(event) =>
                              updateExerciseDraft(
                                draft.id,
                                "weightKg",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <button
                          className="remove-exercise"
                          type="button"
                          disabled={exerciseDrafts.length <= 1}
                          aria-label={`Remove exercise ${index + 1}`}
                          onClick={() => removeExerciseDraft(draft.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    className="button button-primary form-submit"
                    type="submit"
                    disabled={sessionPending}
                  >
                    {sessionPending ? "Saving…" : "Save workout"}
                  </button>
                  {sessionMessage && (
                    <p
                      className="message"
                      data-kind={
                        sessionMessage.startsWith("Workout saved")
                          ? "success"
                          : "error"
                      }
                      role={
                        sessionMessage.startsWith("Workout saved")
                          ? "status"
                          : "alert"
                      }
                    >
                      {sessionMessage}
                    </p>
                  )}
                </form>
              </section>

              <section className="session-panel" aria-labelledby="sessionsHeading">
                <div className="session-panel-header">
                  <div className="session-heading-row">
                    <div className="session-title-group">
                    <p className="eyebrow">YOUR TRAINING HISTORY</p>
                    <h2 id="sessionsHeading">Sessions.</h2>
                    </div>
                    <span className="session-count">{sessions.length}</span>
                  </div>
                  <div className="export-tools" aria-busy={exportPending !== null}>
                    <p className="export-note">
                      {sessions.length > 0
                        ? `Save all ${sessions.length} sessions in this account.`
                        : "Add a session to enable image exports."}
                    </p>
                    <div className="export-actions">
                      <button
                        className="button button-compact"
                        type="button"
                        disabled={sessions.length === 0 || exportPending !== null}
                        aria-label={`Download all ${sessions.length} sessions as a PNG image`}
                        onClick={() => void handleExport("png")}
                      >
                        {exportPending === "png" ? "Rendering PNG…" : "Download PNG"}
                      </button>
                      <button
                        className="button button-outline button-compact"
                        type="button"
                        disabled={sessions.length === 0 || exportPending !== null}
                        aria-label={`Download all ${sessions.length} sessions as an SVG image`}
                        onClick={() => void handleExport("svg")}
                      >
                        {exportPending === "svg" ? "Preparing SVG…" : "Download SVG"}
                      </button>
                    </div>
                  </div>
                </div>

                {exportMessage && (
                  <p
                    className="message"
                    data-kind={exportMessage.kind}
                    role={exportMessage.kind === "error" ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {exportMessage.text}
                  </p>
                )}
                {dashboardError && (
                  <p className="message" role="alert">
                    {dashboardError}
                  </p>
                )}
                <div className="session-list" aria-live="polite">
                  {sessions.length === 0 ? (
                    <div className="empty-state">
                      <h3>Your first session starts here.</h3>
                      <p>
                        Add a workout plan and it will appear in your personal
                        log.
                      </p>
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        pending={pendingSessionId === session.id}
                        onToggle={handleToggleSession}
                        onDelete={handleDeleteSession}
                      />
                    ))
                  )}
                </div>
              </section>
            </div>

            <section
              className="guide-section section-panel"
              aria-labelledby="guideHeading"
            >
              <div className="section-heading">
                <p className="eyebrow">FORM CHECK / KEEP IT CONTROLLED</p>
                <h2 id="guideHeading">Good reps start with good cues.</h2>
              </div>
              <div className="guide-grid">
                <article className="guide-card">
                  <span className="guide-number">01</span>
                  <h3>Squat</h3>
                  <p>
                    Brace before you descend. Keep the whole foot grounded and
                    let the knees track with the toes.
                  </p>
                </article>
                <article className="guide-card">
                  <span className="guide-number">02</span>
                  <h3>Press</h3>
                  <p>
                    Set the shoulder blades, keep wrists stacked, and lower the
                    weight with control.
                  </p>
                </article>
                <article className="guide-card">
                  <span className="guide-number">03</span>
                  <h3>Hinge</h3>
                  <p>
                    Send the hips back, keep the spine neutral, and keep the
                    load close to your body.
                  </p>
                </article>
              </div>
              <p className="guide-disclaimer">
                These general cues are not a substitute for individualized
                coaching or medical advice.
              </p>
            </section>
          </section>
        ) : (
          <Landing
            mode={authMode}
            error={authError}
            pending={authPending}
            startupMessage={startupMessage}
            onModeChange={(mode) => {
              setAuthMode(mode);
              setAuthError("");
            }}
            onSubmit={handleAuthSubmit}
          />
        )}
      </main>

      <footer className="site-footer">
        <span>GYM/TRAINER</span>
        <span>Train with intention. Recover with care.</span>
      </footer>
    </div>
  );
}
