# Cognitive Games Lab

**Cognitive Games Lab** is an independent, browser-based gamified cognitive assessment simulator inspired by publicly reported cognitive assessment task mechanics (such as Accenture India gamified cognitive assessments).

> **Disclaimer:** This is an independent practice simulator built for cognitive training and educational benchmarking. It contains **no proprietary or official assessment items** from Accenture or any assessment vendor. Inferred rules (such as undo availability, live validation cues, partial credit, and tab-inactivity suspension) are explicitly labeled as **Configurable Practice Rules**.

---

## 1. Local Setup & Quick Start

### Prerequisites
- **Node.js**: v20+ (tested on Node v22)
- **npm**: v10+

### Installation & Development Server
```bash
# Install dependencies
npm install

# Start the development server on http://localhost:3000
npm run dev
```

The application runs entirely in the browser with **zero paid APIs, external game services, or mandatory backend databases**.

---

## 2. Publishing & Deployment (Google AI Studio & GitHub)

### 2.1 Publishing Directly in Google AI Studio (Cloud Run)
- `metadata.json`, `index.html` (OpenGraph, Twitter Card, Schema.org `WebApplication` JSON-LD), and `package.json` (`"build": "vite build"`) are pre-configured for one-click publishing in Google AI Studio.
- Click the **Publish / Deploy** button in the top-right bar of Google AI Studio to build `dist/` and publish the live shared Cloud Run URL.

### 2.2 Publishing & Syncing with GitHub
- **Export / Sync from AI Studio**: Use the **Save to GitHub** / **Export to GitHub** option in the Google AI Studio toolbar (or push via `git remote add origin <your-repo-url> && git push -u origin main`).
- **Automated GitHub Actions CI (`.github/workflows/ci.yml`)**: Every push or pull request automatically runs TypeScript type-checking (`npm run lint`), the 150-archetype + audio + persistence unit suite (`npm run test:unit`), Vitest integration tests (`npm test`), and a full production build (`npm run build`).
- **Automated GitHub Pages Deployment (`.github/workflows/deploy.yml`)**: Pushing to `main`/`master` builds `dist/`, generates `dist/404.html` for SPA client-side routes, and deploys to GitHub Pages (enable *Settings → Pages → Build and deployment → Source: GitHub Actions* in your repository).
- **Static Hosting SPA Rewrites**:
  - **Netlify / Cloudflare Pages (`public/_redirects`)**: Pre-configured with `/* /index.html 200`.
  - **Vercel (`vercel.json`)**: Pre-configured with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.
  - **Content Security Policy**: `index.html` includes a restrictive `<meta http-equiv="Content-Security-Policy">` header that blocks `<object>`/`<embed>` plugins (`object-src 'none'`), restricts `base-uri 'self'` and `form-action 'self'`, and allows only same-origin scripts and Google Fonts (`Outfit`, `Plus Jakarta Sans`, `JetBrains Mono`).

### 2.3 Local Production Build & Preview
```bash
# Run TypeScript type-checking
npm run lint

# Run unit tests
npm run test:unit

# Compile production assets into dist/
npm run build

# Preview production build locally on port 3000
npm run preview
```

---

## 3. Architecture Overview

```text
/
├── index.html                        # Entry HTML with restrictive CSP & typography
├── e2e/
│   └── run-e2e.mjs                   # Automated Playwright E2E browser test suite
├── src/
│   ├── App.tsx                       # Route definitions (/, /practice, /games/*, /assessment, /results/:id, /history, /settings)
│   ├── components/
│   │   ├── AppShell.tsx              # Responsive navigation shell & storage warning banner
│   │   └── SharedControls.tsx        # DifficultySelector, EvaluationModeSelector, TimerBar, ConfirmDialog
│   ├── context/
│   │   └── LabContext.tsx            # React state provider with cross-tab storage sync & OS reduced-motion detection
│   ├── engine/
│   │   ├── contracts.ts              # Shared GameEngine contract, adaptive difficulty resolver & scoring formulas
│   │   ├── expressionEvaluator.ts    # Safe AST arithmetic evaluator (zero eval/Function) with 1e6 scaled integer precision
│   │   ├── mathBubblesEngine.ts      # Math Bubble Arena engine + 50 archetypes (MB-01..MB-50)
│   │   ├── memoryMazeEngine.ts       # Memory Maze engine + multi-state BFS pathfinder + 50 archetypes (MM-01..MM-50)
│   │   ├── pathRotationEngine.ts     # Path Rotation engine + reciprocal port BFS tracer + 50 archetypes (PR-01..PR-50)
│   │   ├── index.ts                  # Unified 150-archetype registry & 9 deterministic benchmark fixtures
│   │   └── engines.test.ts           # Node test suite verifying all 150 archetypes & edge cases
│   ├── pages/
│   │   ├── DashboardPage.tsx         # Telemetry overview, 3 module cards & recent session history
│   │   ├── PracticePage.tsx          # 150-archetype explorer, filter studio & seeded fixture launcher
│   │   ├── MathBubblesPage.tsx       # Math Bubble Arena interactive game studio
│   │   ├── MemoryMazePage.tsx        # Memory Maze interactive game studio
│   │   ├── PathRotationPage.tsx      # Path Rotation Studio interactive game studio
│   │   ├── AssessmentPage.tsx        # 5-Mode Combined Assessment Orchestrator with snapshot recovery
│   │   ├── ResultsPage.tsx           # Session breakdown, error categories, route quality & archetype telemetry
│   │   ├── HistoryPage.tsx           # Filterable session log & per-archetype mastery analytics
│   │   ├── SettingsPage.tsx          # Preferences, practice rule toggles, JSON export/import & history reset
│   │   └── NotFoundPage.tsx          # Safe 404 route handler
│   ├── storage/
│   │   ├── persistence.ts            # Versioned localStorage schema (v1), migration, validation & quota fallback
│   │   └── persistence.test.ts       # Unit tests for persistence, migrations, quota errors & snapshots
│   ├── tests/
│   │   └── navigation.spec.tsx       # Vitest + React Testing Library component & route integration tests
│   └── utils/
│       ├── prng.ts                   # Mulberry32 + FNV-1a deterministic SeededRandom generator
│       ├── prng.test.ts              # Unit tests for deterministic seed reproducibility
│       └── sound.ts                  # Zero-asset Web Audio API synthesizer
```

---

## 4. Game Rules & Configurable Assumptions

### 4.1 Math Bubble Arena (`/games/math-bubbles`)
- **Core Task**: Evaluate 3 or 4 floating arithmetic bubbles and select them in strict numerical order (`LOWEST → HIGHEST` by default, or `HIGHEST → LOWEST` on descending archetypes).
- **Default Timer**: `15 seconds` per question (configurable from `5s` to `120s` in Settings or URL params).
- **Tie-Breaking Rule**: When an archetype permits equivalent values (`MB-40`), ties are broken deterministically from left to right by lower bubble index (`Key [1]` before `Key [2]`).
- **Configurable Practice vs Exam Rules**:
  - *Practice Mode*: Immediate step feedback, Pause/Resume enabled, optional `Undo Last` (`Backspace`), and automatic timer suspension when the browser tab becomes inactive.
  - *Exam Mode*: Delayed feedback (selections recorded silently without live error hints), no Pause, no Undo, and strict continuous timing.

### 4.2 Memory Maze (`/games/memory-maze`)
- **Core Task**: Navigate from `Start (S)` to `Goal (G)` on `4×4`, `5×5`, or `6×6` grids using keyboard (`WASD` / Arrow keys) or click/tap controls.
- **Mechanics**:
  - **Hidden Barriers**: Interior barriers begin concealed and reveal permanently upon attempted contact.
  - **Penalty Rules**: Archetypes specify either `Hold Position` (player stays on the adjacent cell when striking a barrier) or `Return to Start` (player returns to `Start (S)` while all discovered barriers remain visible).
  - **Keys & Gates**: Collect required keys (`Key A`, `Key B`, `Key C`) in strict or flexible order and unlock corresponding gates (`Gate A`) before entering `Goal (G)`.
  - **One-Way Turnstiles**: Directional cells (`↑`, `→`, `↓`, `←`) allow entry only in the indicated cardinal direction.
  - **Challenge Modes**: Supports both *Hidden-Barrier Discovery Mode* and *Flash-Pattern Recall Mode* (brief initial hazard preview).

### 4.3 Path Rotation Studio (`/games/path-rotation`)
- **Core Task**: Rotate (`90° CW`, `90° CCW`, or `180°` on restricted tiles) and mirror-flip (`Shift+Click` or `Key F`) grid tiles (`3×3` to `6×6`) to connect `Source (IN)` to `Sink (OUT)` through all `Relay Checkpoints`.
- **Reciprocal Port Validation**: Adjacency alone is never accepted. Every tile along the route must have matching reciprocal cardinal ports (`N↔S`, `E↔W`), satisfy any one-way flow arrow (`FLOW ↑/→/↓/←`), and visit ordered checkpoints (`#1 → #2 → #3`) in strict sequence.
- **Route Quality Telemetry**: Completed boards are classified as `'optimal'`, `'valid-suboptimal'`, `'valid-assisted'` (when Practice Hints are used), `'invalid-disconnected'`, or `'timeout'`.

---

## 5. Puzzle-Generator Documentation (150 Archetypes)

Every puzzle is generated deterministically from a string seed via `SeededRandom` (`FNV-1a` seed hashing + `Mulberry32` PRNG):

1. **Math Bubble Arena (`MB-01` to `MB-50`)**:
   - 50 AST-driven mathematical archetypes covering integer addition/subtraction/multiplication/division, mixed operator precedence, single & nested brackets, signed numbers, decimals, common/different denominator fractions, mixed numbers, percentages, percentage increase/decrease, squares, square roots, cubes, cube roots, doubled/halved quantities, close-value comparisons, 4-bubble sorting, descending order, identical-value tie-breaking, missing operands (`? + b = c`), modular remainders (`a mod b`), absolute values (`|a - b|`), powers of 10, and cross-representation synthesis.
   - Evaluated via `src/engine/expressionEvaluator.ts` without `eval()` or `new Function()`, using `1,000,000`-scaled integers for exact rational/decimal comparison.
2. **Memory Maze (`MM-01` to `MM-50`)**:
   - 50 procedural maze archetypes across `4×4`, `5×5`, and `6×6` grids verified before play by `verifyMazeSolvabilityBFS` over state space `(row, col, collectedKeyBitmask)`.
3. **Path Rotation (`PR-01` to `PR-50`)**:
   - 50 topological archetypes across `3×3`, `4×4`, `5×5`, and `6×6` grids verified before play by `verifyPathRotationSolution` and `traceEnergizedNetwork` (guaranteeing that the initial scrambled state is unsolved and the solution state satisfies all terminals, arrows, and ordered checkpoints).

---

## 6. Scoring Documentation

Each question awards up to `160` raw points (`100` base accuracy points + up to `35` speed bonus points + up to `25` zero-mistake precision bonus points):
- **Speed Bonus**: Scaled linearly by remaining time ratio (`(timeLimitMs - elapsedMs) / timeLimitMs`).
- **Mistake Penalty**: Each invalid move/mistake deducts `12` points from the base score (clamped so a completed puzzle always earns at least `25` points).
- **Normalized Session Score (`0–1000`)**: `Math.round((totalScore / maxPossibleScore) * 1000)`.

---

## 7. Automated Testing Instructions

```bash
# 1. Run Node unit tests (PRNG, Persistence, Safe AST Evaluator, and all 150 Archetypes)
npm run test:unit

# 2. Run Vitest + React Testing Library component & route integration tests
npm test

# 3. Run TypeScript static type-checking
npm run lint

# 4. Run Playwright End-to-End headless Chromium browser suite (requires dev server on port 3000)
npm run test:e2e
```

---

## 8. Known Limitations & Security Boundaries

1. **Client-Side Scoring & Storage**: Because Cognitive Games Lab is a pure client-side practice simulator with no backend database, all session history and scores are stored in browser `localStorage` (`cognitive_games_lab_store_v1`). A user with browser DevTools access can inspect or modify their local storage; therefore, client-side scores are for **personal practice and self-assessment only**, not proctored certification.
2. **Synthesized Web Audio**: Sound effects use the browser's Web Audio API (`AudioContext`) and require an initial user gesture (click or keypress) to unlock audio playback in modern browsers.
3. **Viewport Minimums**: While `6×6` Expert grids are responsive down to `360px` mobile viewports, complex `6×6` Path Rotation boards are most comfortable on viewports `>= 390px` wide or in desktop/tablet orientation.

---

## 9. Complete Requirements Matrix

| Requirement | Implementation Location | Test Coverage | Verification Status | Remaining Defect |
| :--- | :--- | :--- | :--- | :--- |
| **3 Playable Cognitive Games** (Math Bubbles, Memory Maze, Path Rotation) | `src/pages/MathBubblesPage.tsx`, `src/pages/MemoryMazePage.tsx`, `src/pages/PathRotationPage.tsx` | `src/engine/engines.test.ts`, `src/tests/navigation.spec.tsx`, `e2e/run-e2e.mjs` | Verified | None |
| **50 Math Bubble Archetypes (`MB-01`..`MB-50`)** + Safe AST Evaluator | `src/engine/mathBubblesEngine.ts`, `src/engine/expressionEvaluator.ts` | `src/engine/engines.test.ts` (loops all 50 archetypes + AST edge cases) | Verified | None |
| **50 Memory Maze Archetypes (`MM-01`..`MM-50`)** + Multi-State BFS Validator | `src/engine/memoryMazeEngine.ts` | `src/engine/engines.test.ts` (loops all 50 archetypes + BFS solvability) | Verified | None |
| **50 Path Rotation Archetypes (`PR-01`..`PR-50`)** + Reciprocal Port BFS Tracer | `src/engine/pathRotationEngine.ts` | `src/engine/engines.test.ts` (loops all 50 archetypes + solution trace) | Verified | None |
| **Deterministic Seeded Reproducibility** + 9 Benchmark Fixtures | `src/utils/prng.ts`, `src/engine/index.ts` | `src/utils/prng.test.ts`, `src/engine/engines.test.ts` | Verified | None |
| **5-Mode Combined Assessment Orchestrator** + Snapshot Recovery | `src/pages/AssessmentPage.tsx`, `src/storage/persistence.ts` | `src/storage/persistence.test.ts`, `src/tests/navigation.spec.tsx`, `e2e/run-e2e.mjs` | Verified | None |
| **Versioned LocalStorage Persistence** (Migration, Export/Import, Quota Fallback, Cross-Tab Sync) | `src/storage/persistence.ts`, `src/context/LabContext.tsx`, `src/pages/SettingsPage.tsx` | `src/storage/persistence.test.ts`, `src/tests/navigation.spec.tsx`, `e2e/run-e2e.mjs` | Verified | None |
| **Responsive UI, Non-Color Accessibility & Reduced Motion** | `src/index.css`, `src/components/AppShell.tsx`, `src/components/SharedControls.tsx` | `src/tests/navigation.spec.tsx`, `e2e/run-e2e.mjs`, Playwright visual inspection (`1280×860` & `390×844`) | Verified | None |
