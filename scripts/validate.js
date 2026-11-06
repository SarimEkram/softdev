// Validates lessons and question banks before every build.
// Fails the build on any error so bad content never deploys.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLesson, plainText } from '../src/lesson-parse.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LESSONS = join(ROOT, 'content/lessons');
const QUESTIONS = join(ROOT, 'content/questions');

const LEVELS = ['easy', 'medium', 'hard'];
const TYPES = [
  'concept-check', 'calculation', 'predict-output', 'trace',
  'spot-the-bug', 'complexity', 'compare', 'scenario',
  'which-is-false', 'order-steps',
];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const lessons = new Map();
for (const file of readdirSync(LESSONS).filter((f) => f.endsWith('.md'))) {
  let lesson;
  try {
    lesson = parseLesson(readFileSync(join(LESSONS, file), 'utf8'));
  } catch (e) {
    err(file, e.message);
    continue;
  }
  const { meta } = lesson;
  for (const k of ['id', 'slug', 'title', 'tier', 'version']) {
    if (meta[k] == null) err(file, `frontmatter missing "${k}"`);
  }
  if (!/^t\d{2}[a-z]?$/.test(meta.id)) err(file, `bad lesson id "${meta.id}"`);
  if (file !== `${meta.id}-${meta.slug}.md`) {
    err(file, `filename should be ${meta.id}-${meta.slug}.md`);
  }
  if (lessons.has(meta.id)) err(file, `duplicate lesson id ${meta.id}`);
  lessons.set(meta.id, lesson);
}

const seenIds = new Set();
for (const file of readdirSync(QUESTIONS).filter((f) => f.endsWith('.json'))) {
  let bank;
  try {
    bank = JSON.parse(readFileSync(join(QUESTIONS, file), 'utf8'));
  } catch (e) {
    err(file, `invalid JSON: ${e.message}`);
    continue;
  }
  if (!Array.isArray(bank)) {
    err(file, 'must be a JSON array');
    continue;
  }

  const perLevel = { easy: 0, medium: 0, hard: 0 };
  for (const q of bank) {
    const at = `${file} ${q.id ?? '(no id)'}`;
    if (seenIds.has(q.id)) err(at, 'duplicate question id');
    seenIds.add(q.id);

    const lesson = lessons.get(q.lessonId);
    if (!lesson) {
      err(at, `unknown lessonId ${q.lessonId}`);
      continue;
    }
    if (!new RegExp(`^${q.lessonId}-[emh]\\d{2}$`).test(q.id)) {
      err(at, 'id must look like tNN-e01');
    }
    if (!LEVELS.includes(q.level)) err(at, `bad level ${q.level}`);
    else {
      perLevel[q.level]++;
      if (q.id.split('-')[1][0] !== q.level[0]) err(at, 'id letter ≠ level');
    }
    if (!TYPES.includes(q.type)) err(at, `bad type ${q.type}`);
    if (!q.stem) err(at, 'missing stem');
    if (!Number.isInteger(q.version) || q.version < 1) err(at, 'bad version');

    if (q.code !== null) {
      if (!q.code?.language || !q.code?.source) err(at, 'bad code object');
    }

    const opts = q.options ?? [];
    if (opts.length !== 4) err(at, 'needs exactly 4 options');
    if (opts.map((o) => o.id).join('') !== 'abcd') {
      err(at, 'option ids must be a, b, c, d');
    }
    if (opts.filter((o) => o.correct === true).length !== 1) {
      err(at, 'needs exactly one correct option');
    }
    for (const o of opts) {
      if (!o.text) err(at, `option ${o.id} has no text`);
      if (o.correct && (o.whyWrong !== null || o.misconception !== null)) {
        err(at, 'correct option must have null whyWrong/misconception');
      }
      if (!o.correct) {
        if (!o.whyWrong) err(at, `option ${o.id} missing whyWrong`);
        const m = o.misconception ?? '';
        if (/^M\d+$/.test(m)) {
          if (!lesson.misconceptions.includes(m)) {
            err(at, `option ${o.id} cites ${m}, not in lesson list`);
          }
        } else if (!m.startsWith('error: ')) {
          err(at, `option ${o.id} misconception must be M# or "error: ..."`);
        }
      }
      if (/^\(?[a-d][).:]\s/i.test(o.text)) {
        err(at, `option ${o.id} text has a letter prefix`);
      }
    }

    for (const k of ['explanation', 'keyInsight', 'hint']) {
      if (!q[k]) err(at, `missing ${k}`);
    }

    const section = lesson.sections.find((s) => s.slug === q.lessonAnchor);
    if (!section) err(at, `lessonAnchor "${q.lessonAnchor}" not found`);
    else if (!plainText(section.md).includes(plainText(q.evidence ?? ''))) {
      err(at, 'evidence quote not found in its lesson section');
    }

    const c = q.concepts ?? [];
    if (c.length < 1 || c.length > 3) err(at, 'needs 1 to 3 concepts');
    for (const tag of c) if (!KEBAB.test(tag)) err(at, `bad concept "${tag}"`);

    const v = q.verification ?? {};
    if (!['executed', 'computed', 'reasoned'].includes(v.method)) {
      err(at, 'bad verification.method');
    }
    if (typeof v.confidence !== 'number') err(at, 'missing confidence');
    else if (v.confidence < 0.9) warn(at, `low confidence ${v.confidence}`);
  }

  for (const lvl of LEVELS) {
    if (perLevel[lvl] < 5) {
      warn(file, `only ${perLevel[lvl]} ${lvl} questions (unlocking needs 5)`);
    }
  }
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(
  `${lessons.size} lesson(s), ${seenIds.size} question(s), ` +
  `${errors.length} error(s), ${warnings.length} warning(s)`,
);
if (errors.length) process.exit(1);
