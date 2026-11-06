import * as db from './db.js';
import { questions, qById, lessonQuestions } from './content.js';

export const LEVELS = ['easy', 'medium', 'hard'];
export const BOX_DAYS = [1, 3, 7, 14, 30];
const DAY = 86_400_000;

// A level is passed at 80% over the most recent 10 attempts,
// with at least 5 attempts. Once passed, it stays passed.
const WINDOW = 10;
const MIN_ATTEMPTS = 5;
const PASS = 0.8;

export const state = { attempts: [], cards: new Map(), persistent: true };

export async function loadState() {
  try {
    const attempts = await db.getAll('attempts');
    state.attempts = attempts.sort((a, b) => a.ts - b.ts);
    for (const c of await db.getAll('cards')) state.cards.set(c.qid, c);
  } catch (e) {
    console.warn('IndexedDB unavailable; progress will not be saved', e);
    state.persistent = false;
  }
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Leitner: correct moves up one box, wrong goes back to box 1.
// Unseen questions count as box 1.
function nextCard(card, q, correct, now) {
  const box = correct ? Math.min((card?.box ?? 1) + 1, 5) : 1;
  const due = startOfDay(now) + BOX_DAYS[box - 1] * DAY;
  return { qid: q.id, version: q.version, box, due, last: now };
}

export async function recordAnswer(q, chosen, correct, mode) {
  const now = Date.now();
  const attempt = {
    qid: q.id, version: q.version, lessonId: q.lessonId,
    level: q.level, chosen, correct, mode, ts: now,
  };
  const card = nextCard(state.cards.get(q.id), q, correct, now);
  state.attempts.push(attempt);
  state.cards.set(q.id, card);
  if (!state.persistent) return;
  try {
    await db.put('attempts', attempt);
    await db.put('cards', card);
  } catch (e) {
    console.warn('Could not save answer', e);
    state.persistent = false;
  }
}

const ratio = (arr) => arr.filter(Boolean).length / arr.length;

function levelProgress(qids) {
  const set = new Set(qids);
  const window = [];
  let passed = false;
  for (const a of state.attempts) {
    if (!set.has(a.qid)) continue;
    window.push(a.correct);
    if (window.length > WINDOW) window.shift();
    if (window.length >= MIN_ATTEMPTS && ratio(window) >= PASS) passed = true;
  }
  return {
    recent: window.length,
    score: window.length ? ratio(window) : null,
    passed,
  };
}

export function lessonStatus(lessonId) {
  const status = {};
  let unlocked = true;
  for (const level of LEVELS) {
    const qs = lessonQuestions(lessonId, level);
    const p = levelProgress(qs.map((q) => q.id));
    status[level] = { ...p, unlocked, count: qs.length };
    unlocked = p.passed;
  }
  status.completed = status.hard.passed;
  status.started = LEVELS.some((l) => status[l].recent > 0);
  return status;
}

export function conceptMastery() {
  const recent = new Map();
  for (let i = state.attempts.length - 1; i >= 0; i--) {
    const a = state.attempts[i];
    const q = qById.get(a.qid);
    if (!q) continue;
    for (const c of q.concepts) {
      const list = recent.get(c) ?? [];
      if (list.length < WINDOW) list.push(a.correct);
      recent.set(c, list);
    }
  }
  return [...recent]
    .map(([concept, list]) => ({
      concept, answers: list.length, score: ratio(list),
    }))
    .sort((a, b) => a.score - b.score || b.answers - a.answers);
}

export const isMastered = (m) => m.answers >= 3 && m.score >= PASS;

// Daily review: due questions first, then questions on the
// weakest concepts, only from levels the learner has unlocked.
export function buildReview(limit = 10) {
  const now = Date.now();
  const statusCache = new Map();
  const unlocked = (q) => {
    if (!statusCache.has(q.lessonId)) {
      statusCache.set(q.lessonId, lessonStatus(q.lessonId));
    }
    return statusCache.get(q.lessonId)[q.level].unlocked;
  };

  const due = questions
    .filter((q) => (state.cards.get(q.id)?.due ?? Infinity) <= now)
    .filter(unlocked)
    .sort((a, b) => state.cards.get(a.id).due - state.cards.get(b.id).due);

  const items = due.slice(0, limit);
  const picked = new Set(items.map((q) => q.id));
  const order = (q) => {
    const c = state.cards.get(q.id);
    return c ? c.box * 1e13 + c.last : 0;
  };

  for (const m of conceptMastery().filter((m) => m.score < PASS)) {
    const extra = questions
      .filter((q) => !picked.has(q.id) && q.concepts.includes(m.concept))
      .filter(unlocked)
      .sort((a, b) => order(a) - order(b))
      .slice(0, 2);
    for (const q of extra) {
      if (items.length >= limit) break;
      items.push(q);
      picked.add(q.id);
    }
  }
  return { items, dueCount: due.length };
}

export function nextDue() {
  const now = Date.now();
  let min = Infinity;
  for (const c of state.cards.values()) {
    if (c.due > now && c.due < min && qById.has(c.qid)) min = c.due;
  }
  return min === Infinity ? null : min;
}

export function answeredToday() {
  const start = startOfDay(Date.now());
  return state.attempts.filter((a) => a.ts >= start).length;
}

export function boxCounts() {
  const counts = [0, 0, 0, 0, 0];
  for (const c of state.cards.values()) {
    if (qById.has(c.qid)) counts[c.box - 1]++;
  }
  return counts;
}

export function exportData() {
  return {
    app: 'softdev',
    format: 1,
    exportedAt: new Date().toISOString(),
    attempts: state.attempts.map(({ id, ...a }) => a),
    cards: [...state.cards.values()],
  };
}

export async function importData(data) {
  if (data?.app !== 'softdev' || !Array.isArray(data.attempts)) {
    throw new Error('This file is not a Road to Soft Dev backup.');
  }
  const attempts = data.attempts
    .filter((a) => a && typeof a.qid === 'string' && typeof a.ts === 'number')
    .map(({ id, ...a }) => a)
    .sort((a, b) => a.ts - b.ts);
  const cards = (data.cards ?? []).filter((c) => c && c.qid);
  if (state.persistent) {
    await db.replaceAll('attempts', attempts);
    await db.replaceAll('cards', cards);
  }
  state.attempts = attempts;
  state.cards = new Map(cards.map((c) => [c.qid, c]));
}

export async function resetProgress() {
  if (state.persistent) {
    await db.replaceAll('attempts', []);
    await db.replaceAll('cards', []);
  }
  state.attempts = [];
  state.cards = new Map();
}
