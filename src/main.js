import './style.css';
import { TOPICS, TIERS } from './curriculum.js';
import {
  lessons, lessonsForTopic, lessonQuestions, lessonHtml,
} from './content.js';
import {
  state, loadState, lessonStatus, conceptMastery, isMastered, buildReview,
  nextDue, answeredToday, boxCounts, exportData, importData, resetProgress,
  pickRound, LEVELS, BOX_DAYS, ROUND_SIZE,
} from './progress.js';
import { startQuiz } from './quiz.js';
import { esc, cap, pct, label, formatDay, icon } from './ui.js';

const app = document.getElementById('app');
let cleanup = null;

// ---------- shared pieces ----------

function shell(tab, content) {
  const tabs = [
    ['today', '#/', 'Today'],
    ['learn', '#/learn', 'Learn'],
    ['progress', '#/progress', 'Progress'],
  ];
  return `
    <main class="page">${content}</main>
    <nav class="tabbar" aria-label="Main">
      ${tabs.map(([id, href, name]) => `
        <a href="${href}" class="${tab === id ? 'active' : ''}"
           ${tab === id ? 'aria-current="page"' : ''}>
          ${icon[id]}<span>${name}</span>
        </a>`).join('')}
    </nav>`;
}

function levelDots(status) {
  return `<span class="dots" aria-label="Levels passed">
    ${LEVELS.map((l) => `<i class="${status[l].passed ? 'on' : ''}" title="${cap(l)}"></i>`).join('')}
  </span>`;
}

// The learner's next lesson: first one with content not yet completed.
function nextLesson() {
  const all = [...lessons.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  return all.find((l) => !lessonStatus(l.meta.id).completed) ?? null;
}

function lessonCard(lesson, heading) {
  const s = lessonStatus(lesson.meta.id);
  const current = LEVELS.find((l) => s[l].unlocked && !s[l].passed);
  const line = !s.started
    ? `${lesson.meta.estimatedMinutes ?? 30} min read · ${lessonQuestions(lesson.meta.id).length} questions`
    : current ? `Working on ${current}` : 'Completed';
  return `
    <a class="card link-card" href="#/lesson/${lesson.meta.id}">
      <div>
        <p class="eyebrow">${heading}</p>
        <h2>${esc(lesson.meta.title)}</h2>
        <p class="muted">${line}</p>
      </div>
      ${s.started ? levelDots(s) : icon.chevron}
    </a>`;
}

// ---------- Today ----------

function viewToday() {
  const { items, dueCount } = buildReview();
  const isNew = state.attempts.length === 0;
  const upcoming = nextDue();
  const next = nextLesson();
  const mastery = conceptMastery();

  let review;
  if (isNew) {
    review = `
      <section class="card hero">
        <h2>Welcome</h2>
        <p class="muted">Read a lesson, then answer questions to unlock
          harder levels. Questions you miss come back for review.</p>
        ${next ? `<a class="btn primary" href="#/lesson/${next.meta.id}">Start learning</a>` : ''}
      </section>`;
  } else if (dueCount > 0) {
    review = `
      <section class="card hero">
        <p class="big">${dueCount}</p>
        <p class="muted">${dueCount === 1 ? 'question' : 'questions'} due for review</p>
        <a class="btn primary" href="#/review">Start review</a>
      </section>`;
  } else {
    review = `
      <section class="card hero">
        <h2>All caught up</h2>
        <p class="muted">${upcoming ? `Next review ${formatDay(upcoming)}.` : 'Nothing scheduled yet.'}</p>
        ${items.length ? `<a class="btn" href="#/review">Practice weak spots</a>` : ''}
      </section>`;
  }

  const stats = isNew ? '' : `
    <section class="stats">
      <div><b>${answeredToday()}</b><span>answered today</span></div>
      <div><b>${mastery.filter(isMastered).length}</b><span>concepts mastered</span></div>
      <div><b>${[...lessons.keys()].filter((id) => lessonStatus(id).completed).length}</b><span>lessons done</span></div>
    </section>`;

  return shell('today', `
    <header class="page-head"><h1>Today</h1></header>
    ${review}
    ${next && !isNew ? lessonCard(next, 'Continue') : ''}
    ${!next && lessons.size ? `<p class="muted center">You have completed every available lesson. New topics appear here as they are added.</p>` : ''}
    ${stats}
    ${state.persistent ? '' : `<p class="notice">This browser is not saving progress (private mode or storage blocked).</p>`}
  `);
}

// ---------- Learn ----------

function viewLearn() {
  const groups = TIERS.map((tier, t) => {
    const rows = TOPICS.filter((x) => x.tier === t).map((topic) => {
      const ls = lessonsForTopic(topic.n);
      if (!ls.length) {
        return `<li class="topic soon"><span class="num">${topic.n}</span>
          <span class="t">${esc(topic.title)}</span></li>`;
      }
      return ls.map((l) => {
        const s = lessonStatus(l.meta.id);
        return `<li><a class="topic" href="#/lesson/${l.meta.id}">
          <span class="num">${topic.n}</span>
          <span class="t">${esc(l.meta.title)}</span>
          ${s.started ? levelDots(s) : `<span class="tag accent">New</span>`}
        </a></li>`;
      }).join('');
    }).join('');
    return `<section class="tier"><h2>${tier}</h2><ul class="topics">${rows}</ul></section>`;
  }).join('');

  return shell('learn', `
    <header class="page-head"><h1>Learn</h1>
      <p class="muted">${lessons.size} of ${TOPICS.length} topics available. More are added over time.</p></header>
    ${groups}`);
}

// ---------- Lesson ----------

function levelPanel(lessonId) {
  const s = lessonStatus(lessonId);
  return LEVELS.map((level, i) => {
    const st = s[level];
    const prev = LEVELS[i - 1];
    let detail;
    if (!st.count) detail = 'No questions yet';
    else if (!st.unlocked) detail = `Score 80% on ${prev} to unlock`;
    else if (st.passed) detail = `Passed · last ${st.recent}: ${pct(st.score)}`;
    else if (st.recent) detail = `Last ${st.recent}: ${pct(st.score)} · need 80% over 5+`;
    else detail = `${Math.min(ROUND_SIZE, st.count)} per round from ${st.count}`;
    const enabled = st.unlocked && st.count;
    const tag = enabled ? 'a' : 'div';
    return `
      <${tag} class="level ${enabled ? '' : 'locked'} ${st.passed ? 'passed' : ''}"
        ${enabled ? `href="#/quiz/${lessonId}/${level}"` : ''}>
        <span class="level-icon">${st.passed ? icon.check : enabled ? i + 1 : icon.lock}</span>
        <span class="level-text"><b>${cap(level)}</b><span>${detail}</span></span>
        ${enabled ? icon.chevron : ''}
      </${tag}>`;
  }).join('');
}

function viewLesson(id, anchor) {
  const lesson = lessons.get(id);
  if (!lesson) return viewNotFound();
  const { meta, sections } = lesson;

  app.innerHTML = `
    <main class="page lesson">
      <header class="page-head with-back">
        <a class="icon-btn" href="#/learn" aria-label="Back to topics">${icon.back}</a>
      </header>
      <p class="eyebrow">Topic ${lesson.topic} · ${TIERS[meta.tier - 1] ?? ''} · ${meta.estimatedMinutes ?? 30} min</p>
      <h1 class="lesson-title">${esc(meta.title)}</h1>
      ${meta.learningObjectives?.length ? `
        <ul class="objectives">
          ${meta.learningObjectives.map((o) => `<li>${esc(o)}</li>`).join('')}
        </ul>` : ''}
      <div class="lesson-actions">
        <details class="toc">
          <summary>Contents</summary>
          <ol>${sections.map((s) => `<li><a href="#${s.slug}" data-anchor="${s.slug}">${esc(s.title)}</a></li>`).join('')}</ol>
        </details>
        <a class="btn small" href="#practice" data-anchor="practice">Practice</a>
      </div>
      <article class="prose">${lessonHtml(lesson)}</article>
      <section id="practice" class="practice">
        <h2>Practice</h2>
        <p class="muted">Each level unlocks the next at 80% over your last 5–10 answers.</p>
        <div class="levels">${levelPanel(id)}</div>
      </section>
    </main>`;

  app.querySelector('.lesson').addEventListener('click', (e) => {
    const a = e.target.closest('[data-anchor]');
    if (!a) return;
    e.preventDefault();
    scrollToAnchor(a.dataset.anchor);
    history.replaceState(null, '', `#/lesson/${id}/${a.dataset.anchor}`);
    a.closest('details')?.removeAttribute('open');
  });

  if (anchor) requestAnimationFrame(() => scrollToAnchor(anchor, false));
  else window.scrollTo(0, 0);
  return null;
}

function scrollToAnchor(slug, smooth = true) {
  document.getElementById(slug)?.scrollIntoView({
    behavior: smooth ? 'smooth' : 'auto', block: 'start',
  });
}

// ---------- Progress ----------

function viewProgress() {
  const mastery = conceptMastery();
  const total = state.attempts.length;
  const right = state.attempts.filter((a) => a.correct).length;
  const boxes = boxCounts();
  const maxBox = Math.max(1, ...boxes);

  return shell('progress', `
    <header class="page-head"><h1>Progress</h1></header>
    <section class="stats">
      <div><b>${total}</b><span>answers</span></div>
      <div><b>${total ? pct(right / total) : '–'}</b><span>accuracy</span></div>
      <div><b>${mastery.filter(isMastered).length}/${mastery.length}</b><span>concepts mastered</span></div>
    </section>

    <section class="card">
      <h2>Concepts</h2>
      ${mastery.length ? `
        <p class="muted">Based on your last 10 answers per concept. Weakest first.</p>
        <ul class="mastery">
          ${mastery.map((m) => `
            <li>
              <span class="name">${esc(label(m.concept))}</span>
              <span class="meter ${isMastered(m) ? 'good' : m.score < 0.5 ? 'bad' : ''}">
                <i style="width:${Math.max(4, m.score * 100)}%"></i></span>
              <span class="val">${pct(m.score)}</span>
            </li>`).join('')}
        </ul>` : `<p class="muted">Answer a few questions to see your strengths and gaps.</p>`}
    </section>

    <section class="card">
      <h2>Review schedule</h2>
      <p class="muted">Correct answers move a question to a longer interval; misses send it back to 1 day.</p>
      <div class="boxes">
        ${boxes.map((n, i) => `
          <div><span class="col"><i style="height:${(n / maxBox) * 100}%"></i></span>
          <b>${n}</b><span>${BOX_DAYS[i]}d</span></div>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>Backup</h2>
      <p class="muted">Progress lives on this device. Export a file to back it up or move it to another device.</p>
      <div class="row">
        <button class="btn" data-action="export">Export</button>
        <label class="btn">Import<input type="file" accept="application/json,.json" hidden data-action="import"></label>
      </div>
      <button class="link danger" data-action="reset">Reset all progress</button>
    </section>
  `);
}

function bindProgress() {
  app.querySelector('[data-action="export"]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `softdev-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  app.querySelector('[data-action="import"]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('Replace your current progress with this backup?')) return;
      await importData(data);
      toast('Progress imported');
      render();
    } catch (err) {
      toast(err.message || 'Could not read that file');
    }
  });
  app.querySelector('[data-action="reset"]').addEventListener('click', async () => {
    if (!confirm('Delete all progress on this device? This cannot be undone.')) return;
    await resetProgress();
    toast('Progress reset');
    render();
  });
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

function viewNotFound() {
  return shell('', `
    <header class="page-head"><h1>Not found</h1></header>
    <p class="muted">That page does not exist.</p>
    <a class="btn" href="#/">Go to Today</a>`);
}

// ---------- router ----------

function render() {
  cleanup?.();
  cleanup = null;
  const hash = location.hash || '#/';
  let m;

  if (hash === '#/' || hash === '#') {
    app.innerHTML = viewToday();
  } else if (hash === '#/learn') {
    app.innerHTML = viewLearn();
  } else if (hash === '#/progress') {
    app.innerHTML = viewProgress();
    bindProgress();
  } else if ((m = hash.match(/^#\/lesson\/(\w+)(?:\/([\w-]+))?$/))) {
    const html = viewLesson(m[1], m[2]);
    if (html) app.innerHTML = html;
    return;
  } else if ((m = hash.match(/^#\/quiz\/(\w+)\/(easy|medium|hard)$/))) {
    const [, id, level] = m;
    const status = lessons.has(id) && lessonStatus(id);
    const items = lessonQuestions(id, level);
    if (!status || !status[level].unlocked || !items.length) {
      location.replace(`#/lesson/${id}`);
      return;
    }
    cleanup = startQuiz(app, {
      draw: () => pickRound(items), mode: 'practice', lessonId: id, level,
      title: `${lessons.get(id).meta.title} · ${cap(level)}`,
      exitHref: `#/lesson/${id}/practice`,
    });
    return;
  } else if (hash === '#/review') {
    const { items } = buildReview();
    if (!items.length) {
      location.replace('#/');
      return;
    }
    cleanup = startQuiz(app, {
      draw: () => items, mode: 'review', title: 'Daily review', exitHref: '#/',
    });
    return;
  } else {
    app.innerHTML = viewNotFound();
  }
  window.scrollTo(0, 0);
}

loadState().then(() => {
  window.addEventListener('hashchange', render);
  render();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
