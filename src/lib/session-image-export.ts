import type { PublicUser, WorkoutSession } from "./types";

const SVG_WIDTH = 1600;
const SIDE_PADDING = 72;
const CARD_WIDTH = SVG_WIDTH - SIDE_PADDING * 2;
const CARD_COLORS = [
  "#39ff14",
  "#bf00ff",
  "#ff1493",
  "#00ffff",
] as const;
const MAX_CANVAS_DIMENSION = 32_000;
const MAX_CANVAS_PIXELS = 32_000_000;

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(value: string, maxCharacters: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let offset = 0; offset < word.length; offset += maxCharacters) {
        const part = word.slice(offset, offset + maxCharacters);
        if (offset + maxCharacters < word.length) {
          lines.push(part);
        } else {
          line = part;
        }
      }
      continue;
    }

    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

function renderTextLines(
  lines: string[],
  x: number,
  firstBaseline: number,
  lineHeight: number,
  fontSize: number,
  fill: string,
  fontWeight = 500,
  textAnchor = "start",
): string {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${firstBaseline + index * lineHeight}" ` +
        `fill="${fill}" font-family="system-ui, sans-serif" ` +
        `font-size="${fontSize}" font-weight="${fontWeight}" ` +
        `text-anchor="${textAnchor}">${escapeXml(line)}</text>`,
    )
    .join("");
}

function formatWeight(weightKg: number): string {
  return Number.isInteger(weightKg)
    ? String(weightKg)
    : weightKg.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function renderSessionCard(
  session: WorkoutSession,
  index: number,
  top: number,
): { markup: string; height: number } {
  const left = SIDE_PADDING + 34;
  const right = SVG_WIDTH - SIDE_PADDING - 34;
  const titleLines = wrapText(session.title, 48);
  const notesLines = session.notes ? wrapText(session.notes, 120) : [];
  const exerciseItems = session.exercises.length
    ? session.exercises
    : [{ name: "No exercises logged yet", sets: 0, reps: 0, weightKg: 0 }];
  const pieces: string[] = [];
  let cursor = 42;

  pieces.push(
    renderTextLines(
      titleLines,
      left,
      top + cursor + 32,
      42,
      34,
      "#ffffff",
      900,
    ),
  );
  cursor += titleLines.length * 42;

  pieces.push(
    `<text x="${left}" y="${top + cursor + 22}" fill="#c5c5c5" ` +
      `font-family="system-ui, sans-serif" font-size="18" font-weight="600">` +
      `${escapeXml(session.date)}</text>`,
  );
  cursor += 38;

  const statusText = session.completed ? "COMPLETE" : "IN PROGRESS";
  const statusColor = session.completed ? "#39ff14" : "#ffaa00";
  pieces.push(
    `<rect x="${right - 190}" y="${top + 36}" width="190" height="38" rx="19" ` +
      `fill="#0d0d0d" stroke="${statusColor}" stroke-width="2"/>` +
      `<text x="${right - 95}" y="${top + 61}" fill="${statusColor}" ` +
      `font-family="system-ui, sans-serif" font-size="14" font-weight="800" ` +
      `text-anchor="middle" letter-spacing="1">${statusText}</text>`,
  );

  if (notesLines.length) {
    pieces.push(
      `<text x="${left}" y="${top + cursor + 16}" fill="#00ffff" ` +
        `font-family="system-ui, sans-serif" font-size="13" font-weight="850" ` +
        `letter-spacing="1.5">NOTES</text>`,
    );
    cursor += 28;
    pieces.push(
      renderTextLines(
        notesLines,
        left,
        top + cursor + 17,
        27,
        18,
        "#e3e3e3",
        500,
      ),
    );
    cursor += notesLines.length * 27 + 12;
  }

  pieces.push(
    `<text x="${left}" y="${top + cursor + 15}" fill="#39ff14" ` +
      `font-family="system-ui, sans-serif" font-size="13" font-weight="850" ` +
      `letter-spacing="1.5">EXERCISES</text>`,
  );
  cursor += 30;

  exerciseItems.forEach((exercise, exerciseIndex) => {
    const isPlaceholder = session.exercises.length === 0;
    const nameLines = wrapText(exercise.name, 52);
    const rowHeight = Math.max(42, nameLines.length * 26 + 12);
    pieces.push(
      renderTextLines(
        nameLines,
        left,
        top + cursor + 23,
        26,
        18,
        isPlaceholder ? "#c5c5c5" : "#ffffff",
        isPlaceholder ? 500 : 650,
      ),
    );
    if (!isPlaceholder) {
      const load =
        exercise.weightKg === 0
          ? "BODYWEIGHT"
          : `${formatWeight(exercise.weightKg)} KG`;
      pieces.push(
        `<text x="${right}" y="${top + cursor + Math.min(rowHeight - 8, 29)}" ` +
          `fill="#c5c5c5" font-family="system-ui, sans-serif" ` +
          `font-size="16" font-weight="700" text-anchor="end">` +
          `${exercise.sets} SETS · ${exercise.reps} REPS · ${load}</text>`,
      );
    }
    if (exerciseIndex < exerciseItems.length - 1) {
      pieces.push(
        `<line x1="${left}" y1="${top + cursor + rowHeight}" ` +
          `x2="${right}" y2="${top + cursor + rowHeight}" ` +
          `stroke="#3a3a3a" stroke-width="1"/>`,
      );
    }
    cursor += rowHeight;
  });

  const height = cursor + 30;
  const accent = CARD_COLORS[index % CARD_COLORS.length];
  return {
    height,
    markup:
      `<rect x="${SIDE_PADDING}" y="${top}" width="${CARD_WIDTH}" height="${height}" ` +
      `rx="24" fill="#171717" stroke="#383838" stroke-width="2"/>` +
      `<path d="M${SIDE_PADDING + 24} ${top} h-1 a23 23 0 0 0 -23 23 v${height - 46} ` +
      `a23 23 0 0 0 23 23 h1" fill="${accent}"/>` +
      pieces.join(""),
  };
}

export function createSessionsSvg(
  user: PublicUser,
  sessions: WorkoutSession[],
  exportedAt = new Date(),
): string {
  const headerHeight = 350;
  let cursor = headerHeight + 32;
  const sessionCards = sessions.map((session, index) => {
    const card = renderSessionCard(session, index, cursor);
    cursor += card.height + 22;
    return card.markup;
  });
  if (sessions.length === 0) {
    cursor += 150;
  }
  const footerTop = cursor + 12;
  const height = footerTop + 72;
  const completedCount = sessions.filter((session) => session.completed).length;
  const totalSets = sessions.reduce(
    (total, session) =>
      total +
      session.exercises.reduce((exerciseTotal, exercise) => exerciseTotal + exercise.sets, 0),
    0,
  );
  const exportedDate = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(exportedAt);
  const statCards = [
    { label: "SESSIONS", value: sessions.length, color: "#39ff14" },
    { label: "COMPLETED", value: completedCount, color: "#bf00ff" },
    { label: "SETS LOGGED", value: totalSets, color: "#00ffff" },
  ];

  const statMarkup = statCards
    .map((stat, index) => {
      const x = SIDE_PADDING + index * 484;
      return (
        `<rect x="${x}" y="218" width="460" height="100" rx="18" fill="${stat.color}"/>` +
        `<text x="${x + 24}" y="252" fill="#000000" ` +
          `font-family="system-ui, sans-serif" font-size="14" font-weight="900" ` +
          `letter-spacing="1.3">${stat.label}</text>` +
        `<text x="${x + 24}" y="300" fill="#000000" ` +
          `font-family="system-ui, sans-serif" font-size="40" font-weight="950">` +
          `${stat.value}</text>`
      );
    })
    .join("");

  const emptyState =
    sessions.length === 0
      ? `<text x="${SVG_WIDTH / 2}" y="${headerHeight + 112}" fill="#c5c5c5" ` +
        `font-family="system-ui, sans-serif" font-size="24" text-anchor="middle">` +
        `No sessions have been added yet.</text>`
      : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${height}" ` +
    `viewBox="0 0 ${SVG_WIDTH} ${height}" role="img" aria-labelledby="title description">` +
    `<title id="title">${escapeXml(user.username)} — Gym Trainer workout log</title>` +
    `<desc id="description">All ${sessions.length} workout sessions for ${escapeXml(user.username)}.</desc>` +
    `<defs><linearGradient id="vb-gradient" x1="0" x2="1">` +
    `<stop offset="0" stop-color="#ff1493"/><stop offset="1" stop-color="#bf00ff"/>` +
    `</linearGradient></defs>` +
    `<rect width="${SVG_WIDTH}" height="${height}" fill="#0d0d0d"/>` +
    `<rect width="18" height="${headerHeight}" fill="#39ff14"/>` +
    `<rect x="1454" y="42" width="34" height="34" fill="#ffaa00" transform="rotate(45 1471 59)"/>` +
    `<text x="${SIDE_PADDING}" y="62" fill="#39ff14" ` +
      `font-family="system-ui, sans-serif" font-size="15" font-weight="850" ` +
      `letter-spacing="2">GYM / TRAINER · PERSONAL ARCHIVE</text>` +
    `<text x="${SIDE_PADDING - 2}" y="145" fill="#ff0000" ` +
      `font-family="system-ui, sans-serif" font-size="64" font-weight="950" ` +
      `letter-spacing="-2">TRAINING LOG</text>` +
    `<text x="${SIDE_PADDING + 2}" y="145" fill="#00ffff" ` +
      `font-family="system-ui, sans-serif" font-size="64" font-weight="950" ` +
      `letter-spacing="-2">TRAINING LOG</text>` +
    `<text x="${SIDE_PADDING}" y="145" fill="#ffffff" ` +
      `font-family="system-ui, sans-serif" font-size="64" font-weight="950" ` +
      `letter-spacing="-2">TRAINING LOG</text>` +
    `<text x="${SIDE_PADDING}" y="180" fill="#c5c5c5" ` +
      `font-family="system-ui, sans-serif" font-size="18" font-weight="600">` +
      `@${escapeXml(user.username)} · EXPORTED ${escapeXml(exportedDate)}</text>` +
    statMarkup +
    emptyState +
    sessionCards.join("") +
    `<line x1="${SIDE_PADDING}" y1="${footerTop}" x2="${SVG_WIDTH - SIDE_PADDING}" ` +
      `y2="${footerTop}" stroke="#3a3a3a" stroke-width="2"/>` +
    `<text x="${SIDE_PADDING}" y="${footerTop + 42}" fill="#39ff14" ` +
      `font-family="system-ui, sans-serif" font-size="14" font-weight="900" ` +
      `letter-spacing="1.5">GYM / TRAINER</text>` +
    `<text x="${SVG_WIDTH - SIDE_PADDING}" y="${footerTop + 42}" fill="#c5c5c5" ` +
      `font-family="system-ui, sans-serif" font-size="14" text-anchor="end">` +
      `TRAIN WITH INTENTION. RECOVER WITH CARE.</text>` +
    `</svg>`
  );
}

function exportFilename(username: string, extension: "png" | "svg"): string {
  const safeUsername = username.replace(/[^A-Za-z0-9_-]/g, "-") || "user";
  const date = new Date().toISOString().slice(0, 10);
  return `gym-trainer-${safeUsername}-${date}.${extension}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadSvgImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The session image could not be rendered."));
    image.src = source;
  });
}

export function downloadSessionsSvg(
  user: PublicUser,
  sessions: WorkoutSession[],
): void {
  const svg = createSessionsSvg(user, sessions);
  downloadBlob(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    exportFilename(user.username, "svg"),
  );
}

export async function downloadSessionsPng(
  user: PublicUser,
  sessions: WorkoutSession[],
): Promise<void> {
  const svg = createSessionsSvg(user, sessions);
  const svgUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const image = await loadSvgImage(svgUrl);
    const scale = Math.min(
      2,
      MAX_CANVAS_DIMENSION / image.naturalWidth,
      MAX_CANVAS_DIMENSION / image.naturalHeight,
      Math.sqrt(
        MAX_CANVAS_PIXELS / (image.naturalWidth * image.naturalHeight),
      ),
    );
    if (scale < 0.5) {
      throw new Error(
        "This history is too large for a readable PNG. Download the SVG to keep every session crisp.",
      );
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(image.naturalWidth * scale);
    canvas.height = Math.floor(image.naturalHeight * scale);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Your browser could not prepare the PNG image.");
    }
    context.fillStyle = "#0d0d0d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Your browser could not create the PNG image."));
          return;
        }
        resolve(blob);
      }, "image/png");
    });
    downloadBlob(png, exportFilename(user.username, "png"));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
