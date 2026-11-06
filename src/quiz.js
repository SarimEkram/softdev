import { esc, cap, label, shuffle, icon } from './ui.js';
import { lessons, sectionOf, renderMarkdown } from './content.js';
import { recordAnswer, lessonStatus, LEVELS } from './progress.js';

// One quiz run. `items` are questions; `mode` is "practice" or "review".
export function startQuiz(root, { items, mode, title, exitHref, lessonId, level }) {
  const run = {
    items: shuffle(items),
    i: 0,
    results: [],
    before: lessonId ? lessonStatus(lessonId) : null,
  };
  let keyHandler;

  function cleanup() {
    document.removeEventListener('keydown', keyHandler);
  }

  function renderQuestion() {
    const q = run.items[run.i];
    const options = shuffle(q.options);
    const progress = (run.i / run.items.length) * 100;
    const lesson = lessons.get(q.lessonId);
    const section = sectionOf(q.lessonId, q.lessonAnchor);

    root.innerHTML = `
      <div class="quiz">
        <header class="quiz-top">
          <a class="icon-btn" href="${exitHref}" aria-label="Exit quiz">${icon.close}</a>
          <div class="bar" role="progressbar" aria-valuenow="${run.i}"
               aria-valuemin="0" aria-valuemax="${run.items.length}">
            <span style="width:${progress}%"></span>
          </div>
          <span class="count">${run.i + 1}/${run.items.length}</span>
        </header>
        <main class="quiz-body">
          <p class="eyebrow">${esc(cap(q.level))} · ${esc(label(q.type))}
            ${mode === 'review' ? ` · ${esc(lesson?.meta.title ?? '')}` : ''}</p>
          <h1 class="stem">${esc(q.stem)}</h1>
          ${q.code ? `<pre class="code"><code>${esc(q.code.source)}</code></pre>` : ''}
          <div class="options" role="group" aria-label="Answer options">
            ${options.map((o, n) => `
              <button class="option" data-id="${o.id}">
                <span class="key">${n + 1}</span>
                <span class="text">${esc(o.text)}</span>
              </button>`).join('')}
          </div>
          <div class="hint">
            <button class="link" data-action="hint">Show hint</button>
            <p class="hint-text" hidden>${esc(q.hint)}</p>
          </div>
          <section class="feedback" hidden aria-live="polite"></section>
        </main>
        <footer class="quiz-bottom">
          <button class="btn primary wide" data-action="next" disabled>
            ${run.i + 1 === run.items.length ? 'Finish' : 'Next'}
          </button>
        </footer>
      </div>`;

    const feedback = root.querySelector('.feedback');
    const next = root.querySelector('[data-action="next"]');
    let answered = false;

    function choose(id) {
      if (answered) return;
      answered = true;
      const picked = q.options.find((o) => o.id === id);
      const correct = q.options.find((o) => o.correct);
      run.results.push({ q, correct: picked.correct });
      recordAnswer(q, id, picked.correct, mode);

      for (const btn of root.querySelectorAll('.option')) {
        btn.disabled = true;
        if (btn.dataset.id === correct.id) btn.classList.add('is-correct');
        else if (btn.dataset.id === id) btn.classList.add('is-wrong');
        else btn.classList.add('is-dim');
      }
      root.querySelector('.hint').hidden = true;

      feedback.innerHTML = `
        <p class="verdict ${picked.correct ? 'good' : 'bad'}">
          ${picked.correct ? 'Correct' : 'Not quite'}</p>
        ${picked.correct ? '' : `<p class="why-wrong">${esc(picked.whyWrong)}</p>`}
        <p>${esc(q.explanation)}</p>
        <p class="insight">${esc(q.keyInsight)}</p>
        ${section ? `
          <details class="revisit">
            <summary>Revisit: ${esc(section.title)}</summary>
            <div class="prose">${renderMarkdown(section.md)}</div>
            <a class="link" href="#/lesson/${q.lessonId}/${q.lessonAnchor}"
               data-leave>Open full lesson</a>
          </details>` : ''}`;
      feedback.hidden = false;
      next.disabled = false;
      next.focus({ preventScroll: true });
      feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    root.querySelector('.options').addEventListener('click', (e) => {
      const btn = e.target.closest('.option');
      if (btn) choose(btn.dataset.id);
    });
    root.querySelector('[data-action="hint"]').addEventListener('click', (e) => {
      e.target.hidden = true;
      root.querySelector('.hint-text').hidden = false;
    });
    next.addEventListener('click', advance);
    feedback.addEventListener('click', (e) => {
      if (e.target.closest('[data-leave]')) cleanup();
    });

    document.removeEventListener('keydown', keyHandler);
    keyHandler = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (!answered && n >= 1 && n <= 4) choose(options[n - 1].id);
      else if (answered && e.key === 'Enter' && document.activeElement !== next) {
        advance();
      }
    };
    document.addEventListener('keydown', keyHandler);
    window.scrollTo(0, 0);
  }

  function advance() {
    run.i++;
    if (run.i < run.items.length) renderQuestion();
    else renderSummary();
  }

  function renderSummary() {
    cleanup();
    const right = run.results.filter((r) => r.correct).length;
    const total = run.results.length;
    let unlockedMsg = '';
    let actions = '';

    if (lessonId) {
      const after = lessonStatus(lessonId);
      const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
      if (!run.before.completed && after.completed) {
        unlockedMsg = 'Lesson complete. Nicely done.';
      } else if (nextLevel && !run.before[nextLevel].unlocked && after[nextLevel].unlocked) {
        unlockedMsg = `${cap(nextLevel)} unlocked.`;
      }
      const canNext = nextLevel && after[nextLevel].unlocked && after[nextLevel].count;
      actions = `
        ${canNext ? `<a class="btn primary wide" href="#/quiz/${lessonId}/${nextLevel}">Start ${nextLevel}</a>` : ''}
        <button class="btn ${canNext ? '' : 'primary'} wide" data-action="again">Practice again</button>
        <a class="btn ghost wide" href="${exitHref}">Back to lesson</a>`;
    } else {
      actions = `<a class="btn primary wide" href="#/">Done</a>`;
    }

    root.innerHTML = `
      <div class="quiz">
        <header class="quiz-top">
          <a class="icon-btn" href="${exitHref}" aria-label="Close">${icon.close}</a>
          <div class="bar"><span style="width:100%"></span></div>
          <span class="count">${total}/${total}</span>
        </header>
        <main class="quiz-body summary">
          <p class="eyebrow">${esc(title)}</p>
          <p class="score">${right}<span>/${total}</span></p>
          ${unlockedMsg ? `<p class="unlocked">${icon.check}${esc(unlockedMsg)}</p>` : ''}
          <ul class="result-list">
            ${run.results.map((r) => `
              <li class="${r.correct ? 'good' : 'bad'}">
                <span class="mark">${r.correct ? icon.check : icon.close}</span>
                <span>${esc(r.q.stem)}</span>
              </li>`).join('')}
          </ul>
          <div class="stack">${actions}</div>
        </main>
      </div>`;

    root.querySelector('[data-action="again"]')?.addEventListener('click', () => {
      startQuiz(root, { items, mode, title, exitHref, lessonId, level });
    });
    window.scrollTo(0, 0);
  }

  renderQuestion();
  return cleanup;
}
