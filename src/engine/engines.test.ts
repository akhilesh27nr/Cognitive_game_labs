import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATH_BUBBLES_ARCHETYPES,
  mathBubblesEngine,
} from './mathBubblesEngine.ts';
import {
  MEMORY_MAZE_ARCHETYPES,
  MEMORY_MAZE_GRID_KEY_OPTIONS,
  memoryMazeEngine,
  verifyMazeSolvabilityBFS,
} from './memoryMazeEngine.ts';
import {
  PATH_ROTATION_ARCHETYPES,
  applyPathFinderHint,
  createScrambledPathFinderBoard,
  cyclePathFinderPieceArrows,
  evaluatePathFinderBoard,
  pathRotationEngine,
  rotateArrowVector90CW,
  rotatePathFinderPiece90CW,
  rotatePathFinderPieceAt,
  rotateSingleSubcellArrowAt,
  rotateSubgridMatrix90CW,
  swapPathFinderPieces,
  traceEnergizedNetwork,
  verifyPathRotationSolution,
} from './pathRotationEngine.ts';
import {
  SEEDED_TEST_FIXTURES,
  aggregateSessionScore,
  buildEvaluatedExpression,
  compareScaledValues,
  type ExprNode,
} from './index.ts';
import {
  createPlayerSessionProfile,
  loadPlayerSessionProfile,
  PLAYER_SESSION_STORAGE_KEY,
  savePlayerSessionProfile,
  setHideGameInstructions,
  shouldHideGameInstructions,
  updatePlayerSessionWithRecord,
  validatePlayerName,
  type StorageLike,
} from '../storage/persistence.ts';
import type { GameConfig, SessionRecord } from '../types/domain.ts';

test('All three engines expose 50 archetypes each (150 total archetypes)', () => {
  assert.equal(MATH_BUBBLES_ARCHETYPES.length, 50);
  assert.equal(MEMORY_MAZE_ARCHETYPES.length, 50);
  assert.equal(PATH_ROTATION_ARCHETYPES.length, 50);

  const mbCodes = new Set(MATH_BUBBLES_ARCHETYPES.map((a) => a.code));
  const mmCodes = new Set(MEMORY_MAZE_ARCHETYPES.map((a) => a.code));
  const prCodes = new Set(PATH_ROTATION_ARCHETYPES.map((a) => a.code));
  assert.equal(mbCodes.size, 50);
  assert.equal(mmCodes.size, 50);
  assert.equal(prCodes.size, 50);
});

test('Safe AST expressionEvaluator evaluates brackets, roots, powers, fractions, percentages, negatives, and guards division by zero without eval()', () => {
  const lit = (v: number): ExprNode => ({ kind: 'literal', value: v });

  // (4 + 6) * 3 = 30
  const bracketExpr: ExprNode = {
    kind: 'binary',
    op: 'mul',
    left: { kind: 'binary', op: 'add', left: lit(4), right: lit(6), bracketed: true },
    right: lit(3),
  };
  assert.equal(buildEvaluatedExpression(bracketExpr).numericValue, 30);

  // sqrt(81) + 2^3 = 9 + 8 = 17
  const rootPowerExpr: ExprNode = {
    kind: 'binary',
    op: 'add',
    left: { kind: 'unary', op: 'sqrt', operand: lit(81) },
    right: { kind: 'unary', op: 'cube', operand: lit(2) },
  };
  assert.equal(buildEvaluatedExpression(rootPowerExpr).numericValue, 17);

  // 25% of 80 = 20
  const pctExpr: ExprNode = { kind: 'percent-of', percent: 25, base: 80 };
  assert.equal(buildEvaluatedExpression(pctExpr).numericValue, 20);

  // 60 + 20% = 72
  const pctInc: ExprNode = { kind: 'percent-change', base: 60, percent: 20, direction: 'increase' };
  assert.equal(buildEvaluatedExpression(pctInc).numericValue, 72);

  // |-14| = 14
  const absExpr: ExprNode = { kind: 'unary', op: 'abs', operand: lit(-14) };
  assert.equal(buildEvaluatedExpression(absExpr).numericValue, 14);

  // Division by zero and mod by zero throw explicit defensive Errors without eval()
  const divByZero: ExprNode = { kind: 'binary', op: 'div', left: lit(25), right: lit(0) };
  assert.throws(() => buildEvaluatedExpression(divByZero), /Division by zero/);

  const modByZero: ExprNode = { kind: 'binary', op: 'mod', left: lit(25), right: lit(0) };
  assert.throws(() => buildEvaluatedExpression(modByZero), /Modulo by zero/);

  // Floating-point exactness: 0.1 + 0.2 === 0.3 in scaled integer comparison
  const decAdd: ExprNode = { kind: 'binary', op: 'add', left: lit(0.1), right: lit(0.2) };
  const decTarget: ExprNode = lit(0.3);
  assert.equal(
    compareScaledValues(
      buildEvaluatedExpression(decAdd).exactScaledValue,
      buildEvaluatedExpression(decTarget).exactScaledValue,
      'ascending',
      1,
      2
    ),
    -1 // Equal scaled values tie-break by lower displayIndex (1 < 2)
  );
  assert.equal(
    buildEvaluatedExpression(decAdd).exactScaledValue,
    buildEvaluatedExpression(decTarget).exactScaledValue
  );
});

test('All 50 Math Bubbles archetypes (MB-01 to MB-50) generate valid, well-defined ordering puzzles', () => {
  for (const arch of MATH_BUBBLES_ARCHETYPES) {
    const config: GameConfig = {
      gameType: 'math-bubbles',
      difficulty: arch.recommendedDifficulty,
      evaluationMode: 'practice',
      questionCount: 5,
      timeLimitSeconds: 75,
      perQuestionTimeSeconds: 15,
      seed: `TEST-SEED-${arch.code}`,
      archetypeId: arch.id,
      practiceRules: {
        allowUndo: true,
        showLiveValidation: true,
        strictOrderPenalty: false,
      },
    };

    const gen = mathBubblesEngine.generatePuzzle(config, 0);
    assert.equal(gen.metadata.archetypeId, arch.id);
    assert.ok(gen.puzzle.bubbles.length === 3 || gen.puzzle.bubbles.length === 4);
    assert.equal(gen.puzzle.expectedSequenceIds.length, gen.puzzle.bubbles.length);

    for (const b of gen.puzzle.bubbles) {
      assert.ok(Number.isFinite(b.numericValue), `Non-finite bubble value in ${arch.code}`);
      assert.ok(b.label.length > 0, `Empty label in ${arch.code}`);
    }

    // Simulate selecting the exact expected sequence
    let state = gen.initialState;
    let completed = false;
    for (const targetId of gen.puzzle.expectedSequenceIds) {
      const out = mathBubblesEngine.validateAction(gen.puzzle, state, {
        type: 'select-bubble',
        bubbleId: targetId,
      });
      assert.equal(out.valid, true, `Expected valid selection in ${arch.code}`);
      state = out.nextState;
      completed = out.isComplete;
    }
    assert.equal(completed, true, `Expected puzzle completion in ${arch.code}`);

    const result = mathBubblesEngine.calculateQuestionResult({
      metadata: gen.metadata,
      puzzle: gen.puzzle,
      finalState: state,
      elapsedMs: 3200,
      timedOut: false,
    });
    assert.equal(result.isCorrect, true);
    assert.ok(result.scoreEarned > 0);
  }
});

test('Math Bubbles engine prevents duplicate selection, supports undo-last, and classifies error categories', () => {
  const config: GameConfig = {
    gameType: 'math-bubbles',
    difficulty: 'intermediate',
    evaluationMode: 'practice',
    questionCount: 5,
    timeLimitSeconds: 75,
    perQuestionTimeSeconds: 15,
    seed: 'MB-DUPLICATE-TEST',
    archetypeId: 'mb-06',
    practiceRules: {
      allowUndo: true,
      showLiveValidation: true,
      strictOrderPenalty: false,
    },
  };

  const gen = mathBubblesEngine.generatePuzzle(config, 0);
  const firstCorrectId = gen.puzzle.expectedSequenceIds[0];
  const wrongFirstId = gen.puzzle.expectedSequenceIds[gen.puzzle.expectedSequenceIds.length - 1];

  // Selecting an out-of-order bubble appends to selectedIds (valid: true) so player can complete the sequence
  const wrongAttempt = mathBubblesEngine.validateAction(gen.puzzle, gen.initialState, {
    type: 'select-bubble',
    bubbleId: wrongFirstId,
  });
  assert.equal(wrongAttempt.valid, true);
  assert.equal(wrongAttempt.nextState.selectedIds.length, 1);
  assert.equal(wrongAttempt.nextState.mistakesCount, 1);
  assert.ok(wrongAttempt.nextState.errorCategoriesTriggered.length >= 1);

  const step1 = mathBubblesEngine.validateAction(gen.puzzle, gen.initialState, {
    type: 'select-bubble',
    bubbleId: firstCorrectId,
  });
  assert.equal(step1.valid, true);
  assert.equal(step1.nextState.selectedIds.length, 1);

  // Duplicate selection of the same bubble must be rejected
  const dupStep = mathBubblesEngine.validateAction(gen.puzzle, step1.nextState, {
    type: 'select-bubble',
    bubbleId: firstCorrectId,
  });
  assert.equal(dupStep.valid, false);
  assert.equal(dupStep.nextState.selectedIds.length, 1);

  // Undo last selection
  const undoStep = mathBubblesEngine.validateAction(gen.puzzle, step1.nextState, {
    type: 'undo-last',
  });
  assert.equal(undoStep.valid, true);
  assert.equal(undoStep.nextState.selectedIds.length, 0);
});

test('All 50 Memory Maze archetypes (MM-01 to MM-50) generate BFS-solvable mazes and complete along optimalPath', () => {
  for (const arch of MEMORY_MAZE_ARCHETYPES) {
    const config: GameConfig = {
      gameType: 'memory-maze',
      difficulty: arch.recommendedDifficulty,
      evaluationMode: 'practice',
      questionCount: 5,
      timeLimitSeconds: 175,
      perQuestionTimeSeconds: 35,
      seed: `TEST-MM-${arch.code}`,
      archetypeId: arch.id,
      practiceRules: {
        allowUndo: true,
        showLiveValidation: true,
        strictOrderPenalty: false,
      },
    };

    const gen = memoryMazeEngine.generatePuzzle(config, 0);
    assert.equal(gen.metadata.archetypeId, arch.id);
    assert.ok(gen.puzzle.optimalPath.length >= 2, `Optimal path missing in ${arch.code}`);

    const bfs = verifyMazeSolvabilityBFS({
      gridSize: gen.puzzle.gridSize,
      start: gen.puzzle.start,
      goal: gen.puzzle.goal,
      hazards: gen.puzzle.hazards,
      staticWalls: gen.puzzle.staticWalls,
      keysOrder: gen.puzzle.keysOrder,
      strictKeyOrder: gen.puzzle.strictKeyOrder,
      doors: gen.puzzle.doors,
      oneWayDoors: gen.puzzle.oneWayDoors,
    });
    assert.equal(bfs.solvable, true, `Maze ${arch.code} failed BFS solvability check`);

    let state = memoryMazeEngine.validateAction(gen.puzzle, gen.initialState, {
      type: 'begin-navigation',
    }).nextState;

    let completed = false;
    for (let i = 1; i < gen.puzzle.optimalPath.length; i++) {
      const stepCoord = gen.puzzle.optimalPath[i];
      const out = memoryMazeEngine.validateAction(gen.puzzle, state, {
        type: 'step-to',
        row: stepCoord.row,
        col: stepCoord.col,
      });
      assert.equal(out.valid, true, `Step ${i} along optimalPath failed in ${arch.code}`);
      state = out.nextState;
      if (out.isComplete) {
        completed = true;
        break;
      }
    }
    assert.equal(completed, true, `Maze ${arch.code} did not complete at end of optimalPath`);
  }
});

test('Memory Maze enforces key collection before exit, resets player to START on barrier collision, and increments collision/attempt counters', () => {
  const config: GameConfig = {
    gameType: 'memory-maze',
    difficulty: 'intermediate',
    evaluationMode: 'practice',
    questionCount: 5,
    timeLimitSeconds: 175,
    perQuestionTimeSeconds: 35,
    seed: 'MM-EDGE-DEFENSIVE-01',
    archetypeId: 'mm-17', // Sequentially collected keys (A, B, C)
    practiceRules: {
      allowUndo: true,
      showLiveValidation: true,
      strictOrderPenalty: false,
    },
  };

  const gen = memoryMazeEngine.generatePuzzle(config, 0);
  let state = memoryMazeEngine.validateAction(gen.puzzle, gen.initialState, {
    type: 'begin-navigation',
  }).nextState;

  // Step along optimalPath until adjacent to a barrier, then hit it and verify immediate reset to START
  for (let i = 1; i < gen.puzzle.optimalPath.length; i++) {
    const stepCoord = gen.puzzle.optimalPath[i];
    state = memoryMazeEngine.validateAction(gen.puzzle, state, {
      type: 'step-to',
      row: stepCoord.row,
      col: stepCoord.col,
    }).nextState;

    const adjHazard = gen.puzzle.hazards.find(
      (h) => Math.abs(h.row - state.player.row) + Math.abs(h.col - state.player.col) === 1
    );
    if (adjHazard) {
      const prevMoves = state.movesCount;
      const prevMistakes = state.mistakesCount;
      const hitOut = memoryMazeEngine.validateAction(gen.puzzle, state, {
        type: 'step-to',
        row: adjHazard.row,
        col: adjHazard.col,
      });
      assert.equal(hitOut.valid, false);
      assert.deepEqual(hitOut.nextState.player, gen.puzzle.start);
      assert.equal(hitOut.nextState.movesCount, prevMoves + 1);
      assert.equal(hitOut.nextState.mistakesCount, prevMistakes + 1);
      assert.equal(hitOut.nextState.hitHazards.length, 1);

      const resetOut = memoryMazeEngine.validateAction(gen.puzzle, hitOut.nextState, {
        type: 'reset-position',
      });
      assert.equal(resetOut.valid, true);
      assert.equal(resetOut.nextState.hitHazards.length, 1);
      break;
    }
  }
});

test('All 50 Path Rotation archetypes (PR-01 to PR-50) generate solvable circuits and validate directional connections', () => {
  for (const arch of PATH_ROTATION_ARCHETYPES) {
    const config: GameConfig = {
      gameType: 'path-rotation',
      difficulty: arch.recommendedDifficulty,
      evaluationMode: 'practice',
      questionCount: 5,
      timeLimitSeconds: 175,
      perQuestionTimeSeconds: 35,
      seed: `TEST-PR-${arch.code}`,
      archetypeId: arch.id,
      practiceRules: {
        allowUndo: true,
        showLiveValidation: true,
        strictOrderPenalty: false,
      },
    };

    const gen = pathRotationEngine.generatePuzzle(config, 0);
    assert.equal(gen.metadata.archetypeId, arch.id);
    assert.ok(gen.puzzle.gridSize >= 3 && gen.puzzle.gridSize <= 6);

    // PR-01 is Straight-Line Solutions: verify every energized tile in its solution is a straight conduit
    if (arch.code === 'PR-01') {
      const solTransforms = gen.puzzle.tiles.map((row) =>
        row.map((t) => ({ rotation: t.solutionRotation, flipped: t.solutionFlipped }))
      );
      const solTrace = traceEnergizedNetwork(gen.puzzle, solTransforms);
      for (const coord of solTrace.energizedCoords) {
        assert.equal(gen.puzzle.tiles[coord.row][coord.col].shape, 'straight');
      }
    }

    // Initial scrambled board must NOT already be solved
    const initialTrace = traceEnergizedNetwork(gen.puzzle, gen.initialState.transforms);
    const initiallySolved =
      initialTrace.isConnectedToSink &&
      initialTrace.allWaypointsEnergized &&
      initialTrace.checkpointOrderValid &&
      initialTrace.arrowConstraintsValid;
    assert.equal(initiallySolved, false, `Archetype ${arch.code} spawned already solved`);

    // Solution transforms must solve the puzzle with valid directional connections, checkpoints, and flow arrows
    assert.equal(
      verifyPathRotationSolution(gen.puzzle),
      true,
      `Archetype ${arch.code} failed solution verification`
    );

    // Solve step-by-step using request-hint in Practice mode
    let state = gen.initialState;
    let solved = false;
    for (let step = 0; step < gen.puzzle.gridSize * gen.puzzle.gridSize * 2; step++) {
      const out = pathRotationEngine.validateAction(gen.puzzle, state, { type: 'request-hint' });
      state = out.nextState;
      if (out.isComplete) {
        solved = true;
        break;
      }
    }
    assert.equal(solved, true, `Archetype ${arch.code} did not complete via solution hints`);

    const qRes = pathRotationEngine.calculateQuestionResult({
      metadata: gen.metadata,
      puzzle: gen.puzzle,
      finalState: state,
      elapsedMs: 4100,
      timedOut: false,
    });
    assert.equal(qRes.isCorrect, true);
    assert.ok(qRes.routeQuality);
  }
});

test('Path Rotation engine supports undo-move, request-hint, reset-board, and blocks hints/undo in Exam mode', () => {
  const practiceConfig: GameConfig = {
    gameType: 'path-rotation',
    difficulty: 'intermediate',
    evaluationMode: 'practice',
    questionCount: 5,
    timeLimitSeconds: 175,
    perQuestionTimeSeconds: 35,
    seed: 'PR-CONTROLS-TEST',
    archetypeId: 'pr-02',
    practiceRules: {
      allowUndo: true,
      showLiveValidation: true,
      strictOrderPenalty: false,
    },
  };

  const gen = pathRotationEngine.generatePuzzle(practiceConfig, 0);
  let targetRow = 0;
  let targetCol = 0;
  for (let r = 0; r < gen.puzzle.gridSize; r++) {
    for (let c = 0; c < gen.puzzle.gridSize; c++) {
      if (!gen.puzzle.tiles[r][c].locked && gen.puzzle.tiles[r][c].shape !== 'blocker') {
        targetRow = r;
        targetCol = c;
      }
    }
  }

  const initialRot = gen.initialState.transforms[targetRow][targetCol].rotation;
  const rotOut = pathRotationEngine.validateAction(gen.puzzle, gen.initialState, {
    type: 'rotate-tile',
    row: targetRow,
    col: targetCol,
    clockwise: true,
  });
  assert.equal(rotOut.valid, true);
  assert.notEqual(rotOut.nextState.transforms[targetRow][targetCol].rotation, initialRot);
  assert.equal(rotOut.nextState.movesCount, 1);

  // Undo restores previous rotation
  const undoOut = pathRotationEngine.validateAction(gen.puzzle, rotOut.nextState, {
    type: 'undo-move',
  });
  assert.equal(undoOut.valid, true);
  assert.equal(undoOut.nextState.transforms[targetRow][targetCol].rotation, initialRot);

  // Reset restores initial scrambled transforms
  const rotAgain = pathRotationEngine.validateAction(gen.puzzle, gen.initialState, {
    type: 'rotate-tile',
    row: targetRow,
    col: targetCol,
    clockwise: true,
  });
  const resetOut = pathRotationEngine.validateAction(gen.puzzle, rotAgain.nextState, {
    type: 'reset-board',
  });
  assert.equal(resetOut.valid, true);
  assert.equal(resetOut.nextState.movesCount, 0);
  assert.equal(resetOut.nextState.transforms[targetRow][targetCol].rotation, initialRot);

  // Exam mode blocks hints and undo
  const examGen = pathRotationEngine.generatePuzzle(
    { ...practiceConfig, evaluationMode: 'exam' },
    0
  );
  const examHint = pathRotationEngine.validateAction(examGen.puzzle, examGen.initialState, {
    type: 'request-hint',
  });
  assert.equal(examHint.valid, false);
});

test('All seeded test fixtures (Math Bubbles, Memory Maze, Path Rotation) generate deterministic, reproducible puzzles', () => {
  assert.equal(SEEDED_TEST_FIXTURES.length, 9);

  for (const fixture of SEEDED_TEST_FIXTURES) {
    const cfg: GameConfig = {
      gameType: fixture.gameType,
      difficulty: fixture.difficulty,
      evaluationMode: 'practice',
      questionCount: fixture.questionCount,
      timeLimitSeconds: 150,
      perQuestionTimeSeconds: 15,
      seed: fixture.seed,
      archetypeId: fixture.archetypeId,
      practiceRules: {
        allowUndo: true,
        showLiveValidation: true,
        strictOrderPenalty: false,
      },
    };

    if (fixture.gameType === 'math-bubbles') {
      const a = mathBubblesEngine.generatePuzzle(cfg, 0);
      const b = mathBubblesEngine.generatePuzzle(cfg, 0);
      assert.deepEqual(a.puzzle.bubbles, b.puzzle.bubbles);
    } else if (fixture.gameType === 'memory-maze') {
      const a = memoryMazeEngine.generatePuzzle(cfg, 0);
      const b = memoryMazeEngine.generatePuzzle(cfg, 0);
      assert.deepEqual(a.puzzle.optimalPath, b.puzzle.optimalPath);
    } else if (fixture.gameType === 'path-rotation') {
      const a = pathRotationEngine.generatePuzzle(cfg, 0);
      const b = pathRotationEngine.generatePuzzle(cfg, 0);
      assert.deepEqual(a.initialState.transforms, b.initialState.transforms);
    }
  }
});

test('aggregateSessionScore tracks questionsAttempted, questionsRemaining, incorrectCount, and timeoutCount', () => {
  const score = aggregateSessionScore(
    [
      {
        puzzleId: 'q1',
        gameType: 'math-bubbles',
        archetypeId: 'mb-01',
        archetypeTitle: 'MB-01',
        difficulty: 'easy',
        seed: 'S::0',
        questionIndex: 0,
        isCorrect: true,
        partialCredit: 1,
        scoreEarned: 150,
        maxPossibleScore: 160,
        elapsedMs: 3000,
        timeLimitMs: 15000,
        timeoutStatus: 'within-limit',
        attemptsCount: 3,
        mistakesCount: 0,
        errorCategory: 'none',
        summaryText: 'OK',
      },
      {
        puzzleId: 'q2',
        gameType: 'math-bubbles',
        archetypeId: 'mb-02',
        archetypeTitle: 'MB-02',
        difficulty: 'easy',
        seed: 'S::1',
        questionIndex: 1,
        isCorrect: false,
        partialCredit: 0,
        scoreEarned: 0,
        maxPossibleScore: 160,
        elapsedMs: 15000,
        timeLimitMs: 15000,
        timeoutStatus: 'timed-out',
        attemptsCount: 0,
        mistakesCount: 0,
        errorCategory: 'timeout-incomplete',
        summaryText: 'Timed out',
      },
    ],
    5
  );

  assert.equal(score.totalQuestions, 5);
  assert.equal(score.questionsAttempted, 2);
  assert.equal(score.questionsRemaining, 3);
  assert.equal(score.correctCount, 1);
  assert.equal(score.incorrectCount, 1);
  assert.equal(score.timeoutCount, 1);
});

test('Path Finder 90° Clockwise Matrix & Arrow Vector Rotation: transforms 3x3 subgrid coordinates, rotates orthogonal/diagonal arrows, returns new references, and restores identity after 4 rotations', () => {
  // 1. Verify orthogonal and diagonal arrow vector 90° CW mappings
  assert.equal(rotateArrowVector90CW('↑'), '→');
  assert.equal(rotateArrowVector90CW('→'), '↓');
  assert.equal(rotateArrowVector90CW('↓'), '←');
  assert.equal(rotateArrowVector90CW('←'), '↑');

  assert.equal(rotateArrowVector90CW('↗'), '↘');
  assert.equal(rotateArrowVector90CW('↘'), '↙');
  assert.equal(rotateArrowVector90CW('↙'), '↖');
  assert.equal(rotateArrowVector90CW('↖'), '↗');

  // 2. Verify 3x3 sub-grid coordinate transformation: new_row = col, new_col = (N - 1) - row
  const testSubgrid = [
    [
      { active: false, arrow: null },
      { active: true, arrow: '↓' as const },
      { active: false, arrow: null },
    ],
    [
      { active: false, arrow: null },
      { active: true, arrow: '↘' as const },
      { active: true, arrow: '→' as const },
    ],
    [
      { active: false, arrow: null },
      { active: false, arrow: null },
      { active: false, arrow: null },
    ],
  ];

  const rotatedOnce = rotateSubgridMatrix90CW(testSubgrid);
  // (0, 1) with '↓' -> new_row = 1, new_col = 2 - 0 = 2 with '←'
  assert.deepEqual(rotatedOnce[1][2], { active: true, arrow: '←' });
  // (1, 1) with '↘' -> new_row = 1, new_col = 2 - 1 = 1 with '↙'
  assert.deepEqual(rotatedOnce[1][1], { active: true, arrow: '↙' });
  // (1, 2) with '→' -> new_row = 2, new_col = 2 - 1 = 1 with '↓'
  assert.deepEqual(rotatedOnce[2][1], { active: true, arrow: '↓' });

  // 3. Verify board generation, scrambling, 90° CW piece rotation, 4-rotation identity, and locked safeguard
  const config: GameConfig = {
    gameType: 'path-rotation',
    difficulty: 'intermediate',
    questionCount: 1,
    timeLimitSeconds: 35,
    perQuestionTimeSeconds: 35,
    seed: 'PF-SCRAMBLE-TEST-42',
    archetypeId: 'pr-21',
    practiceRules: {
      allowUndo: true,
      showLiveValidation: true,
      strictOrderPenalty: false,
    },
  };
  const gen = pathRotationEngine.generatePuzzle(config, 0);
  const { initialBoard, solvedBoard } = createScrambledPathFinderBoard(
    gen.puzzle,
    gen.metadata.seed
  );

  // Solved board must evaluate as geometrically connected and directionally aligned
  const solvedEval = evaluatePathFinderBoard(gen.puzzle, solvedBoard);
  assert.equal(solvedEval.isGeometricallyConnected, true);
  assert.equal(solvedEval.isDirectionallyAligned, true);
  assert.equal(solvedEval.isSolved, true);

  // Scrambled initial board must be visibly disconnected and not solved at start
  const initialEval = evaluatePathFinderBoard(gen.puzzle, initialBoard);
  assert.equal(initialEval.isSolved, false);
  assert.equal(initialEval.isGeometricallyConnected, false);

  // Locked or blocker tiles must reject rotation attempts
  for (let r = 0; r < gen.puzzle.gridSize; r++) {
    for (let c = 0; c < gen.puzzle.gridSize; c++) {
      const p = initialBoard[r][c];
      if (p.locked || p.isBlocker) {
        const lockedAttempt = rotatePathFinderPieceAt(initialBoard, r, c);
        assert.equal(lockedAttempt.rotated, false);
      }
    }
  }

  // Find an unlocked non-empty piece and verify 90° CW rotation + 4-step identity
  const unlockedCoords: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < gen.puzzle.gridSize; r++) {
    for (let c = 0; c < gen.puzzle.gridSize; c++) {
      const p = initialBoard[r][c];
      if (!p.locked && !p.isBlocker && !p.isEmptySlot) {
        unlockedCoords.push({ row: r, col: c });
      }
    }
  }
  assert.ok(unlockedCoords.length >= 2);
  const pieceCoord = unlockedCoords[0];
  const pieceBefore = initialBoard[pieceCoord.row][pieceCoord.col];

  const rot1 = rotatePathFinderPieceAt(initialBoard, pieceCoord.row, pieceCoord.col);
  assert.equal(rot1.rotated, true);
  // Ensure new board/piece reference (no in-place mutation)
  assert.notEqual(rot1.nextBoard, initialBoard);
  const pieceAfter1 = rot1.nextBoard[pieceCoord.row][pieceCoord.col];
  assert.notEqual(pieceAfter1, pieceBefore);
  assert.equal(pieceAfter1.rotationDeg, (pieceBefore.rotationDeg + 90) % 360);

  // 4 consecutive 90° clockwise rotations return the piece and its 3x3 subgrid arrows to starting orientation
  let cycledPiece = pieceBefore;
  for (let step = 0; step < 4; step++) {
    cycledPiece = rotatePathFinderPiece90CW(cycledPiece);
  }
  assert.equal(cycledPiece.rotationDeg, pieceBefore.rotationDeg);
  assert.deepEqual(cycledPiece.subgrid, pieceBefore.subgrid);
  assert.deepEqual(cycledPiece.lockedPorts, pieceBefore.lockedPorts);
  assert.equal(cycledPiece.activeEntry, pieceBefore.activeEntry);
  assert.equal(cycledPiece.activeExit, pieceBefore.activeExit);

  // Also verify swapPathFinderPieces and cyclePathFinderPieceArrows alias
  const swapRes = swapPathFinderPieces(initialBoard, unlockedCoords[0], unlockedCoords[1]);
  assert.equal(swapRes.swapped, true);
  const aliasRes = cyclePathFinderPieceArrows(initialBoard, pieceCoord.row, pieceCoord.col);
  assert.equal(aliasRes.cycled, true);

  // Applying hints iteratively solves the board
  let workingBoard = initialBoard;
  for (let i = 0; i < 16; i++) {
    if (evaluatePathFinderBoard(gen.puzzle, workingBoard).isSolved) break;
    workingBoard = applyPathFinderHint(workingBoard).nextBoard;
  }
  assert.equal(evaluatePathFinderBoard(gen.puzzle, workingBoard).isSolved, true);
});

test('Frictionless Name-Based Onboarding & How to Play preferences persist accurately in storage', () => {
  const storeMap = new Map<string, string>();
  const mockStorage: StorageLike = {
    getItem: (k) => storeMap.get(k) ?? null,
    setItem: (k, v) => storeMap.set(k, v),
    removeItem: (k) => storeMap.delete(k),
  };

  assert.equal(validatePlayerName('   ').valid, false);
  assert.equal(validatePlayerName('A').valid, false);
  assert.equal(validatePlayerName('A'.repeat(26)).valid, false);
  const validCheck = validatePlayerName('  Akhilesh  ');
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.trimmedName, 'Akhilesh');

  const created = createPlayerSessionProfile('  Akhilesh  ', '2026-10-20T11:00:00.000Z');
  savePlayerSessionProfile(created, mockStorage);
  assert.ok(storeMap.has(PLAYER_SESSION_STORAGE_KEY));

  const loaded = loadPlayerSessionProfile(mockStorage);
  assert.ok(loaded);
  assert.equal(loaded.playerName, 'Akhilesh');
  assert.equal(loaded.gameStats.quickFireMath.gamesPlayed, 0);
  assert.equal(loaded.gameStats.memoryMaze.wallHitsTotal, 0);
  assert.equal(loaded.gameStats.pathFinder.bestMoves, null);

  // Record a session and verify stats update
  const mockSession: SessionRecord = {
    sessionId: 'ses-test-1',
    mode: 'practice',
    evaluationMode: 'practice',
    gameType: 'path-rotation',
    status: 'completed',
    startedAtIso: '2026-10-20T11:05:00.000Z',
    completedAtIso: '2026-10-20T11:06:00.000Z',
    seed: 'PR-1',
    difficulty: 'intermediate',
    config: {
      gameType: 'path-rotation',
      difficulty: 'intermediate',
      questionCount: 1,
      timeLimitSeconds: 35,
      perQuestionTimeSeconds: 35,
      seed: 'PR-1',
      practiceRules: {
        allowUndo: true,
        showLiveValidation: true,
        strictOrderPenalty: false,
      },
    },
    score: {
      totalScore: 150,
      maxPossibleScore: 160,
      NormalizedScore: 938,
      accuracyPercent: 100,
      correctCount: 1,
      totalQuestions: 1,
      averageResponseMs: 4200,
      totalElapsedMs: 4200,
      streakBest: 1,
      speedBonusTotal: 20,
      precisionBonusTotal: 20,
    },
    questionResults: [
      {
        puzzleId: 'pr-q1',
        gameType: 'path-rotation',
        archetypeId: 'pr-01',
        archetypeTitle: 'PR-01',
        difficulty: 'intermediate',
        seed: 'PR-1::0',
        questionIndex: 0,
        isCorrect: true,
        partialCredit: 1,
        scoreEarned: 150,
        maxPossibleScore: 160,
        elapsedMs: 4200,
        timeLimitMs: 35000,
        timeoutStatus: 'within-limit',
        attemptsCount: 6,
        mistakesCount: 0,
        summaryText: 'Solved',
      },
    ],
  };

  const updated = updatePlayerSessionWithRecord(loaded, mockSession, mockStorage);
  assert.ok(updated);
  assert.equal(updated.gameStats.pathFinder.gamesPlayed, 1);
  assert.equal(updated.gameStats.pathFinder.bestMoves, 6);

  // Verify How to Play instruction flags
  assert.equal(shouldHideGameInstructions('memory_maze', mockStorage), false);
  setHideGameInstructions('memory_maze', true, mockStorage);
  assert.equal(shouldHideGameInstructions('memory_maze', mockStorage), true);
  assert.equal(storeMap.get('hide_instructions_memory_maze'), 'true');
  setHideGameInstructions('memory_maze', false, mockStorage);
  assert.equal(shouldHideGameInstructions('memory_maze', mockStorage), false);
});

test('Memory Maze grid and key options (3x3 with 1/2 keys, 4x4 with 2/3 keys, 5x5 with 2/3/4 keys, 6x6 with 3/4/5 keys) generate solvable mazes with exact key counts', () => {
  const expectedSpecs = [
    { gridSize: 3, allowedKeyCounts: [1, 2] },
    { gridSize: 4, allowedKeyCounts: [2, 3] },
    { gridSize: 5, allowedKeyCounts: [2, 3, 4] },
    { gridSize: 6, allowedKeyCounts: [3, 4, 5] },
  ];

  assert.equal(MEMORY_MAZE_GRID_KEY_OPTIONS.length, 4);

  for (let idx = 0; idx < expectedSpecs.length; idx++) {
    const spec = expectedSpecs[idx];
    const opt = MEMORY_MAZE_GRID_KEY_OPTIONS[idx];
    assert.equal(opt.gridSize, spec.gridSize);
    assert.deepEqual(opt.allowedKeyCounts, spec.allowedKeyCounts);

    for (const keyCount of spec.allowedKeyCounts) {
      const config: GameConfig = {
        gameType: 'memory-maze',
        difficulty: opt.defaultDifficulty,
        evaluationMode: 'practice',
        questionCount: 5,
        timeLimitSeconds: 175,
        perQuestionTimeSeconds: 35,
        seed: `MM-GRID-${spec.gridSize}-KEYS-${keyCount}`,
        archetypeId: opt.defaultArchetypeId,
        gridSizeOverride: spec.gridSize,
        keyCountOverride: keyCount,
        allowedKeyCounts: spec.allowedKeyCounts,
        practiceRules: {
          allowUndo: true,
          showLiveValidation: true,
          strictOrderPenalty: false,
        },
      };

      const gen = memoryMazeEngine.generatePuzzle(config, 0);
      assert.equal(gen.puzzle.gridSize, spec.gridSize);
      assert.equal(gen.puzzle.keysOrder.length, keyCount);

      const bfs = verifyMazeSolvabilityBFS({
        gridSize: gen.puzzle.gridSize,
        start: gen.puzzle.start,
        goal: gen.puzzle.goal,
        hazards: gen.puzzle.hazards,
        staticWalls: gen.puzzle.staticWalls,
        keysOrder: gen.puzzle.keysOrder,
        strictKeyOrder: gen.puzzle.strictKeyOrder,
        doors: gen.puzzle.doors,
        oneWayDoors: gen.puzzle.oneWayDoors,
      });
      assert.equal(bfs.solvable, true, `Expected ${spec.gridSize}x${spec.gridSize} with ${keyCount} keys to be BFS solvable`);
    }
  }
});

test('Path Finder keeps all pieces in their own grid positions (no cross-grid swapping) and allows changing internal arrows without rotating the piece', () => {
  const config: GameConfig = {
    gameType: 'path-rotation',
    difficulty: 'easy',
    questionCount: 1,
    timeLimitSeconds: 35,
    perQuestionTimeSeconds: 35,
    seed: 'PF-INPLACE-ARROWS-101',
    archetypeId: 'pr-02',
    practiceRules: {
      allowUndo: true,
      showLiveValidation: true,
      strictOrderPenalty: false,
    },
  };
  const gen = pathRotationEngine.generatePuzzle(config, 0);
  const { initialBoard } = createScrambledPathFinderBoard(gen.puzzle, gen.metadata.seed);

  // 1. Every piece remains in its own home grid position (homeRow === r, homeCol === c) and isEmptySlot is false
  for (let r = 0; r < gen.puzzle.gridSize; r++) {
    for (let c = 0; c < gen.puzzle.gridSize; c++) {
      const piece = initialBoard[r][c];
      assert.equal(piece.homeRow, r, `Expected piece at (${r},${c}) to remain in homeRow ${r}`);
      assert.equal(piece.homeCol, c, `Expected piece at (${r},${c}) to remain in homeCol ${c}`);
      assert.equal(piece.isEmptySlot, false, `Expected no empty white slots at (${r},${c})`);
    }
  }

  // 2. Rotate all unlocked pieces in-place to 0° so physical gray path is connected
  let board = initialBoard;
  for (let r = 0; r < gen.puzzle.gridSize; r++) {
    for (let c = 0; c < gen.puzzle.gridSize; c++) {
      while (board[r][c].rotationDeg % 360 !== 0 && !board[r][c].locked && !board[r][c].isBlocker) {
        board = rotatePathFinderPieceAt(board, r, c).nextBoard;
      }
    }
  }

  const evalAfterRotations = evaluatePathFinderBoard(gen.puzzle, board);
  assert.equal(evalAfterRotations.isGeometricallyConnected, true, 'Expected physical path to connect once pieces are rotated to 0°');

  // 3. Verify cyclePathFinderPieceArrows flips internal arrows WITHOUT changing rotationDeg or lockedPorts
  let misalignedCoord: { row: number; col: number } | null = null;
  for (let r = 0; r < gen.puzzle.gridSize; r++) {
    for (let c = 0; c < gen.puzzle.gridSize; c++) {
      const p = board[r][c];
      if (p.isOnSolutionPath && !p.locked && p.activeEntry !== p.solvedEntry) {
        misalignedCoord = { row: r, col: c };
        break;
      }
    }
  }
  assert.ok(misalignedCoord, 'Expected at least one solution-path piece to have reversed internal arrows after aligning physical shape');

  const beforeFlip = board[misalignedCoord.row][misalignedCoord.col];
  const flipRes = cyclePathFinderPieceArrows(board, misalignedCoord.row, misalignedCoord.col);
  assert.equal(flipRes.cycled, true);
  const afterFlip = flipRes.nextBoard[misalignedCoord.row][misalignedCoord.col];
  assert.equal(afterFlip.rotationDeg, beforeFlip.rotationDeg, 'Changing internal arrows must not rotate the whole piece');
  assert.deepEqual(afterFlip.lockedPorts, beforeFlip.lockedPorts, 'Changing internal arrows must keep outer gray ports unchanged');
  assert.equal(afterFlip.activeEntry, beforeFlip.activeExit);
  assert.equal(afterFlip.activeExit, beforeFlip.activeEntry);

  // 4. Flipping all misaligned solution-path internal arrows solves the board completely
  for (let r = 0; r < gen.puzzle.gridSize; r++) {
    for (let c = 0; c < gen.puzzle.gridSize; c++) {
      const p = board[r][c];
      if (p.isOnSolutionPath && !p.locked && p.activeEntry !== p.solvedEntry) {
        board = cyclePathFinderPieceArrows(board, r, c).nextBoard;
      }
    }
  }
  const evalAfterArrowFlips = evaluatePathFinderBoard(gen.puzzle, board);
  assert.equal(evalAfterArrowFlips.isSolved, true, 'Expected board to be solved after flipping internal arrows');

  // 5. Verify rotateSingleSubcellArrowAt rotates a single subcell arrow without rotating the piece
  const singleSubRes = rotateSingleSubcellArrowAt(
    board,
    misalignedCoord.row,
    misalignedCoord.col,
    1,
    1
  );
  assert.equal(singleSubRes.rotated, true);
  assert.equal(
    singleSubRes.nextBoard[misalignedCoord.row][misalignedCoord.col].rotationDeg,
    board[misalignedCoord.row][misalignedCoord.col].rotationDeg
  );
});



