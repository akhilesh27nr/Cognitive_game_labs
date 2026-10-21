import type { CanonicalDifficulty, GameType, PuzzleArchetype } from '../types/domain.ts';
import { mathBubblesEngine, MATH_BUBBLES_ARCHETYPES } from './mathBubblesEngine.ts';
import { memoryMazeEngine, MEMORY_MAZE_ARCHETYPES, verifyMazeSolvabilityBFS } from './memoryMazeEngine.ts';
import {
  pathRotationEngine,
  PATH_ROTATION_ARCHETYPES,
  PATH_ROTATION_SEEDED_FIXTURES,
  getEffectiveConnections,
  traceEnergizedNetwork,
  verifyPathRotationSolution,
} from './pathRotationEngine.ts';

export { mathBubblesEngine, MATH_BUBBLES_ARCHETYPES } from './mathBubblesEngine.ts';
export {
  memoryMazeEngine,
  MEMORY_MAZE_ARCHETYPES,
  MEMORY_MAZE_GRID_KEY_OPTIONS,
  getAllowedKeyCountsForGridSize,
  verifyMazeSolvabilityBFS,
  type MoveDirection,
  type MemoryMazeGridKeyOption,
} from './memoryMazeEngine.ts';
export {
  pathRotationEngine,
  PATH_ROTATION_ARCHETYPES,
  PATH_ROTATION_SEEDED_FIXTURES,
  getEffectiveConnections,
  traceEnergizedNetwork,
  verifyPathRotationSolution,
  createScrambledPathFinderBoard,
  rotatePathFinderPiece90CW,
  rotatePathFinderPieceAt,
  rotateSubgridMatrix90CW,
  rotateArrowVector90CW,
  reversePathFinderPieceArrows,
  rotateSingleSubcellArrowAt,
  hasSubgridMatchingRoute,
  swapPathFinderPieces,
  cyclePathFinderPieceArrows,
  applyPathFinderHint,
  evaluatePathFinderBoard,
  clonePathFinderBoard,
  type CardinalDir,
  type PathFinderPiece,
  type PathFinderSubCell,
  type PathFinderArrowSymbol,
  type PathFinderBoardEvaluation,
} from './pathRotationEngine.ts';
export * from './contracts.ts';
export * from './expressionEvaluator.ts';

export interface SeededTestFixture {
  id: string;
  title: string;
  gameType: GameType;
  difficulty: CanonicalDifficulty;
  seed: string;
  archetypeId: string;
  questionCount: number;
  description: string;
}

export const SEEDED_TEST_FIXTURES: readonly SeededTestFixture[] = [
  {
    id: 'fixture-mb-easy',
    title: 'Math Bubbles · Easy Additive & Multiplicative Baseline',
    gameType: 'math-bubbles',
    difficulty: 'easy',
    seed: 'FIXTURE-MB-EASY-101',
    archetypeId: 'mb-06',
    questionCount: 10,
    description: '3-bubble multiplication followed by addition with 15s timer.',
  },
  {
    id: 'fixture-mb-intermediate',
    title: 'Math Bubbles · Intermediate Fractions & Decimals',
    gameType: 'math-bubbles',
    difficulty: 'intermediate',
    seed: 'FIXTURE-MB-INT-202',
    archetypeId: 'mb-22',
    questionCount: 10,
    description: 'Cross-denominator fraction ordering with deterministic rational comparison.',
  },
  {
    id: 'fixture-mb-expert',
    title: 'Math Bubbles · Expert 4-Bubble Synthesis & Tie-Break',
    gameType: 'math-bubbles',
    difficulty: 'expert',
    seed: 'FIXTURE-MB-EXP-303',
    archetypeId: 'mb-50',
    questionCount: 10,
    description: '4-bubble descending multi-operation synthesis with roots, brackets, and signed offsets.',
  },
  {
    id: 'fixture-mm-easy',
    title: 'Memory Maze · Easy 4×4 Single-Key Discovery',
    gameType: 'memory-maze',
    difficulty: 'easy',
    seed: 'FIXTURE-MM-EASY-101',
    archetypeId: 'mm-05',
    questionCount: 5,
    description: '4×4 hidden-barrier discovery route requiring Key A before exit.',
  },
  {
    id: 'fixture-mm-intermediate',
    title: 'Memory Maze · Intermediate Key & Locked Gate Dependency',
    gameType: 'memory-maze',
    difficulty: 'intermediate',
    seed: 'FIXTURE-MM-INT-202',
    archetypeId: 'mm-18',
    questionCount: 5,
    description: '5×5 grid with Key A, Gate A, Key B, and concealed barriers.',
  },
  {
    id: 'fixture-mm-expert',
    title: 'Memory Maze · Expert 6×6 Multi-Key & One-Way Turnstile',
    gameType: 'memory-maze',
    difficulty: 'expert',
    seed: 'FIXTURE-MM-EXP-303',
    archetypeId: 'mm-50',
    questionCount: 5,
    description: '6×6 synthesis with 3 sequential keys, locked gate, one-way door, and move budget.',
  },
  {
    id: 'fixture-pr-easy',
    title: 'Path Rotation · Easy 3×3 Single-Elbow Conduit',
    gameType: 'path-rotation',
    difficulty: 'easy',
    seed: 'FIXTURE-PR-EASY-101',
    archetypeId: 'pr-02',
    questionCount: 5,
    description: '3×3 foundational conduit with a single 90° elbow turn.',
  },
  {
    id: 'fixture-pr-intermediate',
    title: 'Path Rotation · Intermediate 4×4 One-Way Arrows',
    gameType: 'path-rotation',
    difficulty: 'intermediate',
    seed: 'FIXTURE-PR-MED-202',
    archetypeId: 'pr-25',
    questionCount: 5,
    description: '4×4 circuit with directional one-way flow arrows and Relay Checkpoint.',
  },
  {
    id: 'fixture-pr-expert',
    title: 'Path Rotation · Expert 6×6 Master Topological Synthesis',
    gameType: 'path-rotation',
    difficulty: 'expert',
    seed: 'FIXTURE-PR-EDGE-404',
    archetypeId: 'pr-50',
    questionCount: 5,
    description: '6×6 master synthesis with ordered checkpoints, 180°-toggle conduits, and directional arrows.',
  },
];

export const GAME_CATALOG: ReadonlyArray<{
  gameType: GameType;
  slug: string;
  route: string;
  title: string;
  cognitiveDomain: string;
  shortDescription: string;
  rulesSummary: string[];
  keyboardControls: string;
  archetypeCount: number;
  defaultQuestions: number;
  defaultPerQuestionSeconds: number;
}> = [
  {
    gameType: 'math-bubbles',
    slug: 'math-bubbles',
    route: '/games/math-bubbles',
    title: 'Math Bubble Arena',
    cognitiveDomain: 'Numerical Reasoning & Mental Arithmetic',
    shortDescription:
      'Evaluate 3 or 4 floating arithmetic bubbles and select them in strict numerical order under a 15-second default timer.',
    rulesSummary: [
      '50 documented mathematical archetypes covering integers, brackets, negatives, decimals, fractions, percentages, powers, roots, and missing operands.',
      'Supports 5 difficulty tiers (Beginner to Expert), configurable session lengths (10, 25, 50, custom), Practice Mode, and Exam Mode.',
      'Exact rational/scaled-integer evaluation with explicit left-to-right tie-breaking when identical values are enabled.',
    ],
    keyboardControls: 'Keys 1–4 select bubbles · Backspace Undo · Esc Pause (Practice)',
    archetypeCount: MATH_BUBBLES_ARCHETYPES.length,
    defaultQuestions: 10,
    defaultPerQuestionSeconds: 15,
  },
  {
    gameType: 'memory-maze',
    slug: 'memory-maze',
    route: '/games/memory-maze',
    title: 'Memory Maze',
    cognitiveDomain: 'Visuospatial Working Memory & Route Discovery',
    shortDescription:
      'Navigate from Start to Exit, collect required keys, and map concealed barriers that reveal themselves upon contact.',
    rulesSummary: [
      '50 procedural maze archetypes validated with multi-state BFS pathfinding for guaranteed solvability.',
      'Supports hidden static barriers, directional one-way doors, sequential keys (A, B, C), locked gates, movement budgets, and return-to-start discovery.',
      'Includes both Hidden-Barrier Discovery Mode and optional Flash-Pattern Recall Mode.',
    ],
    keyboardControls: 'WASD or Arrow Keys Move · R Reset Position · H Hint (Practice)',
    archetypeCount: MEMORY_MAZE_ARCHETYPES.length,
    defaultQuestions: 10,
    defaultPerQuestionSeconds: 35,
  },
  {
    gameType: 'path-rotation',
    slug: 'path-rotation',
    route: '/games/path-rotation',
    title: 'Path Rotation',
    cognitiveDomain: 'Topological Reasoning & Mental Rotation',
    shortDescription:
      'Rotate and flip conduit tiles to establish a valid directional route from Source (IN) to Sink (OUT) through all Checkpoints.',
    rulesSummary: [
      '50 topological archetypes across 3×3 to 6×6 grids with straight, elbow, T-junction, cross, blocked, and locked anchor tiles.',
      'Supports restricted 180°-toggle tiles, directional one-way flow arrows, and ordered multi-checkpoint sequences.',
      'Practice Mode includes Undo, Hint, and Board Reset; Exam Mode enforces strict timed evaluation.',
    ],
    keyboardControls: 'Click / Space Rotate · Shift+Click / Key F Flip · Z Undo · H Hint (Practice)',
    archetypeCount: PATH_ROTATION_ARCHETYPES.length,
    defaultQuestions: 10,
    defaultPerQuestionSeconds: 35,
  },
];

export function getArchetypesForGame(gameType: GameType): readonly PuzzleArchetype[] {
  switch (gameType) {
    case 'math-bubbles':
      return MATH_BUBBLES_ARCHETYPES;
    case 'memory-maze':
      return MEMORY_MAZE_ARCHETYPES;
    case 'path-rotation':
      return PATH_ROTATION_ARCHETYPES;
  }
}

export const ALL_ARCHETYPES: readonly PuzzleArchetype[] = [
  ...MATH_BUBBLES_ARCHETYPES,
  ...MEMORY_MAZE_ARCHETYPES,
  ...PATH_ROTATION_ARCHETYPES,
];

export function getAllArchetypes(): readonly PuzzleArchetype[] {
  return ALL_ARCHETYPES;
}


