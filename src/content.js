import { Marked } from 'marked';
import { parseLesson, slugify } from './lesson-parse.js';

// Content is bundled at build time, so it works fully offline.
const lessonFiles = import.meta.glob('../content/lessons/*.md', {
  query: '?raw', import: 'default', eager: true,
});
const questionFiles = import.meta.glob('../content/questions/*.json', {
  import: 'default', eager: true,
});

export const lessons = new Map();
for (const raw of Object.values(lessonFiles)) {
  const lesson = parseLesson(raw);
  lesson.topic = parseInt(lesson.meta.id.slice(1, 3), 10);
  lessons.set(lesson.meta.id, lesson);
}

export const questions = Object.values(questionFiles).flat();
export const qById = new Map(questions.map((q) => [q.id, q]));

export function lessonsForTopic(n) {
  return [...lessons.values()]
    .filter((l) => l.topic === n)
    .sort((a, b) => a.meta.id.localeCompare(b.meta.id));
}

export function lessonQuestions(lessonId, level) {
  return questions.filter(
    (q) => q.lessonId === lessonId && (!level || q.level === level),
  );
}

const md = new Marked({
  renderer: {
    heading({ tokens, depth, text }) {
      const inner = this.parser.parseInline(tokens);
      const id = depth === 2 ? ` id="${slugify(text)}"` : '';
      return `<h${depth}${id}>${inner}</h${depth}>\n`;
    },
  },
});

const CALLOUT = /<blockquote>\s*<p>(Key idea|Watch out|Under the hood):/g;

export function renderMarkdown(source) {
  return md
    .parse(source)
    .replace(CALLOUT, (_, kind) =>
      `<blockquote class="callout callout-${slugify(kind)}">` +
      `<p><strong>${kind}:</strong>`);
}

const htmlCache = new Map();
export function lessonHtml(lesson) {
  if (!htmlCache.has(lesson.meta.id)) {
    htmlCache.set(lesson.meta.id, renderMarkdown(lesson.body));
  }
  return htmlCache.get(lesson.meta.id);
}

export function sectionOf(lessonId, slug) {
  return lessons.get(lessonId)?.sections.find((s) => s.slug === slug);
}
