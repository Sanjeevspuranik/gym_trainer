import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionsSvg } from "../src/lib/session-image-export";
import type { PublicUser, WorkoutSession } from "../src/lib/types";

const user: PublicUser = { id: 7, username: "strength_user" };

const sessions: WorkoutSession[] = [
  {
    id: 11,
    title: "Push <Pull> & Press",
    date: "2026-11-04",
    notes: "Keep it controlled & steady.",
    completed: true,
    completedAt: "2026-11-04T10:00:00.000Z",
    createdAt: "2026-11-04T09:00:00.000Z",
    exercises: [
      { name: "Bench press", sets: 3, reps: 8, weightKg: 42.5 },
    ],
  },
  {
    id: 12,
    title: "Lower body",
    date: "2026-11-03",
    notes: "",
    completed: false,
    completedAt: null,
    createdAt: "2026-11-03T09:00:00.000Z",
    exercises: [],
  },
];

test("the session poster includes all sessions and the vibrant visual palette", () => {
  const svg = createSessionsSvg(user, sessions, new Date("2026-11-04T12:00:00Z"));

  assert.match(svg, /width="1600"/);
  assert.match(svg, /All 2 workout sessions for strength_user/);
  assert.match(svg, /Push &lt;Pull&gt; &amp; Press/);
  assert.match(svg, /Bench press/);
  assert.match(svg, /42\.5 KG/);
  assert.match(svg, /Lower body/);
  assert.match(svg, /#39ff14/);
  assert.match(svg, /#bf00ff/);
});

test("the SVG poster escapes text and excludes invalid XML control characters", () => {
  const unsafeSession = {
    ...sessions[0],
    notes: "Safe text\u0000 & <details>",
  };
  const svg = createSessionsSvg(user, [unsafeSession]);

  assert.match(svg, /Safe text &amp; &lt;details&gt;/);
  assert.doesNotMatch(svg, /Safe text\u0000/);
});
