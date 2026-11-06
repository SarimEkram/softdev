import YAML from 'yaml';

// Matches the app's anchor rule: lowercase, punctuation removed,
// spaces become hyphens. "Two's Complement" -> "twos-complement".
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Splits a lesson file into frontmatter, body, and H2 sections.
export function parseLesson(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error('Lesson is missing YAML frontmatter');
  const meta = YAML.parse(m[1]);
  const body = raw.slice(m[0].length);

  const sections = [];
  let current = null;
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    const h2 = !inFence && line.match(/^## (.+)$/);
    if (h2) {
      const title = h2[1].trim();
      current = { title, slug: slugify(title), md: '' };
      sections.push(current);
    } else if (current) {
      current.md += line + '\n';
    }
  }

  const misconceptions = [...body.matchAll(/\*\*(M\d+):/g)].map((x) => x[1]);
  return { meta, body, sections, misconceptions };
}

// Plain text of a Markdown fragment, for loose quote matching.
export function plainText(md) {
  return md.replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
}
