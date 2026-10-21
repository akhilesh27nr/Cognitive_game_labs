import {
  type CanonicalDifficulty,
  type CognitiveErrorCategory,
  type EvaluationMode,
  type GameConfig,
  type PuzzleArchetype,
  type PuzzleMetadata,
  type QuestionResult,
} from '../types/domain.ts';
import { SeededRandom } from '../utils/prng.ts';
import {
  computeQuestionScore,
  determineTimeoutStatus,
  resolveEffectiveDifficulty,
  type GameEngine,
  type ValidationOutcome,
} from './contracts.ts';

export interface GridCoord {
  row: number;
  col: number;
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

export interface OneWayDoor {
  coord: GridCoord;
  allowedDirection: MoveDirection;
  label: string;
}

export interface MemoryMazePuzzle {
  gridSize: number;
  challengeMode: 'hidden-barrier-discovery' | 'flash-pattern-recall';
  evaluationMode: EvaluationMode;
  memorizeDurationMs: number;
  start: GridCoord;
  goal: GridCoord;
  decoyExit?: GridCoord;
  hazards: GridCoord[]; // Hidden barriers that reveal upon attempted entry
  staticWalls: GridCoord[]; // Always-visible structural corridor walls
  keysOrder: Array<{ id: string; label: string; coord: GridCoord }>;
  strictKeyOrder: boolean;
  doors: Array<{ id: string; requiresKeyId: string; coord: GridCoord }>;
  oneWayDoors: OneWayDoor[];
  penaltyRule: 'hold-position' | 'return-to-start';
  optimalPath: GridCoord[];
  optimalMoveCount: number;
  moveBudget: number | null;
  maxFailedMoves: number | null;
}

export interface MemoryMazeState {
  phase: 'memorize' | 'navigate' | 'complete';
  player: GridCoord;
  visitedPath: GridCoord[];
  collectedKeyIds: string[];
  hitHazards: GridCoord[]; // Discovered hidden barriers (persisted across retries)
  mistakesCount: number;
  movesCount: number;
  hintRevealed: boolean;
  errorCategoriesTriggered: CognitiveErrorCategory[];
  lastFeedback: string;
}

export type MemoryMazeAction =
  | { type: 'begin-navigation' }
  | { type: 'move'; direction: MoveDirection }
  | { type: 'step-to'; row: number; col: number }
  | { type: 'reset-position' }
  | { type: 'reveal-hint' };

export interface MemoryMazeGridKeyOption {
  id: string;
  gridSize: 3 | 4 | 5 | 6;
  allowedKeyCounts: readonly number[];
  label: string;
  shortLabel: string;
  keysLabel: string;
  defaultDifficulty: CanonicalDifficulty;
  defaultArchetypeId: string;
}

export const MEMORY_MAZE_GRID_KEY_OPTIONS: readonly MemoryMazeGridKeyOption[] = [
  {
    id: 'mm-opt-3x3',
    gridSize: 3,
    allowedKeyCounts: [1, 2],
    label: '3×3 (1/2 Keys)',
    shortLabel: '3×3',
    keysLabel: '1/2 Keys',
    defaultDifficulty: 'beginner',
    defaultArchetypeId: 'mm-01',
  },
  {
    id: 'mm-opt-4x4',
    gridSize: 4,
    allowedKeyCounts: [2, 3],
    label: '4×4 (2/3 Keys)',
    shortLabel: '4×4',
    keysLabel: '2/3 Keys',
    defaultDifficulty: 'easy',
    defaultArchetypeId: 'mm-05',
  },
  {
    id: 'mm-opt-5x5',
    gridSize: 5,
    allowedKeyCounts: [2, 3, 4],
    label: '5×5 (2/3/4 Keys)',
    shortLabel: '5×5',
    keysLabel: '2/3/4 Keys',
    defaultDifficulty: 'intermediate',
    defaultArchetypeId: 'mm-07',
  },
  {
    id: 'mm-opt-6x6',
    gridSize: 6,
    allowedKeyCounts: [3, 4, 5],
    label: '6×6 (3/4/5 Keys)',
    shortLabel: '6×6',
    keysLabel: '3/4/5 Keys',
    defaultDifficulty: 'advanced',
    defaultArchetypeId: 'mm-20',
  },
];

export function getAllowedKeyCountsForGridSize(gridSize: number): readonly number[] {
  switch (gridSize) {
    case 3:
      return [1, 2];
    case 4:
      return [2, 3];
    case 5:
      return [2, 3, 4];
    case 6:
    default:
      return [3, 4, 5];
  }
}

interface MazeArchetypeDef {
  code: string;
  title: string;
  category: string;
  description: string;
  recommendedDifficulty: CanonicalDifficulty;
  gridSize: number;
  keyCount: 0 | 1 | 2 | 3 | 4 | 5;
  strictKeyOrder: boolean;
  hasDoor: boolean;
  hasOneWay: boolean;
  penaltyRule: 'hold-position' | 'return-to-start';
  limitedMoves: boolean;
  limitedFailedMoves: boolean;
  hasDecoyExit?: boolean;
  randomTerminals?: boolean;
  obstacleDensity: 'sparse' | 'medium' | 'dense';
}

export const MAZE_ARCHETYPE_REGISTRY: readonly MazeArchetypeDef[] = [
  { code: 'MM-01', title: 'Small Open Grids', category: 'Foundational Discovery', description: '4×4 open grid with hidden static barriers discovered upon contact.', recommendedDifficulty: 'beginner', gridSize: 4, keyCount: 0, strictKeyOrder: false, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'sparse' },
  { code: 'MM-02', title: 'Narrow Corridors', category: 'Corridor Topology', description: 'Tight single-tile passageways framed by hidden and visible walls.', recommendedDifficulty: 'beginner', gridSize: 4, keyCount: 0, strictKeyOrder: false, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-03', title: 'Dead Ends', category: 'Branch Exploration', description: 'Navigate past dead-end alcoves while remembering discovered barriers.', recommendedDifficulty: 'beginner', gridSize: 4, keyCount: 0, strictKeyOrder: false, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-04', title: 'Multiple Junctions', category: 'Branch Exploration', description: '4-way intersection hub requiring systematic barrier probing.', recommendedDifficulty: 'easy', gridSize: 4, keyCount: 0, strictKeyOrder: false, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-05', title: 'Single-Key Routes', category: 'Key & Objective', description: 'Retrieve Key A before entering the exit portal.', recommendedDifficulty: 'easy', gridSize: 4, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-06', title: 'Two-Key Routes', category: 'Key & Objective', description: 'Collect two keys across the maze before reaching the exit.', recommendedDifficulty: 'easy', gridSize: 5, keyCount: 2, strictKeyOrder: false, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-07', title: 'Three-Key Challenge Routes', category: 'Multi-Key Mastery', description: 'Locate and collect Key A, Key B, and Key C across a 5×5 arena.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 3, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-08', title: 'Locked Exits', category: 'Gate Dependencies', description: 'Exit is guarded by a locked gate requiring Key A.', recommendedDifficulty: 'easy', gridSize: 4, keyCount: 1, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-09', title: 'Hidden Static Barriers', category: 'Barrier Discovery', description: 'All interior barriers begin concealed and remain visible once struck.', recommendedDifficulty: 'easy', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-10', title: 'Directional Barriers', category: 'Directional Logic', description: 'Includes directional barrier gates allowing passage only along the arrow vector.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: true, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-11', title: 'One-Way Doors', category: 'Directional Logic', description: 'Pass through one-way turnstiles that prevent backtracking.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: true, hasOneWay: true, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-12', title: 'Limited-Move Mazes', category: 'Efficiency Budget', description: 'Complete the route within a strict movement budget.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: true, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-13', title: 'Shortest-Path Challenges', category: 'Efficiency Budget', description: 'Tight optimal-path move limit requiring minimal detour waste.', recommendedDifficulty: 'advanced', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: true, limitedFailedMoves: false, obstacleDensity: 'sparse' },
  { code: 'MM-14', title: 'Detour-Heavy Mazes', category: 'Non-Linear Routing', description: 'Direct diagonal is blocked; route winds around perimeter detours.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-15', title: 'Multiple Possible Routes', category: 'Open Topology', description: 'Two valid corridors lead to the goal; discover the unblocked branch.', recommendedDifficulty: 'easy', gridSize: 5, keyCount: 1, strictKeyOrder: false, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'sparse' },
  { code: 'MM-16', title: 'Misleading Dead-End Branches', category: 'Trap Avoidance', description: 'Tempting direct corridors terminate in concealed barrier pockets.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-17', title: 'Sequentially Collected Keys', category: 'Ordered Waypoints', description: 'Keys A, B, and C must be collected in strict alphabetical order.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 3, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-18', title: 'Key-and-Door Dependency Puzzles', category: 'Gate Dependencies', description: 'Retrieve Key A to unlock Gate A and access Key B and the exit.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-19', title: 'Return-to-Start Discovery Rounds', category: 'Reset Discovery', description: 'Striking a hidden barrier reveals it permanently and returns you to Start.', recommendedDifficulty: 'advanced', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'return-to-start', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-20', title: 'Progressive Grid Sizes', category: 'Scale Adaptation', description: 'Expanded 6×6 matrix requiring broader spatial mental mapping.', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-21', title: 'Dense Obstacle Layouts', category: 'High-Density Grid', description: 'High ratio of concealed barriers on a 6×6 grid.', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-22', title: 'Sparse Obstacle Layouts', category: 'Efficiency Budget', description: 'Open arena with strategic choke-point barriers and a move budget.', recommendedDifficulty: 'easy', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: true, limitedFailedMoves: false, obstacleDensity: 'sparse' },
  { code: 'MM-23', title: 'Symmetric Mazes', category: 'Pattern Chunking', description: 'Mirrored obstacle placement enabling geometric deduction.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 2, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-24', title: 'Asymmetric Mazes', category: 'Irregular Topology', description: 'Irregular barrier clusters resisting simple symmetry heuristics.', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-25', title: 'Multiple Connected Regions Joined by Gates', category: 'Gate Dependencies', description: 'Sector-divided grid bridged by locked gates and one-way doors.', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: true, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-26', title: 'Timed Navigation Sprint', category: 'Speed Navigation', description: 'Rapid 4×4 key-and-exit extraction under tight timer pressure.', recommendedDifficulty: 'intermediate', gridSize: 4, keyCount: 1, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-27', title: 'Memory Across Retries', category: 'Reset Discovery', description: 'Return-to-start penalty where every revealed barrier stays mapped on the board.', recommendedDifficulty: 'advanced', gridSize: 5, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'return-to-start', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-28', title: 'Two-Exit Choice Puzzles', category: 'Exit Verification', description: 'Distinguish the true unlocked Goal from a decoy blocked exit.', recommendedDifficulty: 'advanced', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, hasDecoyExit: true, obstacleDensity: 'medium' },
  { code: 'MM-29', title: 'Multi-Stage Routes', category: 'Ordered Waypoints', description: 'Three-stage traversal: Key A → Gate A → Key B → Goal.', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-30', title: 'Collect-All-Objectives Mazes', category: 'Multi-Key Mastery', description: 'Collect all three keys in any order before reaching extraction.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 3, strictKeyOrder: false, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-31', title: 'Key Placement Near Dead Ends', category: 'Branch Exploration', description: 'Keys are tucked into side pockets surrounded by concealed walls.', recommendedDifficulty: 'advanced', gridSize: 5, keyCount: 2, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-32', title: 'Key Placement Behind a Detour', category: 'Non-Linear Routing', description: 'Divert away from the exit to secure Key A before approaching the gate.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-33', title: 'Short Route with More Hidden Barriers', category: 'High-Density Grid', description: 'Compact 4×4 board packed with concealed mines around a short path.', recommendedDifficulty: 'intermediate', gridSize: 4, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-34', title: 'Long Route with Fewer Barriers', category: 'Corridor Topology', description: 'Extended winding path across a 6×6 grid with strategic barrier walls.', recommendedDifficulty: 'intermediate', gridSize: 6, keyCount: 2, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'sparse' },
  { code: 'MM-35', title: 'Narrow Passage Constraints', category: 'Corridor Topology', description: 'Single-cell bottlenecks between concealed barrier lines.', recommendedDifficulty: 'advanced', gridSize: 5, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-36', title: 'Branching Paths with Misleading Choices', category: 'Trap Avoidance', description: 'Multiple forks where only one path avoids locked or blocked terminals.', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-37', title: 'Grids with Forced Turns', category: 'Directional Logic', description: 'Staircase and one-way turnstiles enforcing frequent orthogonal turns.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: true, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-38', title: 'Grids with Loops', category: 'Open Topology', description: 'Ring corridors allowing clockwise or counter-clockwise traversal around a core.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 2, strictKeyOrder: false, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'sparse' },
  { code: 'MM-39', title: 'Randomized Start Positions', category: 'Orientation Shift', description: 'Player spawns at a non-corner seeded coordinate.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, randomTerminals: true, obstacleDensity: 'medium' },
  { code: 'MM-40', title: 'Randomized Exit Positions', category: 'Orientation Shift', description: 'Extraction portal spawns at an interior or opposite edge coordinate.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 1, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, randomTerminals: true, obstacleDensity: 'medium' },
  { code: 'MM-41', title: 'Multiple Hidden Barriers per Row', category: 'High-Density Grid', description: 'Every row contains multiple concealed barriers with narrow vertical breaches.', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-42', title: 'Multiple Hidden Barriers per Column', category: 'High-Density Grid', description: 'Every column contains multiple concealed barriers requiring lateral weaves.', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 1, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-43', title: 'Obstacle Density Variations', category: 'Scale Adaptation', description: 'Mixed high-density and open-pocket sectors on a 6×6 matrix.', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-44', title: 'Key-Order Dependencies', category: 'Ordered Waypoints', description: 'Three keys with strict sequential dependency (Key A → Key B → Key C).', recommendedDifficulty: 'advanced', gridSize: 6, keyCount: 3, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-45', title: 'Limited Failed-Move Challenges', category: 'Precision Discovery', description: 'Strict cap on allowed hidden-barrier strikes before penalties escalate.', recommendedDifficulty: 'advanced', gridSize: 5, keyCount: 2, strictKeyOrder: true, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: true, obstacleDensity: 'medium' },
  { code: 'MM-46', title: 'Progressive Memory Challenges', category: 'Reset Discovery', description: '6×6 return-to-start maze where cumulative barrier memory unlocks the route.', recommendedDifficulty: 'expert', gridSize: 6, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'return-to-start', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-47', title: 'Maze Variants with a Known Optimal Route', category: 'Efficiency Budget', description: 'Validated unique shortest path with tight move-efficiency target.', recommendedDifficulty: 'advanced', gridSize: 5, keyCount: 2, strictKeyOrder: true, hasDoor: true, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: true, limitedFailedMoves: false, obstacleDensity: 'medium' },
  { code: 'MM-48', title: 'Maze Variants with Multiple Valid Solutions', category: 'Open Topology', description: 'Braided maze topology offering multiple valid key-collection sequences.', recommendedDifficulty: 'intermediate', gridSize: 5, keyCount: 2, strictKeyOrder: false, hasDoor: false, hasOneWay: false, penaltyRule: 'hold-position', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'sparse' },
  { code: 'MM-49', title: 'Multi-Level Cumulative Discovery', category: 'Reset Discovery', description: 'Three keys + locked gate + return-to-start discovery mechanics.', recommendedDifficulty: 'expert', gridSize: 6, keyCount: 3, strictKeyOrder: true, hasDoor: true, hasOneWay: true, penaltyRule: 'return-to-start', limitedMoves: false, limitedFailedMoves: false, obstacleDensity: 'dense' },
  { code: 'MM-50', title: 'Expert Combination Puzzles', category: 'Executive Synthesis', description: '6×6 synthesis with 3 ordered keys, locked gate, one-way door, move budget, and dense hidden barriers.', recommendedDifficulty: 'expert', gridSize: 6, keyCount: 3, strictKeyOrder: true, hasDoor: true, hasOneWay: true, penaltyRule: 'hold-position', limitedMoves: true, limitedFailedMoves: true, obstacleDensity: 'dense' },
];

export const MEMORY_MAZE_ARCHETYPES: readonly PuzzleArchetype[] = MAZE_ARCHETYPE_REGISTRY.map((def, idx) => ({
  id: def.code.toLowerCase(),
  gameType: 'memory-maze',
  index: idx + 1,
  code: def.code,
  title: def.title,
  category: def.category,
  description: def.description,
  recommendedDifficulty: def.recommendedDifficulty,
  hasAutomatedTestCoverage: true,
}));

function coordKey(c: GridCoord): string {
  return `${c.row},${c.col}`;
}

export function sameCoord(a: GridCoord, b: GridCoord): boolean {
  return a.row === b.row && a.col === b.col;
}

function directionBetween(from: GridCoord, to: GridCoord): MoveDirection | null {
  if (to.row === from.row - 1 && to.col === from.col) return 'up';
  if (to.row === from.row + 1 && to.col === from.col) return 'down';
  if (to.row === from.row && to.col === from.col - 1) return 'left';
  if (to.row === from.row && to.col === from.col + 1) return 'right';
  return null;
}

/**
 * Graph-based multi-state BFS pathfinder & solvability validator.
 * State = (row, col, collectedKeyBitmask).
 * Guarantees that every required key and the exit are reachable while respecting:
 * - hidden hazards
 * - static walls
 * - locked doors (require key-a)
 * - one-way doors (only allow entry in allowedDirection)
 * - strict or non-strict key order
 */
export function verifyMazeSolvabilityBFS(params: {
  gridSize: number;
  start: GridCoord;
  goal: GridCoord;
  hazards: readonly GridCoord[];
  staticWalls: readonly GridCoord[];
  keysOrder: ReadonlyArray<{ id: string; label: string; coord: GridCoord }>;
  strictKeyOrder: boolean;
  doors: ReadonlyArray<{ id: string; requiresKeyId: string; coord: GridCoord }>;
  oneWayDoors: readonly OneWayDoor[];
}): { solvable: boolean; optimalPath: GridCoord[] } {
  const {
    gridSize,
    start,
    goal,
    hazards,
    staticWalls,
    keysOrder,
    strictKeyOrder,
    doors,
    oneWayDoors,
  } = params;

  const blockedSet = new Set<string>([
    ...hazards.map(coordKey),
    ...staticWalls.map(coordKey),
  ]);

  if (blockedSet.has(coordKey(start)) || blockedSet.has(coordKey(goal))) {
    return { solvable: false, optimalPath: [] };
  }

  const totalKeys = keysOrder.length;
  const fullMask = (1 << totalKeys) - 1;

  interface QueueNode {
    coord: GridCoord;
    mask: number;
    path: GridCoord[];
  }

  let initialMask = 0;
  keysOrder.forEach((k, idx) => {
    if (sameCoord(k.coord, start) && (!strictKeyOrder || idx === 0)) {
      initialMask |= 1 << idx;
    }
  });

  const visited = new Set<string>([`${start.row},${start.col},${initialMask}`]);
  const queue: QueueNode[] = [{ coord: start, mask: initialMask, path: [start] }];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (sameCoord(curr.coord, goal) && curr.mask === fullMask) {
      return { solvable: true, optimalPath: curr.path };
    }

    const neighbors: GridCoord[] = [
      { row: curr.coord.row - 1, col: curr.coord.col },
      { row: curr.coord.row + 1, col: curr.coord.col },
      { row: curr.coord.row, col: curr.coord.col - 1 },
      { row: curr.coord.row, col: curr.coord.col + 1 },
    ];

    for (const next of neighbors) {
      if (next.row < 0 || next.row >= gridSize || next.col < 0 || next.col >= gridSize) continue;
      const nKey = coordKey(next);
      if (blockedSet.has(nKey)) continue;

      // Check one-way door constraint
      const moveDir = directionBetween(curr.coord, next);
      const oneWay = oneWayDoors.find((d) => sameCoord(d.coord, next));
      if (oneWay && moveDir !== oneWay.allowedDirection) {
        continue;
      }

      // Check locked gate constraint
      const doorAtNext = doors.find((d) => sameCoord(d.coord, next));
      if (doorAtNext) {
        const reqIdx = keysOrder.findIndex((k) => k.id === doorAtNext.requiresKeyId);
        if (reqIdx !== -1 && (curr.mask & (1 << reqIdx)) === 0) {
          continue;
        }
      }

      // Check key pickup at next
      let nextMask = curr.mask;
      const keyIdx = keysOrder.findIndex((k) => sameCoord(k.coord, next));
      if (keyIdx !== -1 && (nextMask & (1 << keyIdx)) === 0) {
        if (strictKeyOrder) {
          const requiredPriorMask = (1 << keyIdx) - 1;
          if ((nextMask & requiredPriorMask) !== requiredPriorMask) {
            continue;
          }
          nextMask |= 1 << keyIdx;
        } else {
          nextMask |= 1 << keyIdx;
        }
      }

      const stateKey = `${next.row},${next.col},${nextMask}`;
      if (!visited.has(stateKey)) {
        visited.add(stateKey);
        queue.push({
          coord: next,
          mask: nextMask,
          path: [...curr.path, next],
        });
      }
    }
  }

  return { solvable: false, optimalPath: [] };
}

function buildGuaranteedSimpleWalk(
  gridSize: number,
  start: GridCoord,
  goal: GridCoord,
  rng: SeededRandom,
  archetypeCode?: string
): GridCoord[] {
  // Archetype-specific structural path topologies
  if (archetypeCode === 'MM-14' || archetypeCode === 'MM-34') {
    // Perimeter detour route: top edge then right edge
    const perimeter: GridCoord[] = [{ ...start }];
    let r = start.row;
    let c = start.col;
    while (c < goal.col) {
      c += 1;
      perimeter.push({ row: r, col: c });
    }
    while (r < goal.row) {
      r += 1;
      perimeter.push({ row: r, col: c });
    }
    return perimeter;
  }

  if (archetypeCode === 'MM-37' || archetypeCode === 'MM-23') {
    // Forced staircase turns / symmetric diagonal staircase
    const stairs: GridCoord[] = [{ ...start }];
    let r = start.row;
    let c = start.col;
    while (r < goal.row || c < goal.col) {
      if (c < goal.col && (r === goal.row || c <= r)) {
        c += 1;
      } else if (r < goal.row) {
        r += 1;
      } else {
        c += 1;
      }
      stairs.push({ row: r, col: c });
    }
    return stairs;
  }

  const path: GridCoord[] = [{ ...start }];
  const visited = new Set<string>([coordKey(start)]);
  let curr = { ...start };

  for (let step = 0; step < gridSize * gridSize * 2; step++) {
    if (sameCoord(curr, goal)) break;
    const neighbors = [
      { row: curr.row + 1, col: curr.col },
      { row: curr.row - 1, col: curr.col },
      { row: curr.row, col: curr.col + 1 },
      { row: curr.row, col: curr.col - 1 },
    ].filter(
      (n) =>
        n.row >= 0 &&
        n.row < gridSize &&
        n.col >= 0 &&
        n.col < gridSize &&
        !visited.has(coordKey(n))
    );

    if (neighbors.length === 0) break;

    const scored = neighbors.map((d) => ({
      coord: d,
      dist: Math.abs(goal.row - d.row) + Math.abs(goal.col - d.col) + (rng.nextBool(0.45) ? 0 : 2),
    }));
    scored.sort((a, b) => a.dist - b.dist);
    curr = scored[0].coord;
    path.push(curr);
    visited.add(coordKey(curr));
  }

  while (!sameCoord(curr, goal)) {
    const nextRow =
      curr.row < goal.row ? curr.row + 1 : curr.row > goal.row ? curr.row - 1 : curr.row;
    const nextCol =
      nextRow === curr.row
        ? curr.col < goal.col
          ? curr.col + 1
          : curr.col - 1
        : curr.col;
    curr = { row: nextRow, col: nextCol };
    if (!path.some((p) => sameCoord(p, curr))) {
      path.push(curr);
    }
  }

  return path;
}

export const memoryMazeEngine: GameEngine<MemoryMazePuzzle, MemoryMazeState, MemoryMazeAction> = {
  gameType: 'memory-maze',
  title: 'Memory Maze',
  shortDescription:
    'Navigate from Start to Exit, collect required keys, and discover hidden barriers with persistent spatial memory.',
  archetypes: MEMORY_MAZE_ARCHETYPES,

  generatePuzzle(config: GameConfig, questionIndex: number) {
    const effectiveDifficulty = resolveEffectiveDifficulty(config.difficulty, questionIndex);
    const rng = new SeededRandom(`${config.seed}::memory-maze::q${questionIndex}`);

    let archetype = MEMORY_MAZE_ARCHETYPES[questionIndex % MEMORY_MAZE_ARCHETYPES.length];
    if (config.archetypeId) {
      const found = MEMORY_MAZE_ARCHETYPES.find(
        (a) =>
          a.id === config.archetypeId?.toLowerCase() ||
          a.code.toLowerCase() === config.archetypeId?.toLowerCase()
      );
      if (found) archetype = found;
    } else {
      const difficultyRank: Record<CanonicalDifficulty, number> = {
        beginner: 1,
        easy: 2,
        intermediate: 3,
        advanced: 4,
        expert: 5,
        adaptive: 3,
      };
      const targetRank = difficultyRank[effectiveDifficulty];
      const pool = MEMORY_MAZE_ARCHETYPES.filter(
        (a) => Math.abs(difficultyRank[a.recommendedDifficulty] - targetRank) <= 1
      );
      archetype = rng.pick(pool.length > 0 ? pool : MEMORY_MAZE_ARCHETYPES);
    }

    const def = MAZE_ARCHETYPE_REGISTRY[archetype.index - 1] ?? MAZE_ARCHETYPE_REGISTRY[0];
    let gridSize: number;
    if (config.gridSizeOverride && [3, 4, 5, 6].includes(config.gridSizeOverride)) {
      gridSize = config.gridSizeOverride;
    } else if (config.archetypeId) {
      gridSize =
        def.code === 'MM-01' || def.code === 'MM-02' || def.code === 'MM-03'
          ? 3
          : def.gridSize;
    } else {
      gridSize =
        effectiveDifficulty === 'beginner'
          ? 3
          : effectiveDifficulty === 'easy'
          ? 4
          : effectiveDifficulty === 'intermediate'
          ? 5
          : 6;
    }

    const allowedForGrid =
      config.allowedKeyCounts && config.allowedKeyCounts.length > 0
        ? config.allowedKeyCounts
        : getAllowedKeyCountsForGridSize(gridSize);

    let targetKeyCount: number;
    if (
      typeof config.keyCountOverride === 'number' &&
      config.keyCountOverride >= 1 &&
      config.keyCountOverride <= 5
    ) {
      targetKeyCount = config.keyCountOverride;
    } else if (
      config.gridSizeOverride ||
      (config.allowedKeyCounts && config.allowedKeyCounts.length > 0)
    ) {
      targetKeyCount = allowedForGrid[questionIndex % allowedForGrid.length];
    } else if (allowedForGrid.includes(def.keyCount)) {
      targetKeyCount = def.keyCount;
    } else {
      targetKeyCount = allowedForGrid[questionIndex % allowedForGrid.length];
    }

    const start: GridCoord =
      def.randomTerminals && gridSize >= 5
        ? { row: 0, col: rng.nextInt(0, 1) }
        : { row: 0, col: 0 };
    const goal: GridCoord =
      def.randomTerminals && gridSize >= 5
        ? { row: gridSize - 1, col: Math.max(gridSize - 2, gridSize - 1 - rng.nextInt(0, 1)) }
        : { row: gridSize - 1, col: gridSize - 1 };

    let backbonePath = buildGuaranteedSimpleWalk(gridSize, start, goal, rng, def.code);
    const minRequiredInterior = targetKeyCount + (def.hasDoor ? 1 : 0);
    if (backbonePath.length - 2 < minRequiredInterior) {
      // Fallback perimeter walk from (0,0) to (gridSize-1, gridSize-1) which has 2*gridSize - 1 vertices
      const fallbackWalk: GridCoord[] = [];
      for (let c = 0; c < gridSize; c++) {
        fallbackWalk.push({ row: 0, col: c });
      }
      for (let r = 1; r < gridSize; r++) {
        fallbackWalk.push({ row: r, col: gridSize - 1 });
      }
      backbonePath = fallbackWalk;
    }
    const protectedCoords = new Set<string>(backbonePath.map(coordKey));

    // Place keys (Key A .. Key E) and optional door-a along backbonePath in strict increasing order
    const KEY_CATALOG = [
      { id: 'key-a', label: 'Key A' },
      { id: 'key-b', label: 'Key B' },
      { id: 'key-c', label: 'Key C' },
      { id: 'key-d', label: 'Key D' },
      { id: 'key-e', label: 'Key E' },
    ] as const;

    const keysOrder: Array<{ id: string; label: string; coord: GridCoord }> = [];
    const doors: Array<{ id: string; requiresKeyId: string; coord: GridCoord }> = [];
    const oneWayDoors: OneWayDoor[] = [];

    const availableInterior: number[] = [];
    for (let idx = 1; idx <= backbonePath.length - 2; idx++) {
      availableInterior.push(idx);
    }

    const clampedKeyCount = Math.max(
      1,
      Math.min(KEY_CATALOG.length, Math.min(targetKeyCount, availableInterior.length))
    );
    const includeDoor = Boolean(
      def.hasDoor && availableInterior.length >= clampedKeyCount + 1
    );
    const totalSlots = clampedKeyCount + (includeDoor ? 1 : 0);

    const chosenIndices: number[] = [];
    let prevPos = -1;
    for (let i = 0; i < totalSlots; i++) {
      const remainingNeeded = totalSlots - i;
      const maxPos = availableInterior.length - remainingNeeded;
      const idealPos = Math.floor(((i + 1) * availableInterior.length) / (totalSlots + 1));
      const pos = Math.max(prevPos + 1, Math.min(maxPos, idealPos));
      chosenIndices.push(availableInterior[pos]);
      prevPos = pos;
    }

    if (includeDoor) {
      // Slot 0 = Key A, Slot 1 = Door A (requires Key A), Slots 2..N = Key B..Key E
      keysOrder.push({
        ...KEY_CATALOG[0],
        coord: backbonePath[chosenIndices[0]],
      });
      doors.push({
        id: 'door-a',
        requiresKeyId: 'key-a',
        coord: backbonePath[chosenIndices[1]],
      });
      for (let k = 1; k < clampedKeyCount; k++) {
        keysOrder.push({
          ...KEY_CATALOG[k],
          coord: backbonePath[chosenIndices[k + 1]],
        });
      }
    } else {
      for (let k = 0; k < clampedKeyCount; k++) {
        keysOrder.push({
          ...KEY_CATALOG[k],
          coord: backbonePath[chosenIndices[k]],
        });
      }
    }

    // Optional one-way door aligned with the backbone movement direction
    if (def.hasOneWay && backbonePath.length >= 5) {
      for (let i = 1; i < backbonePath.length - 1; i++) {
        const prev = backbonePath[i - 1];
        const curr = backbonePath[i];
        const occupied =
          keysOrder.some((k) => sameCoord(k.coord, curr)) ||
          doors.some((d) => sameCoord(d.coord, curr));
        const dir = directionBetween(prev, curr);
        if (!occupied && dir) {
          oneWayDoors.push({
            coord: curr,
            allowedDirection: dir,
            label: dir.toUpperCase(),
          });
          break;
        }
      }
    }

    // Candidate cells off the backbone path for hidden hazards and static walls
    const offPathCells: GridCoord[] = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (!protectedCoords.has(coordKey({ row: r, col: c }))) {
          offPathCells.push({ row: r, col: c });
        }
      }
    }

    let orderedOffPath = rng.shuffle(offPathCells);
    if (def.code === 'MM-23') {
      // Symmetric obstacle prioritization around main diagonal
      orderedOffPath = [...offPathCells].sort(
        (a, b) => Math.abs(a.row - a.col) - Math.abs(b.row - b.col)
      );
    } else if (def.code === 'MM-41') {
      // Row-banded prioritization
      orderedOffPath = [...offPathCells].sort((a, b) => a.row - b.row || a.col - b.col);
    } else if (def.code === 'MM-42') {
      // Column-banded prioritization
      orderedOffPath = [...offPathCells].sort((a, b) => a.col - b.col || a.row - b.row);
    }

    const densityMultiplier =
      def.obstacleDensity === 'sparse' ? 0.35 : def.obstacleDensity === 'medium' ? 0.52 : 0.68;
    const totalObstacles =
      orderedOffPath.length > 0
        ? Math.max(
            1,
            Math.min(
              orderedOffPath.length,
              Math.round(offPathCells.length * densityMultiplier)
            )
          )
        : 0;

    const staticWallCount =
      def.category === 'Corridor Topology' && totalObstacles >= 2
        ? Math.max(1, Math.floor(totalObstacles * 0.35))
        : 0;
    const staticWalls = orderedOffPath.slice(0, staticWallCount);
    const hazards = orderedOffPath.slice(staticWallCount, totalObstacles);

    const decoyExit =
      def.hasDecoyExit && orderedOffPath.length > totalObstacles
        ? orderedOffPath[totalObstacles]
        : undefined;

    // Validate with BFS pathfinder to guarantee solvability and compute true shortest optimalPath
    const bfsCheck = verifyMazeSolvabilityBFS({
      gridSize,
      start,
      goal,
      hazards,
      staticWalls,
      keysOrder,
      strictKeyOrder: def.strictKeyOrder,
      doors,
      oneWayDoors,
    });

    const verifiedOptimalPath = bfsCheck.solvable ? bfsCheck.optimalPath : backbonePath;
    const optimalMoveCount = Math.max(1, verifiedOptimalPath.length - 1);

    const challengeMode = config.mazeChallengeMode ?? 'hidden-barrier-discovery';
    const evaluationMode = config.evaluationMode ?? 'practice';

    const moveBudget = def.limitedMoves ? optimalMoveCount + gridSize + 3 : null;
    const maxFailedMoves = def.limitedFailedMoves ? 4 : null;

    const memorizeDurationMs =
      challengeMode === 'flash-pattern-recall'
        ? effectiveDifficulty === 'beginner' || effectiveDifficulty === 'easy'
          ? 3000
          : 2200
        : 0;

    let promptText = 'Navigate from Start to Goal while discovering and avoiding hidden barriers';
    if (keysOrder.length === 1 && doors.length === 0) {
      promptText = 'Collect Key A and reach the Goal while avoiding hidden barriers';
    } else if (keysOrder.length >= 1 && doors.length > 0) {
      promptText = `Collect ${keysOrder.map((k) => k.label).join(' → ')} to unlock Gate A and reach the Goal`;
    } else if (keysOrder.length >= 2) {
      promptText = def.strictKeyOrder
        ? `Collect ${keysOrder.map((k) => k.label).join(' → ')} in strict order, then reach the Goal`
        : `Collect all ${keysOrder.length} keys and reach the Goal`;
    }

    const penaltyDesc =
      def.penaltyRule === 'return-to-start'
        ? 'Barrier Rule: Hitting a hidden barrier reveals it permanently and returns you to Start.'
        : 'Barrier Rule: Hitting a hidden barrier reveals it permanently and holds your position.';

    const metadata: PuzzleMetadata = {
      puzzleId: `mm-${config.seed}-q${questionIndex}`,
      gameType: 'memory-maze',
      archetypeId: archetype.id,
      archetypeTitle: `${archetype.code} · ${archetype.title}`,
      category: archetype.category,
      difficulty: effectiveDifficulty,
      seed: `${config.seed}::q${questionIndex}`,
      questionIndex,
      timeLimitSeconds: config.perQuestionTimeSeconds || 35,
      promptText,
      ruleSubtext: `${penaltyDesc}${moveBudget ? ` · Move Budget: ${moveBudget}` : ''}`,
    };

    const puzzle: MemoryMazePuzzle = {
      gridSize,
      challengeMode,
      evaluationMode,
      memorizeDurationMs,
      start,
      goal,
      decoyExit,
      hazards,
      staticWalls,
      keysOrder,
      strictKeyOrder: def.strictKeyOrder,
      doors,
      oneWayDoors,
      penaltyRule: def.penaltyRule,
      optimalPath: verifiedOptimalPath,
      optimalMoveCount,
      moveBudget,
      maxFailedMoves,
    };

    const initialState: MemoryMazeState = {
      phase: challengeMode === 'flash-pattern-recall' ? 'memorize' : 'navigate',
      player: { ...start },
      visitedPath: [{ ...start }],
      collectedKeyIds: [],
      hitHazards: [],
      mistakesCount: 0,
      movesCount: 0,
      hintRevealed: false,
      errorCategoriesTriggered: [],
      lastFeedback:
        challengeMode === 'flash-pattern-recall'
          ? 'Edge-Wall Memory Mode: Memorize blocked cell edges—hitting any wall edge flashes red and resets you to Start.'
          : 'Edge-Wall Memory Mode: Navigate carefully—wall edges are invisible, flash red on impact, and reset you to Start.',
    };

    return { metadata, puzzle, initialState };
  },

  validateAction(
    puzzle: MemoryMazePuzzle,
    state: MemoryMazeState,
    action: MemoryMazeAction
  ): ValidationOutcome<MemoryMazeState> {
    if (action.type === 'begin-navigation') {
      const nextState: MemoryMazeState = {
        ...state,
        phase: 'navigate',
        lastFeedback: 'Navigation active! Use Arrow keys, WASD, or tap an adjacent cell.',
      };
      return {
        valid: true,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState,
        feedbackMessage: nextState.lastFeedback,
      };
    }

    if (action.type === 'reveal-hint') {
      if (puzzle.evaluationMode === 'exam') {
        return {
          valid: false,
          isComplete: false,
          isCorrect: false,
          mistakeMade: false,
          nextState: state,
          feedbackMessage: 'Route hints are disabled in Exam Mode.',
        };
      }
      const nextState: MemoryMazeState = {
        ...state,
        hintRevealed: true,
        lastFeedback: `Practice Hint: Optimal route requires ${puzzle.optimalMoveCount} moves.`,
      };
      return {
        valid: true,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState,
        feedbackMessage: nextState.lastFeedback,
      };
    }

    if (action.type === 'reset-position') {
      const nextState: MemoryMazeState = {
        ...state,
        phase: 'navigate',
        player: { ...puzzle.start },
        visitedPath: [{ ...puzzle.start }],
        collectedKeyIds: [],
        lastFeedback: `Position reset to Start. Memorize the ${state.hitHazards.length} wall edge(s) encountered so far.`,
      };
      return {
        valid: true,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState,
        feedbackMessage: nextState.lastFeedback,
      };
    }

    let target: GridCoord;
    if (action.type === 'move') {
      const dRow = action.direction === 'up' ? -1 : action.direction === 'down' ? 1 : 0;
      const dCol = action.direction === 'left' ? -1 : action.direction === 'right' ? 1 : 0;
      target = { row: state.player.row + dRow, col: state.player.col + dCol };
    } else {
      target = { row: action.row, col: action.col };
    }

    if (target.row < 0 || target.row >= puzzle.gridSize || target.col < 0 || target.col >= puzzle.gridSize) {
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState: state,
        feedbackMessage: 'Cannot move outside the grid boundary.',
      };
    }

    const manhattan = Math.abs(target.row - state.player.row) + Math.abs(target.col - state.player.col);
    if (manhattan !== 1) {
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState: state,
        feedbackMessage: 'Select an adjacent orthogonal cell (up, down, left, or right).',
      };
    }

    // 1. Check barrier collision across the contested edge -> strict collision penalty (reset to START cell)
    const isBarrierEdge =
      puzzle.staticWalls.some((w) => sameCoord(w, target)) ||
      puzzle.hazards.some((h) => sameCoord(h, target));

    if (isBarrierEdge) {
      const alreadyHit = state.hitHazards.some((h) => sameCoord(h, target));
      const updatedDiscovered = alreadyHit ? state.hitHazards : [...state.hitHazards, target];

      const nextState: MemoryMazeState = {
        ...state,
        phase: 'navigate',
        player: { ...puzzle.start },
        visitedPath: [{ ...puzzle.start }],
        collectedKeyIds: [],
        hitHazards: updatedDiscovered,
        mistakesCount: state.mistakesCount + 1,
        movesCount: state.movesCount + 1,
        errorCategoriesTriggered: [...state.errorCategoriesTriggered, 'hidden-barrier-collision'],
        lastFeedback: `Blocked wall edge between (${state.player.row + 1}, ${state.player.col + 1}) and (${target.row + 1}, ${target.col + 1})! Returned to Start—memorize that blocked edge.`,
      };
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: true,
        nextState,
        feedbackMessage: nextState.lastFeedback,
      };
    }

    // 2. Check one-way door direction constraint
    const moveDir = directionBetween(state.player, target);
    const oneWay = puzzle.oneWayDoors.find((d) => sameCoord(d.coord, target));
    if (oneWay && moveDir !== oneWay.allowedDirection) {
      const nextState: MemoryMazeState = {
        ...state,
        phase: 'navigate',
        mistakesCount: state.mistakesCount + 1,
        movesCount: state.movesCount + 1,
        errorCategoriesTriggered: [...state.errorCategoriesTriggered, 'one-way-door-violation'],
        lastFeedback: `One-way door at (${target.row + 1}, ${target.col + 1}) only permits ${oneWay.allowedDirection.toUpperCase()} entry!`,
      };
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: true,
        nextState,
        feedbackMessage: nextState.lastFeedback,
      };
    }

    // 4. Check locked gate
    const blockingDoor = puzzle.doors.find(
      (d) => sameCoord(d.coord, target) && !state.collectedKeyIds.includes(d.requiresKeyId)
    );
    if (blockingDoor) {
      const nextState: MemoryMazeState = {
        ...state,
        phase: 'navigate',
        mistakesCount: state.mistakesCount + 1,
        movesCount: state.movesCount + 1,
        errorCategoriesTriggered: [...state.errorCategoriesTriggered, 'key-order-violation'],
        lastFeedback: 'Gate A is locked! Collect Key A before passing through this gate.',
      };
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: true,
        nextState,
        feedbackMessage: nextState.lastFeedback,
      };
    }

    // 5. Check key collection
    const updatedKeys = [...state.collectedKeyIds];
    let keyMessage = '';
    const keyAtTarget = puzzle.keysOrder.find((k) => sameCoord(k.coord, target));
    if (keyAtTarget && !updatedKeys.includes(keyAtTarget.id)) {
      if (puzzle.strictKeyOrder) {
        const expectedNextKey = puzzle.keysOrder[updatedKeys.length];
        if (expectedNextKey && expectedNextKey.id === keyAtTarget.id) {
          updatedKeys.push(keyAtTarget.id);
          keyMessage = ` Collected ${keyAtTarget.label}!`;
        } else {
          const nextState: MemoryMazeState = {
            ...state,
            phase: 'navigate',
            player: target,
            visitedPath: [...state.visitedPath, target],
            mistakesCount: state.mistakesCount + 1,
            movesCount: state.movesCount + 1,
            errorCategoriesTriggered: [...state.errorCategoriesTriggered, 'key-order-violation'],
            lastFeedback: `Reached ${keyAtTarget.label} out of sequence! Collect ${
              expectedNextKey?.label ?? 'prior key'
            } first.`,
          };
          return {
            valid: false,
            isComplete: false,
            isCorrect: false,
            mistakeMade: true,
            nextState,
            feedbackMessage: nextState.lastFeedback,
          };
        }
      } else {
        updatedKeys.push(keyAtTarget.id);
        keyMessage = ` Collected ${keyAtTarget.label}!`;
      }
    }

    // 6. Check decoy exit
    if (puzzle.decoyExit && sameCoord(target, puzzle.decoyExit)) {
      const nextState: MemoryMazeState = {
        ...state,
        phase: 'navigate',
        player: target,
        visitedPath: [...state.visitedPath, target],
        collectedKeyIds: updatedKeys,
        mistakesCount: state.mistakesCount + 1,
        movesCount: state.movesCount + 1,
        lastFeedback: 'Decoy Exit! That portal is inactive—navigate to the true Goal tile.',
      };
      return {
        valid: true,
        isComplete: false,
        isCorrect: false,
        mistakeMade: true,
        nextState,
        feedbackMessage: nextState.lastFeedback,
      };
    }

    // 7. Check Goal completion
    const atGoal = sameCoord(target, puzzle.goal);
    const allKeysCollected = updatedKeys.length === puzzle.keysOrder.length;
    const nextMovesCount = state.movesCount + 1;
    const budgetExceeded = puzzle.moveBudget !== null && nextMovesCount > puzzle.moveBudget;

    if (atGoal && !allKeysCollected) {
      const missingKey = puzzle.keysOrder.find((k) => !updatedKeys.includes(k.id));
      const nextState: MemoryMazeState = {
        ...state,
        phase: 'navigate',
        player: target,
        visitedPath: [...state.visitedPath, target],
        collectedKeyIds: updatedKeys,
        mistakesCount: state.mistakesCount + 1,
        movesCount: nextMovesCount,
        errorCategoriesTriggered: [...state.errorCategoriesTriggered, 'key-order-violation'],
        lastFeedback: `Exit reached, but ${missingKey?.label ?? 'a required key'} is still uncollected!`,
      };
      return {
        valid: true,
        isComplete: false,
        isCorrect: false,
        mistakeMade: true,
        nextState,
        feedbackMessage: nextState.lastFeedback,
      };
    }

    const isComplete = atGoal && allKeysCollected;
    const nextState: MemoryMazeState = {
      ...state,
      phase: isComplete ? 'complete' : 'navigate',
      player: target,
      visitedPath: [...state.visitedPath, target],
      collectedKeyIds: updatedKeys,
      movesCount: nextMovesCount,
      errorCategoriesTriggered: budgetExceeded
        ? [...state.errorCategoriesTriggered, 'move-budget-exceeded']
        : state.errorCategoriesTriggered,
      lastFeedback: isComplete
        ? `Maze solved in ${nextMovesCount} moves (optimal: ${puzzle.optimalMoveCount})!`
        : `Moved to (${target.row + 1}, ${target.col + 1}).${keyMessage}`,
    };

    return {
      valid: true,
      isComplete,
      isCorrect: isComplete,
      mistakeMade: false,
      nextState,
      feedbackMessage: nextState.lastFeedback,
    };
  },

  isPuzzleComplete(puzzle: MemoryMazePuzzle, state: MemoryMazeState): boolean {
    return (
      sameCoord(state.player, puzzle.goal) &&
      state.collectedKeyIds.length === puzzle.keysOrder.length
    );
  },

  calculateQuestionResult({ metadata, puzzle, finalState, elapsedMs, timedOut }): QuestionResult {
    const isComplete = !timedOut && this.isPuzzleComplete(puzzle, finalState);
    const overBudget =
      puzzle.moveBudget !== null && finalState.movesCount > puzzle.moveBudget;
    const overFailedLimit =
      puzzle.maxFailedMoves !== null && finalState.mistakesCount > puzzle.maxFailedMoves;

    const isCorrect = isComplete && !overBudget && !overFailedLimit;

    const keyProgress =
      puzzle.keysOrder.length > 0
        ? finalState.collectedKeyIds.length / (puzzle.keysOrder.length + 1)
        : 0;
    const distToGoal =
      Math.abs(puzzle.goal.row - finalState.player.row) +
      Math.abs(puzzle.goal.col - finalState.player.col);
    const maxDist = (puzzle.gridSize - 1) * 2;
    const proximityCredit = Math.max(0, (maxDist - distToGoal) / Math.max(1, maxDist)) * 0.5;
    const partialCredit = isCorrect
      ? 1
      : isComplete
      ? 0.75
      : Math.min(0.8, keyProgress + proximityCredit);

    const timeLimitMs = metadata.timeLimitSeconds * 1000;
    const scoreBreakdown = computeQuestionScore({
      isCorrect,
      partialCredit,
      difficulty: metadata.difficulty,
      elapsedMs,
      timeLimitMs,
      mistakesCount: finalState.mistakesCount,
    });

    const errorCategory: CognitiveErrorCategory = isCorrect
      ? 'none'
      : timedOut
      ? 'timeout-incomplete'
      : overBudget
      ? 'move-budget-exceeded'
      : finalState.errorCategoriesTriggered[0] ?? 'hidden-barrier-collision';

    return {
      puzzleId: metadata.puzzleId,
      gameType: 'memory-maze',
      archetypeId: metadata.archetypeId,
      archetypeTitle: metadata.archetypeTitle,
      difficulty: metadata.difficulty,
      seed: metadata.seed,
      questionIndex: metadata.questionIndex,
      isCorrect,
      partialCredit,
      scoreEarned: scoreBreakdown.scoreEarned,
      maxPossibleScore: scoreBreakdown.maxPossibleScore,
      elapsedMs,
      timeLimitMs,
      timeoutStatus: determineTimeoutStatus(elapsedMs, timeLimitMs, timedOut),
      attemptsCount: Math.max(1, finalState.movesCount),
      mistakesCount: finalState.mistakesCount,
      errorCategory,
      summaryText: isCorrect
        ? `Solved ${puzzle.gridSize}×${puzzle.gridSize} maze in ${finalState.movesCount} moves (optimal ${puzzle.optimalMoveCount}, ${finalState.mistakesCount} barrier hits)`
        : timedOut
        ? `Timed out (${finalState.collectedKeyIds.length}/${puzzle.keysOrder.length} keys, ${finalState.mistakesCount} barrier hits)`
        : `Incomplete or over budget (${finalState.movesCount} moves, ${finalState.mistakesCount} barrier hits)`,
    };
  },
};
