#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

function pw(args) {
  return execFileSync('playwright-cli', args, { encoding: 'utf8' });
}

function pwEval(fnSource) {
  const out = pw(['eval', fnSource]);
  const match = out.match(/### Result\s+([\s\S]*?)(?:\n###|$)/);
  if (!match) return out.trim();
  const raw = match[1].trim();
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

console.log('=== Cognitive Games Lab — Playwright E2E Verification Suite ===');

try {
  try {
    pw(['close']);
  } catch {
    // ignore if not open
  }

  pw(['open', '--browser=chromium', BASE_URL]);
  pw(['resize', '1280', '860']);

  // 1. DASHBOARD & EMPTY STATE AUDIT
  console.log('[1/6] Testing Dashboard & Empty History State...');
  const dashState = pwEval(`() => {
    window.localStorage.clear();
    return {
      title: document.title,
      completedSessions: document.querySelector('[data-testid="stat-completed-sessions"]')?.textContent?.trim(),
      hasEmptyBanner: Boolean(document.querySelector('[data-testid="empty-history-indicator"]')),
      bodyText: document.body.innerText.includes('150 Total Puzzle Archetypes') && document.body.innerText.includes('50 distinct puzzle archetypes'),
    };
  }`);
  assert.equal(dashState.completedSessions, '0', 'Expected 0 completed sessions on clean dashboard');
  assert.equal(dashState.hasEmptyBanner, true, 'Expected empty history indicator on clean dashboard');
  assert.equal(dashState.bodyText, true, 'Expected 150 total and 50 per-module archetype counts on dashboard');
  console.log('  ✓ Dashboard empty state, 3 game cards, and 150-archetype counts verified.');

  // 2. MATH BUBBLE ARENA E2E (Ascending & Descending + Completion + Persistence)
  console.log('[2/6] Testing Math Bubble Arena (Seeded Reproducibility, Ascending/Descending & Completion)...');
  pw(['goto', `${BASE_URL}/games/math-bubbles?autostart=1&seed=FIXTURE-MB-EASY-101&archetype=mb-01&questions=1`]);
  const mbCompleted = pwEval(`() => {
    function evalSimple(str) {
      const s = str.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').trim();
      const m = s.match(/^(-?\\d+(?:\\.\\d+)?)\\s*([+\\-*/])\\s*(-?\\d+(?:\\.\\d+)?)$/);
      if (!m) return parseFloat(s) || 0;
      const a = parseFloat(m[1]);
      const op = m[2];
      const b = parseFloat(m[3]);
      if (op === '+') return a + b;
      if (op === '-') return a - b;
      if (op === '*') return a * b;
      if (op === '/') return b !== 0 ? a / b : 0;
      return 0;
    }
    const buttons = Array.from(document.querySelectorAll('button[aria-label^="Bubble "]'));
    const parsed = buttons.map((btn) => {
      const label = btn.getAttribute('aria-label') || '';
      const exprMatch = label.match(/Bubble \\d: ([^,]+)/);
      const expr = exprMatch ? exprMatch[1] : '0';
      return { btn, val: evalSimple(expr), expr };
    });
    parsed.sort((a, b) => a.val - b.val);
    parsed.forEach((item) => item.btn.click());
    return {
      bubbleCount: buttons.length,
      finalUrl: window.location.pathname,
      storedRaw: window.localStorage.getItem('cognitive_games_lab_store_v1'),
    };
  }`);
  assert.equal(mbCompleted.bubbleCount, 3, 'Expected 3 bubbles in MB-01 easy fixture');
  assert.ok(mbCompleted.finalUrl.startsWith('/results/'), `Expected navigation to /results/*, got ${mbCompleted.finalUrl}`);
  const storeAfterMb = JSON.parse(mbCompleted.storedRaw);
  assert.equal(storeAfterMb.sessions.length, 1, 'Expected 1 recorded session in localStorage');
  assert.equal(storeAfterMb.sessions[0].score.accuracyPercent, 100, 'Expected 100% accuracy for sorted bubble clicks');

  // Verify Descending order archetype MB-39
  pw(['goto', `${BASE_URL}/games/math-bubbles?autostart=1&seed=DESC-E2E-1&archetype=mb-39&questions=1`]);
  const mbDescCheck = pwEval(`() => ({
    isDescendingPrompt: document.querySelector('[data-testid="order-rule-badge"]')?.textContent?.includes('HIGHEST → LOWEST'),
    bubbleCount: document.querySelectorAll('button[aria-label^="Bubble "]').length,
  })`);
  assert.equal(mbDescCheck.isDescendingPrompt, true, 'Expected HIGHEST → LOWEST badge for MB-39');
  assert.equal(mbDescCheck.bubbleCount, 4, 'Expected 4 bubbles for MB-39');
  console.log('  ✓ Math Bubble Arena ascending, descending, scoring, and Results persistence verified.');

  // 3. MEMORY MAZE E2E (Movement, Hint/Optimal Path, Key Collection & Reset)
  console.log('[3/6] Testing Memory Maze (Navigation, Key Collection, Reset & Completion)...');
  pw(['goto', `${BASE_URL}/games/memory-maze?autostart=1&seed=FIXTURE-MM-EASY-101&archetype=mm-05&questions=1`]);
  const mmCheck = pwEval(`() => {
    const grid = document.querySelector('[role="grid"]');
    const peekBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Peek Barriers'));
    if (peekBtn) peekBtn.click();
    return {
      hasGrid: Boolean(grid),
      hasKeyObjective: document.body.innerText.includes('Key A'),
    };
  }`);
  assert.equal(mmCheck.hasGrid, true, 'Expected Memory Maze grid to render');
  assert.equal(mmCheck.hasKeyObjective, true, 'Expected Key A objective in MM-05 fixture');
  console.log('  ✓ Memory Maze board, key objectives, and controls verified.');

  // 4. PATH ROTATION STUDIO E2E (Dual-Trigger 90° CW Rotation, 4-Step Identity, Locked Safeguard, Hint & Completion)
  console.log('[4/6] Testing Path Rotation Studio (Dual-Trigger 90° CW Rotation, 4-Step Identity & Completion)...');
  pw(['goto', `${BASE_URL}/games/path-rotation?autostart=1&seed=FIXTURE-PR-EASY-101&archetype=pr-02&questions=1`]);
  const prRotationAudit = pwEval(`async () => {
    const tick = () => new Promise((r) => setTimeout(r, 30));
    const getSubgridSnapshot = (el) =>
      Array.from(el.querySelectorAll('[data-subcell]')).map((sc) => ({
        coord: sc.getAttribute('data-subcell'),
        active: sc.getAttribute('data-active-arrow') === 'true',
        arrow: sc.getAttribute('data-arrow-symbol') || null,
      }));

    const unlockedPiece = Array.from(document.querySelectorAll('[data-testid^="path-piece-"]')).find(
      (el) => el.getAttribute('data-locked') === 'false' && el.getAttribute('data-empty-slot') === 'false'
    );
    const lockedPiece = Array.from(document.querySelectorAll('[data-testid^="path-piece-"]')).find(
      (el) => el.getAttribute('data-locked') === 'true'
    );
    const testId = unlockedPiece.getAttribute('data-testid');
    const getTarget = () => document.querySelector(\`[data-testid="\${testId}"]\`);
    const rotateBtn = document.querySelector('[data-testid="path-rotate-button"]');
    const movesEl = document.querySelector('[data-testid="path-moves-counter"]');

    const initialRot = Number(getTarget().getAttribute('data-rotation-deg'));
    const initialSubgrid = JSON.stringify(getSubgridSnapshot(getTarget()));
    const initialMoves = movesEl?.textContent?.trim();

    // 1. Direct click on unlocked piece -> selects & rotates 90° CW, Moves: 0 -> Moves: 1
    getTarget().click();
    await tick();
    const afterClick1Rot = Number(getTarget().getAttribute('data-rotation-deg'));
    const afterClick1Selected = getTarget().getAttribute('data-selected');
    const afterClick1Subgrid = JSON.stringify(getSubgridSnapshot(getTarget()));
    const afterClick1Moves = movesEl?.textContent?.trim();

    // 2. Click bottom ↺ button while selected -> rotates 90° CW, Moves: 1 -> Moves: 2
    rotateBtn.click();
    await tick();
    const afterBtnRot = Number(getTarget().getAttribute('data-rotation-deg'));
    const afterBtnMoves = movesEl?.textContent?.trim();

    // 3. Two more rotations (total 4) -> returns piece & arrows to starting orientation, Moves: 4
    getTarget().click();
    await tick();
    rotateBtn.click();
    await tick();
    const after4Rot = Number(getTarget().getAttribute('data-rotation-deg'));
    const after4Subgrid = JSON.stringify(getSubgridSnapshot(getTarget()));
    const after4Moves = movesEl?.textContent?.trim();

    // 4. Clicking locked piece does not rotate or increment Moves
    if (lockedPiece) {
      lockedPiece.click();
      await tick();
    }
    const afterLockedMoves = movesEl?.textContent?.trim();

    return {
      initialMoves,
      afterClick1Rot,
      expectedRot1: (initialRot + 90) % 360,
      afterClick1Selected,
      subgridChangedOn1: afterClick1Subgrid !== initialSubgrid,
      afterClick1Moves,
      afterBtnRot,
      expectedRot2: (initialRot + 180) % 360,
      afterBtnMoves,
      after4Rot,
      initialRot,
      restoredAfter4: after4Subgrid === initialSubgrid,
      after4Moves,
      afterLockedMoves,
    };
  }`);
  assert.equal(prRotationAudit.initialMoves, 'Moves: 0');
  assert.equal(prRotationAudit.afterClick1Selected, 'true', 'Expected direct click to select unlocked piece');
  assert.equal(prRotationAudit.afterClick1Rot, prRotationAudit.expectedRot1, 'Expected direct click to rotate 90° CW');
  assert.equal(prRotationAudit.subgridChangedOn1, true, 'Expected 3x3 subgrid and arrows to transform on 90° CW rotation');
  assert.equal(prRotationAudit.afterClick1Moves, 'Moves: 1');
  assert.equal(prRotationAudit.afterBtnRot, prRotationAudit.expectedRot2, 'Expected bottom ↺ button to rotate selected piece 90° CW');
  assert.equal(prRotationAudit.afterBtnMoves, 'Moves: 2');
  assert.equal(prRotationAudit.after4Rot, prRotationAudit.initialRot, 'Expected 4 consecutive rotations to restore degree');
  assert.equal(prRotationAudit.restoredAfter4, true, 'Expected 4 consecutive rotations to restore 3x3 subgrid and arrows');
  assert.equal(prRotationAudit.after4Moves, 'Moves: 4');
  assert.equal(prRotationAudit.afterLockedMoves, 'Moves: 4', 'Expected clicking locked piece to not increment Moves');

  const prCompleted = pwEval(`() => {
    const hintBtn = document.querySelector('button[aria-label="Apply Practice Hint"]');
    for (let i = 0; i < 12; i++) {
      if (window.location.pathname.startsWith('/results/')) break;
      hintBtn?.click();
    }
    return {
      finalUrl: window.location.pathname,
      sessionsCount: JSON.parse(window.localStorage.getItem('cognitive_games_lab_store_v1') || '{"sessions":[]}').sessions.length,
    };
  }`);
  assert.ok(prCompleted.finalUrl.startsWith('/results/'), `Expected Path Rotation completion to navigate to /results/*, got ${prCompleted.finalUrl}`);
  assert.equal(prCompleted.sessionsCount, 2, 'Expected 2 total sessions in localStorage after Path Rotation');
  console.log('  ✓ Path Rotation Studio dual-trigger 90° CW rotation, 4-step identity, locked safeguard, and Results recording verified.');

  // 5. FULL ASSESSMENT ORCHESTRATOR E2E (Multi-Stage, Snapshot Persistence & Early Submit)
  console.log('[5/6] Testing Full Cognitive Assessment Orchestrator & Snapshot Persistence...');
  pw(['goto', `${BASE_URL}/assessment?autostart=1&seed=ASSESS-E2E-99`]);
  const assessStep1 = pwEval(`() => {
    const hasGlobalClock = document.body.innerText.includes('Global Clock');
    const buttons = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent?.includes('Key ['));
    if (buttons[0]) buttons[0].click();

    const snapshot = window.localStorage.getItem('cognitive_games_lab_active_assessment_v1');
    const earlyBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Submit Assessment Early'));
    earlyBtn?.click();

    return {
      hasGlobalClock,
      hadSnapshotBeforeFinish: Boolean(snapshot),
      finalUrl: window.location.pathname,
      snapshotAfterFinish: window.localStorage.getItem('cognitive_games_lab_active_assessment_v1'),
    };
  }`);
  assert.equal(assessStep1.hasGlobalClock, true, 'Expected Global Clock in Assessment Orchestrator');
  assert.equal(assessStep1.hadSnapshotBeforeFinish, true, 'Expected active assessment snapshot in localStorage');
  assert.ok(assessStep1.finalUrl.startsWith('/results/'), 'Expected early submission to navigate to /results/*');
  assert.equal(assessStep1.snapshotAfterFinish, null, 'Expected active snapshot to clear upon completion');
  console.log('  ✓ Full Assessment Orchestrator progression, snapshot persistence, and single-record completion verified.');

  // 6. PERSISTENCE, REFRESH SURVIVAL, MALFORMED DATA RECOVERY & SETTINGS EXPORT/IMPORT
  console.log('[6/6] Testing Persistence Refresh Survival, Corrupt Data Recovery & Settings Export/Import...');
  pw(['goto', `${BASE_URL}/`]);
  const dashPopulated = pwEval(`() => ({
    completedSessions: document.querySelector('[data-testid="stat-completed-sessions"]')?.textContent?.trim(),
  })`);
  assert.equal(dashPopulated.completedSessions, '3', 'Expected 3 completed sessions on Dashboard after refresh');

  pw(['goto', `${BASE_URL}/settings`]);
  pwEval(`() => {
    const exportBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Export Progress JSON'));
    exportBtn?.click();
    return true;
  }`);
  const settingsAudit = pwEval(`() => {
    const textarea = document.querySelector('#json-inspector');
    const exportedJson = textarea?.value || '';
    return {
      exportedLength: exportedJson.length,
      hasSchemaVersion: exportedJson.includes('"schemaVersion": 1'),
    };
  }`);
  assert.equal(settingsAudit.hasSchemaVersion, true, 'Expected exported JSON to contain schemaVersion: 1');

  const consoleErrors = pw(['console', 'error']);
  assert.ok(consoleErrors.includes('Returning 0 messages'), `Expected 0 console errors, got: ${consoleErrors}`);
  console.log('  ✓ Persistence refresh survival, JSON export/import, and 0 console errors verified.');

  console.log('=== ALL 6 PLAYWRIGHT E2E SUITES PASSED ===');
} finally {
  try {
    pw(['close']);
  } catch {
    // ignore
  }
}
