# Road to Soft Dev

A mobile-first study app with lessons and quizzes that build toward strong software engineering fundamentals. It is a static PWA with no backend. Progress is stored on your device.

Live: https://sarimekram.github.io/softdev/

## Adding a topic

1. Fill in the config block in `prompts/generate-topic.md` and run it with an LLM.
2. Save the lesson to `content/lessons/{lessonId}-{slug}.md` and the questions to `content/questions/{lessonId}-{slug}.json`.
3. Run `npm run validate` to check the content.
4. Commit and push to `main`. GitHub Actions validates, builds, and deploys.

The validator fails the build if a question has the wrong shape, cites a missing misconception, points to a missing lesson section, or quotes evidence that does not appear in that section.

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # validate content + production build
```

## How it works

- **Content** is bundled at build time, so the app works offline after the first visit.
- **Levels**: easy is open. Medium unlocks at 80% on easy over your last 5 to 10 answers, and hard unlocks the same way after medium.
- **Review**: Leitner boxes (1, 3, 7, 14, 30 days). A correct answer moves a question up one box; a miss sends it back to box 1. Daily review mixes due questions with your weakest concepts.
- **Storage**: IndexedDB holds an append-only attempt log and per-question review state. Export and import live on the Progress tab.
