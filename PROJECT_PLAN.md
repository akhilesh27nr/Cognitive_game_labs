# Cognitive Games Lab — Architecture & Project Plan

## 1. Overview & Disclaimer
**Cognitive Games Lab** is an independent, browser-based cognitive assessment practice platform inspired by publicly reported gamified cognitive tasks (such as Accenture India cognitive assessments).
- **Disclaimer:** This is an independent practice simulator. It contains no proprietary or official questions. Inferred rules are explicitly exposed as configurable practice rules.

## 2. Route Map
- `/` — **Dashboard**: Overview, real telemetry from `localStorage`, quick-launch cards for all 3 games, recent session history, and empty-state guidance.
- `/practice` — **Practice Configuration Studio**: Unified 150-archetype explorer, difficulty/mode/length/seed selectors, and 9 reproducible seeded benchmark fixtures.
- `/games/math-bubbles` — **Math Bubble Arena**: Rapid mental arithmetic and ascending/descending value ordering across 50 archetypes (`MB-01`..`MB-50`).
- `/games/memory-maze` — **Memory Maze**: Spatial working memory, hidden barriers, keys, locked gates, and one-way doors across 50 archetypes (`MM-01`..`MM-50`).
- `/games/path-rotation` — **Path Rotation Studio**: Tile rotation & horizontal flip topological pathfinding across 50 archetypes (`PR-01`..`PR-50`).
- `/assessment` — **Full Assessment Mode**: 5-Mode Combined Assessment Orchestrator (`Balanced 3-Stage`, `Random-Order`, `Adaptive`, `Custom`, `Full Timed Exam`) with global & per-item timers and active snapshot recovery.
- `/results/:sessionId` — **Session Results Report**: Detailed breakdown of score, accuracy, response speed, timeouts, route quality, cognitive error categories, and per-question review.
- `/history` — **History & Analytics**: Filterable session log, game-by-game mastery, and per-archetype accuracy telemetry.
- `/settings` — **Settings & Data Management**: Default difficulty, evaluation mode, timer durations, sound/motion toggles, practice rules, JSON export/import, and history reset with confirmation dialog.
- `*` — **Not Found**: Safe 404 recovery page.

## 3. Verification & Release Strategy
1. **Unit & Property Tests (`npm run test:unit`)**: Node `node:test` runner verifying `SeededRandom` determinism, `localStorage` schema migration/corruption/quota recovery, safe AST expression evaluation, and 100% solvability across all 150 archetypes (`MB-01`..`MB-50`, `MM-01`..`MM-50`, `PR-01`..`PR-50`).
2. **Component & Route Tests (`npm test`)**: Vitest + React Testing Library verifying Dashboard, Practice Studio, all 3 games, Assessment Orchestrator, Settings JSON import/export, and 404 routes.
3. **Playwright End-to-End Browser Suite (`npm run test:e2e`)**: Real headless Chromium verification of Dashboard, Math Bubble Arena, Memory Maze, Path Rotation Studio, Full Assessment Orchestrator, and `localStorage` persistence.
