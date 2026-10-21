import type {
  CanonicalDifficulty,
  CognitiveErrorCategory,
  Difficulty,
  EvaluationMode,
  GameConfig,
  PuzzleArchetype,
  PuzzleMetadata,
  QuestionResult,
  RouteQualityClassification,
} from '../types/domain.ts';
import { SeededRandom } from '../utils/prng.ts';
import {
  computeQuestionScore,
  determineTimeoutStatus,
  resolveEffectiveDifficulty,
  type GameEngine,
  type ValidationOutcome,
} from './contracts.ts';

export type CardinalDir = 'N' | 'E' | 'S' | 'W';
export type PipeShape = 'straight' | 'corner' | 'tee' | 'cross' | 'blocker';

export interface PathTile {
  row: number;
  col: number;
  shape: PipeShape;
  baseConnections: CardinalDir[]; // Connections at rotation 0 and flipped=false
  locked: boolean;
  rotationStep: 90 | 180; // 90 for normal tiles, 180 for restricted-rotation tiles
  requiredFlowDir?: CardinalDir; // Optional directional one-way arrow constraint
  isWaypoint: boolean;
  checkpointOrder?: number; // 1-indexed order when orderedCheckpoints is enabled
  isSource: boolean;
  isSink: boolean;
  solutionRotation: number; // 0, 90, 180, 270
  solutionFlipped: boolean; // Whether solution requires horizontal flip
}

export interface PathRotationPuzzle {
  gridSize: number; // 3, 4, 5, or 6
  sourceCoord: { row: number; col: number };
  sourceSide: CardinalDir; // External port on source tile
  sinkCoord: { row: number; col: number };
  sinkSide: CardinalDir; // External port on sink tile
  tiles: PathTile[][];
  waypointCoords: Array<{ row: number; col: number; order?: number }>;
  orderedCheckpoints: boolean;
  optimalMoves: number;
  moveCap?: number;
  evaluationMode: EvaluationMode;
  allowUndo: boolean;
}

export interface TileTransform {
  rotation: number; // 0, 90, 180, 270
  flipped: boolean; // horizontal flip
}

export interface PathRotationState {
  transforms: TileTransform[][];
  initialTransforms: TileTransform[][];
  history: TileTransform[][][];
  energizedCoords: Array<{ row: number; col: number }>;
  isConnectedToSink: boolean;
  allWaypointsEnergized: boolean;
  checkpointOrderValid: boolean;
  arrowConstraintsValid: boolean;
  hasClosedLoop: boolean;
  movesCount: number;
  rotationsCount: number;
  flipsCount: number;
  hintsUsedCount: number;
  lockedAttemptsCount: number;
  lastHintCoord?: { row: number; col: number } | null;
  lastFeedback: string;
}

export type PathRotationAction =
  | {
      type: 'rotate-tile';
      row: number;
      col: number;
      clockwise?: boolean;
      targetRotation?: number;
      alignFlip?: boolean;
    }
  | { type: 'flip-tile'; row: number; col: number }
  | { type: 'undo-move' }
  | { type: 'request-hint' }
  | { type: 'reset-board' };

export type PathTopologyStyle =
  | 'straight-line'
  | 'single-elbow'
  | 'multi-elbow'
  | 'horizontal-first'
  | 'vertical-first'
  | 'symmetric'
  | 'asymmetric'
  | 'spiral'
  | 'zigzag'
  | 'perimeter'
  | 'corridor'
  | 'edge-to-edge'
  | 'center-endpoint';

interface PathArchetypeDef {
  code: string;
  title: string;
  category: string;
  description: string;
  recommendedDifficulty: CanonicalDifficulty;
  gridSize: number;
  topology: PathTopologyStyle;
  waypointCount: number;
  orderedCheckpoints?: boolean;
  lockedCount: number;
  lockStartAdjacent?: boolean;
  lockEndAdjacent?: boolean;
  blockerCount?: number;
  restricted180Count?: number;
  arrowCount?: number;
  requireFlipCount?: number;
  nearCompleteMoves?: number;
  moveCapSlack?: number;
  highBranchDecoys?: boolean;
}

/**
 * 50 Documented Path Rotation Archetypes (PR-01 through PR-50)
 * Covering all 50 structural constraints and generation strategies from Prompt 3 Section A2.
 */
const PATH_ARCHETYPE_DEFS: readonly PathArchetypeDef[] = [
  { code: 'PR-01', title: 'Straight-Line Conduit Run', category: 'Foundational Topology', description: 'Align a direct straight-line horizontal or vertical conduit with a single terminal turn.', recommendedDifficulty: 'beginner', gridSize: 3, topology: 'straight-line', waypointCount: 0, lockedCount: 0 },
  { code: 'PR-02', title: 'Single-Elbow L-Route', category: 'Foundational Topology', description: 'Connect Source to Sink using straight conduits and a single 90-degree corner elbow.', recommendedDifficulty: 'beginner', gridSize: 3, topology: 'single-elbow', waypointCount: 0, lockedCount: 0 },
  { code: 'PR-03', title: 'Multi-Elbow Staircase', category: 'Foundational Topology', description: 'Rotate a sequence of alternating 90-degree elbow tiles across the diagonal.', recommendedDifficulty: 'beginner', gridSize: 3, topology: 'multi-elbow', waypointCount: 0, lockedCount: 0 },
  { code: 'PR-04', title: 'Horizontal-First Sweep', category: 'Directional Priority', description: 'Traverse the top horizontal row completely before descending toward the output terminal.', recommendedDifficulty: 'beginner', gridSize: 3, topology: 'horizontal-first', waypointCount: 0, lockedCount: 0 },
  { code: 'PR-05', title: 'Vertical-First Plunge', category: 'Directional Priority', description: 'Drop down the western column first before sweeping east to the Sink terminal.', recommendedDifficulty: 'beginner', gridSize: 3, topology: 'vertical-first', waypointCount: 0, lockedCount: 0 },
  { code: 'PR-06', title: 'Forced Initial Orientation', category: 'Terminal Constraints', description: 'Locked source tile forces a single valid initial departure direction.', recommendedDifficulty: 'easy', gridSize: 3, topology: 'horizontal-first', waypointCount: 0, lockedCount: 1, lockStartAdjacent: true },
  { code: 'PR-07', title: 'Forced Final Orientation', category: 'Terminal Constraints', description: 'Locked sink tile forces the exact final approach vector into the output port.', recommendedDifficulty: 'easy', gridSize: 3, topology: 'vertical-first', waypointCount: 0, lockedCount: 1, lockEndAdjacent: true },
  { code: 'PR-08', title: 'Fixed Start-Adjacent Anchor', category: 'Terminal Constraints', description: 'The tile immediately adjacent to the Source is locked in place.', recommendedDifficulty: 'easy', gridSize: 3, topology: 'multi-elbow', waypointCount: 1, lockedCount: 1, lockStartAdjacent: true },
  { code: 'PR-09', title: 'Fixed End-Adjacent Anchor', category: 'Terminal Constraints', description: 'The tile immediately preceding the Sink is fixed, constraining the final bend.', recommendedDifficulty: 'easy', gridSize: 3, topology: 'multi-elbow', waypointCount: 1, lockedCount: 1, lockEndAdjacent: true },
  { code: 'PR-10', title: 'Symmetric Conduit Reflection', category: 'Geometric Symmetry', description: 'Symmetrically balanced grid layout around the main diagonal axis.', recommendedDifficulty: 'easy', gridSize: 4, topology: 'symmetric', waypointCount: 1, lockedCount: 0 },
  { code: 'PR-11', title: 'Asymmetric Detour Matrix', category: 'Geometric Symmetry', description: 'Off-axis asymmetric path avoiding decoy corners on a 4×4 board.', recommendedDifficulty: 'easy', gridSize: 4, topology: 'asymmetric', waypointCount: 1, lockedCount: 1 },
  { code: 'PR-12', title: 'Shortest-Move Manhattan Path', category: 'Efficiency Challenges', description: 'Connect Source to Sink along a minimal-length Manhattan route.', recommendedDifficulty: 'easy', gridSize: 4, topology: 'single-elbow', waypointCount: 0, lockedCount: 1, moveCapSlack: 2 },
  { code: 'PR-13', title: 'Minimum-Rotation Optimization', category: 'Efficiency Challenges', description: 'Solve the board without exceeding the strict rotation budget.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'multi-elbow', waypointCount: 1, lockedCount: 1, moveCapSlack: 1 },
  { code: 'PR-14', title: 'Dead-End Decoy Branches', category: 'Decoy & Interference', description: 'T-junctions along the route spawn plausible dead-end branches that terminate against walls.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'asymmetric', waypointCount: 1, lockedCount: 1, highBranchDecoys: true },
  { code: 'PR-15', title: 'High-Salience Distractor Tiles', category: 'Decoy & Interference', description: 'Off-path cells contain pre-aligned corner and tee distractors.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'zigzag', waypointCount: 1, lockedCount: 0, highBranchDecoys: true },
  { code: 'PR-16', title: 'Extra Disconnected Segments', category: 'Decoy & Interference', description: 'Isolated conduit clusters sit outside the main circuit to test trace discipline.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'perimeter', waypointCount: 1, lockedCount: 1 },
  { code: 'PR-17', title: 'Multi-Route Parallel Manifold', category: 'Route Multiplicity', description: 'T-junctions and cross tiles permit more than one valid energized path to the Sink.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'symmetric', waypointCount: 1, lockedCount: 0, highBranchDecoys: true },
  { code: 'PR-18', title: 'Unique-Route Locked Deduction', category: 'Route Multiplicity', description: 'Blockers and locked anchors leave exactly one topological route from Source to Sink.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'corridor', waypointCount: 1, lockedCount: 2, blockerCount: 2 },
  { code: 'PR-19', title: '3×3 Beginner Speed Calibration', category: 'Grid Scale Tiers', description: 'Compact 3×3 board designed for rapid visual orientation recognition.', recommendedDifficulty: 'beginner', gridSize: 3, topology: 'single-elbow', waypointCount: 1, lockedCount: 0 },
  { code: 'PR-20', title: '4×4 Intermediate Standard Grid', category: 'Grid Scale Tiers', description: 'Balanced 16-tile matrix with one mandatory checkpoint and one locked tile.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'asymmetric', waypointCount: 1, lockedCount: 1 },
  { code: 'PR-21', title: '5×5 Advanced Routing Arena', category: 'Grid Scale Tiers', description: '25-tile topological grid requiring multi-step lookahead across five rows.', recommendedDifficulty: 'advanced', gridSize: 5, topology: 'zigzag', waypointCount: 2, lockedCount: 2 },
  { code: 'PR-22', title: '6×6 Expert Macro-Circuit', category: 'Grid Scale Tiers', description: 'Large-scale 36-tile practice matrix testing sustained spatial working memory.', recommendedDifficulty: 'expert', gridSize: 6, topology: 'spiral', waypointCount: 2, lockedCount: 3 },
  { code: 'PR-23', title: 'Fixed-Orientation Pillar Grid', category: 'Rotation Restrictions', description: 'Three fixed-orientation anchor tiles dictate the mid-board turns.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'asymmetric', waypointCount: 1, lockedCount: 3 },
  { code: 'PR-24', title: 'Restricted 180°-Toggle Conduits', category: 'Rotation Restrictions', description: 'Contains restricted-rotation tiles that rotate in 180° steps rather than 90°.', recommendedDifficulty: 'advanced', gridSize: 4, topology: 'zigzag', waypointCount: 1, lockedCount: 1, restricted180Count: 2 },
  { code: 'PR-25', title: 'One-Way Arrow Conduit Path', category: 'Directional Flow', description: 'Directional arrow tiles require the signal to flow forward along the arrow vector.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'horizontal-first', waypointCount: 1, lockedCount: 1, arrowCount: 2 },
  { code: 'PR-26', title: 'Multi-Arrow Directional Vector', category: 'Directional Flow', description: 'Three directional arrow tiles enforce strict unilateral signal propagation.', recommendedDifficulty: 'advanced', gridSize: 5, topology: 'asymmetric', waypointCount: 2, lockedCount: 1, arrowCount: 3 },
  { code: 'PR-27', title: 'Single-Checkpoint Relay Detour', category: 'Checkpoint Topologies', description: 'Route must energize a mandatory Relay Checkpoint before reaching the Sink.', recommendedDifficulty: 'easy', gridSize: 3, topology: 'perimeter', waypointCount: 1, lockedCount: 0 },
  { code: 'PR-28', title: 'Ordered Multi-Checkpoint Sequence', category: 'Checkpoint Topologies', description: 'Signal must traverse Checkpoint #1 before Checkpoint #2 en route to the Sink.', recommendedDifficulty: 'advanced', gridSize: 4, topology: 'spiral', waypointCount: 2, orderedCheckpoints: true, lockedCount: 1 },
  { code: 'PR-29', title: 'Corner-to-Corner Diagonal Sweep', category: 'Terminal Placement', description: 'Classic Northwest (1,1) to Southeast (N,N) corner-to-corner routing.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'multi-elbow', waypointCount: 1, lockedCount: 1 },
  { code: 'PR-30', title: 'Edge-to-Edge Midline Conduit', category: 'Terminal Placement', description: 'Connects a mid-border intake port to an opposite mid-border output terminal.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'edge-to-edge', waypointCount: 1, lockedCount: 1 },
  { code: 'PR-31', title: 'Center-Start Radial Outflow', category: 'Terminal Placement', description: 'Signal originates at an interior central Source node and routes outward to the border Sink.', recommendedDifficulty: 'advanced', gridSize: 5, topology: 'center-endpoint', waypointCount: 2, lockedCount: 1 },
  { code: 'PR-32', title: 'Blocked-Center Dead Zone', category: 'Obstacle Topologies', description: 'Impassable blocker tiles occupy the center of the board, forcing a perimeter bypass.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'perimeter', waypointCount: 1, lockedCount: 1, blockerCount: 2 },
  { code: 'PR-33', title: 'Corridor-Bottleneck Choke Point', category: 'Obstacle Topologies', description: 'Blocker cells narrow the board to a single valid one-tile corridor bottleneck.', recommendedDifficulty: 'advanced', gridSize: 5, topology: 'corridor', waypointCount: 2, lockedCount: 2, blockerCount: 3 },
  { code: 'PR-34', title: 'Spiral-Path Inward Coil', category: 'Path Geometry', description: 'Winding spiral trajectory traversing outer border lanes before turning toward the Sink.', recommendedDifficulty: 'advanced', gridSize: 5, topology: 'spiral', waypointCount: 2, lockedCount: 1 },
  { code: 'PR-35', title: 'Zigzag Step Switchback', category: 'Path Geometry', description: 'Tight alternating horizontal and vertical step turns across the matrix.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'zigzag', waypointCount: 1, lockedCount: 1 },
  { code: 'PR-36', title: 'Loop-Avoidance Tee Filter', category: 'Loop & Branch Traps', description: 'Avoid connecting adjacent T-junctions into a self-contained loop.', recommendedDifficulty: 'advanced', gridSize: 4, topology: 'asymmetric', waypointCount: 2, lockedCount: 1, highBranchDecoys: true },
  { code: 'PR-37', title: 'False-Loop Closed-Circuit Trap', category: 'Loop & Branch Traps', description: 'Decoy elbows invite a closed 2×2 ring that diverts signal away from the Sink.', recommendedDifficulty: 'advanced', gridSize: 5, topology: 'perimeter', waypointCount: 2, lockedCount: 2, highBranchDecoys: true },
  { code: 'PR-38', title: 'T-Junction Orientation Ambiguity', category: 'Loop & Branch Traps', description: 'High density of 3-way T-junctions requiring careful port alignment.', recommendedDifficulty: 'advanced', gridSize: 5, topology: 'zigzag', waypointCount: 2, lockedCount: 1, highBranchDecoys: true },
  { code: 'PR-39', title: 'Cross-Junction Nexus Distraction', category: 'Loop & Branch Traps', description: '4-way cross junctions in the interior propagate power into adjacent branches.', recommendedDifficulty: 'advanced', gridSize: 5, topology: 'symmetric', waypointCount: 2, lockedCount: 2, highBranchDecoys: true },
  { code: 'PR-40', title: 'Mirror-Flip & Rotation Hybrid', category: 'Reflection & Rotation', description: 'Includes mirrored tiles that require Horizontal Flip (Key F) or rotation to align.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'asymmetric', waypointCount: 1, lockedCount: 1, requireFlipCount: 2 },
  { code: 'PR-41', title: 'High-Branch-Density Manifold', category: 'Advanced Synthesis', description: 'Dense 5×5 network of T-junctions, elbows, and two mandatory checkpoints.', recommendedDifficulty: 'expert', gridSize: 5, topology: 'asymmetric', waypointCount: 2, lockedCount: 2, highBranchDecoys: true },
  { code: 'PR-42', title: 'Minimal-Cue Long-Range Deduction', category: 'Advanced Synthesis', description: 'Few locked cues on a 5×5 board require tracing backward from the Sink.', recommendedDifficulty: 'expert', gridSize: 5, topology: 'spiral', waypointCount: 2, lockedCount: 1 },
  { code: 'PR-43', title: 'Strict Move-Cap Optimization', category: 'Efficiency Challenges', description: 'Complete the 4×4 circuit within a tight move budget above optimal rotations.', recommendedDifficulty: 'advanced', gridSize: 4, topology: 'multi-elbow', waypointCount: 1, lockedCount: 2, moveCapSlack: 2 },
  { code: 'PR-44', title: 'Time-Pressure Rapid Conduit', category: 'Efficiency Challenges', description: 'Fast-recognition 4×4 layout tuned for high-speed rotation accuracy.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'horizontal-first', waypointCount: 1, lockedCount: 2 },
  { code: 'PR-45', title: 'Near-Complete 2-Move Recognition', category: 'Efficiency Challenges', description: 'All tiles except 2 critical joints are pre-aligned; spot the exact breaks rapidly.', recommendedDifficulty: 'easy', gridSize: 4, topology: 'zigzag', waypointCount: 1, lockedCount: 1, nearCompleteMoves: 2 },
  { code: 'PR-46', title: 'Four-Quadrant Ordered Traversal', category: 'Checkpoint Topologies', description: 'Visit ordered checkpoints across distinct quadrants of a 5×5 grid.', recommendedDifficulty: 'expert', gridSize: 5, topology: 'spiral', waypointCount: 3, orderedCheckpoints: true, lockedCount: 2 },
  { code: 'PR-47', title: 'Perimeter-Hugger Border Conduit', category: 'Path Geometry', description: 'Route clings to the outer border walls around interior blockers.', recommendedDifficulty: 'intermediate', gridSize: 4, topology: 'perimeter', waypointCount: 2, lockedCount: 1, blockerCount: 2 },
  { code: 'PR-48', title: 'Interior-Weave S-Curve', category: 'Path Geometry', description: 'Weaves through interior columns with locked entry and exit elbows.', recommendedDifficulty: 'advanced', gridSize: 5, topology: 'zigzag', waypointCount: 2, lockedCount: 2, lockStartAdjacent: true, lockEndAdjacent: true },
  { code: 'PR-49', title: 'Dual-Lock Directional Bottleneck', category: 'Directional Flow', description: 'Combines locked bottleneck tiles, blockers, and one-way flow arrows.', recommendedDifficulty: 'expert', gridSize: 5, topology: 'corridor', waypointCount: 2, orderedCheckpoints: true, lockedCount: 3, blockerCount: 2, arrowCount: 2 },
  { code: 'PR-50', title: 'Adaptive Master Topological Synthesis', category: 'Capstone Synthesis', description: 'Full-spectrum circuit combining ordered checkpoints, one-way arrows, restricted 180° tiles, and locked anchors.', recommendedDifficulty: 'expert', gridSize: 6, topology: 'spiral', waypointCount: 3, orderedCheckpoints: true, lockedCount: 3, blockerCount: 2, restricted180Count: 2, arrowCount: 2, requireFlipCount: 1 },
];

export const PATH_ROTATION_ARCHETYPES: readonly PuzzleArchetype[] = PATH_ARCHETYPE_DEFS.map((def, idx) => ({
  id: def.code.toLowerCase(),
  gameType: 'path-rotation',
  index: idx + 1,
  code: def.code,
  title: def.title,
  category: def.category,
  description: def.description,
  recommendedDifficulty: def.recommendedDifficulty,
  eligibleGridSizes: [def.gridSize],
  hasAutomatedTestCoverage: true,
}));

export interface PathRotationSeededFixture {
  id: string;
  label: string;
  tier: 'easy' | 'medium' | 'hard' | 'edge';
  seed: string;
  archetypeId: string;
  difficulty: Difficulty;
  description: string;
}

export const PATH_ROTATION_SEEDED_FIXTURES: readonly PathRotationSeededFixture[] = [
  {
    id: 'fixture-pr-easy',
    label: 'Easy Fixture · 3×3 Single-Elbow',
    tier: 'easy',
    seed: 'FIXTURE-PR-EASY-101',
    archetypeId: 'pr-02',
    difficulty: 'easy',
    description: '3×3 foundational conduit with a single 90° elbow turn.',
  },
  {
    id: 'fixture-pr-medium',
    label: 'Medium Fixture · 4×4 One-Way Arrows',
    tier: 'medium',
    seed: 'FIXTURE-PR-MED-202',
    archetypeId: 'pr-25',
    difficulty: 'intermediate',
    description: '4×4 circuit with directional one-way flow arrows and Relay Checkpoint.',
  },
  {
    id: 'fixture-pr-hard',
    label: 'Hard Fixture · Ordered Checkpoints',
    tier: 'hard',
    seed: 'FIXTURE-PR-HARD-303',
    archetypeId: 'pr-28',
    difficulty: 'advanced',
    description: '4×4 spiral route requiring Checkpoint #1 -> Checkpoint #2 in strict order.',
  },
  {
    id: 'fixture-pr-edge',
    label: 'Edge Fixture · 180°-Restricted + Flip',
    tier: 'edge',
    seed: 'FIXTURE-PR-EDGE-404',
    archetypeId: 'pr-50',
    difficulty: 'expert',
    description: 'Master synthesis with ordered checkpoints, 180°-toggle conduits, and directional arrows.',
  },
];

const DIR_ORDER: CardinalDir[] = ['N', 'E', 'S', 'W'];

const OPPOSITE_DIR: Record<CardinalDir, CardinalDir> = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E',
};

const DIR_DELTAS: Record<CardinalDir, { dRow: number; dCol: number }> = {
  N: { dRow: -1, dCol: 0 },
  E: { dRow: 0, dCol: 1 },
  S: { dRow: 1, dCol: 0 },
  W: { dRow: 0, dCol: -1 },
};

export function getEffectiveConnections(
  baseConnections: readonly CardinalDir[],
  transform?: TileTransform
): CardinalDir[] {
  const safeTransform = transform ?? { rotation: 0, flipped: false };
  const steps = (((safeTransform.rotation % 360) + 360) % 360) / 90;
  return baseConnections.map((dir) => {
    let d = dir;
    if (safeTransform.flipped) {
      if (d === 'E') d = 'W';
      else if (d === 'W') d = 'E';
    }
    const idx = DIR_ORDER.indexOf(d);
    return DIR_ORDER[(idx + steps) % 4];
  });
}

function getDirectionBetween(
  from: { row: number; col: number },
  to: { row: number; col: number }
): CardinalDir {
  if (to.row < from.row) return 'N';
  if (to.row > from.row) return 'S';
  if (to.col < from.col) return 'W';
  return 'E';
}

function getBaseShapeAndRotationForDirs(
  reqA: CardinalDir,
  reqB: CardinalDir,
  useTee = false
): {
  shape: PipeShape;
  baseConnections: CardinalDir[];
  solutionRotation: number;
} {
  const pair = new Set<CardinalDir>([reqA, reqB]);
  const isStraight = (pair.has('N') && pair.has('S')) || (pair.has('E') && pair.has('W'));

  if (isStraight && !useTee) {
    const baseConnections: CardinalDir[] = ['N', 'S'];
    const solutionRotation = pair.has('N') ? 0 : 90;
    return { shape: 'straight', baseConnections, solutionRotation };
  }

  if (useTee) {
    // Base tee is ['N', 'E', 'W'] (missing 'S')
    // Rotation 0: N, E, W (missing S)
    // Rotation 90: E, S, N (missing W)
    // Rotation 180: S, W, E (missing N)
    // Rotation 270: W, N, S (missing E)
    const baseConnections: CardinalDir[] = ['N', 'E', 'W'];
    for (const rot of [0, 90, 180, 270]) {
      const conns = getEffectiveConnections(baseConnections, { rotation: rot, flipped: false });
      if (conns.includes(reqA) && conns.includes(reqB)) {
        return { shape: 'tee', baseConnections, solutionRotation: rot };
      }
    }
  }

  // Corner: base is ['N', 'E']
  const baseConnections: CardinalDir[] = ['N', 'E'];
  let solutionRotation = 0;
  if (pair.has('N') && pair.has('E')) solutionRotation = 0;
  else if (pair.has('E') && pair.has('S')) solutionRotation = 90;
  else if (pair.has('S') && pair.has('W')) solutionRotation = 180;
  else if (pair.has('W') && pair.has('N')) solutionRotation = 270;

  return { shape: 'corner', baseConnections, solutionRotation };
}

export interface NetworkTraceResult {
  energizedCoords: Array<{ row: number; col: number }>;
  isConnectedToSink: boolean;
  allWaypointsEnergized: boolean;
  checkpointOrderValid: boolean;
  arrowConstraintsValid: boolean;
  hasClosedLoop: boolean;
}

export function traceEnergizedNetwork(
  puzzle: PathRotationPuzzle,
  transforms: TileTransform[][]
): NetworkTraceResult {
  const N = puzzle.gridSize;
  const { row: sRow, col: sCol } = puzzle.sourceCoord;
  const { row: tRow, col: tCol } = puzzle.sinkCoord;

  const sourceTile = puzzle.tiles[sRow]?.[sCol];
  if (!sourceTile || sourceTile.shape === 'blocker') {
    return {
      energizedCoords: [],
      isConnectedToSink: false,
      allWaypointsEnergized: false,
      checkpointOrderValid: false,
      arrowConstraintsValid: false,
      hasClosedLoop: false,
    };
  }

  const sourceConns = getEffectiveConnections(sourceTile.baseConnections, transforms[sRow]?.[sCol]);
  if (!sourceConns.includes(puzzle.sourceSide)) {
    return {
      energizedCoords: [],
      isConnectedToSink: false,
      allWaypointsEnergized: false,
      checkpointOrderValid: false,
      arrowConstraintsValid: false,
      hasClosedLoop: false,
    };
  }

  const startKey = `${sRow},${sCol}`;
  const visitedOrder = new Map<string, number>([[startKey, 0]]);
  const parentMap = new Map<string, { parentKey: string | null; viaDir: CardinalDir | null }>([
    [startKey, { parentKey: null, viaDir: null }],
  ]);
  const queue: Array<{ row: number; col: number }> = [{ row: sRow, col: sCol }];
  const energizedCoords: Array<{ row: number; col: number }> = [{ row: sRow, col: sCol }];
  let hasClosedLoop = false;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currKey = `${curr.row},${curr.col}`;
    const currParent = parentMap.get(currKey)?.parentKey ?? null;
    const currConns = getEffectiveConnections(
      puzzle.tiles[curr.row][curr.col].baseConnections,
      transforms[curr.row]?.[curr.col]
    );

    for (const dir of currConns) {
      const { dRow, dCol } = DIR_DELTAS[dir];
      const nRow = curr.row + dRow;
      const nCol = curr.col + dCol;
      if (nRow < 0 || nRow >= N || nCol < 0 || nCol >= N) continue;

      const neighborTile = puzzle.tiles[nRow][nCol];
      if (neighborTile.shape === 'blocker') continue;

      const neighborConns = getEffectiveConnections(
        neighborTile.baseConnections,
        transforms[nRow]?.[nCol]
      );
      if (!neighborConns.includes(OPPOSITE_DIR[dir])) continue;

      const nKey = `${nRow},${nCol}`;
      if (nKey === currParent) continue;

      if (visitedOrder.has(nKey)) {
        hasClosedLoop = true;
        continue;
      }

      visitedOrder.set(nKey, visitedOrder.size);
      parentMap.set(nKey, { parentKey: currKey, viaDir: dir });
      const coord = { row: nRow, col: nCol };
      energizedCoords.push(coord);
      queue.push(coord);
    }
  }

  const sinkKey = `${tRow},${tCol}`;
  const sinkConns = getEffectiveConnections(
    puzzle.tiles[tRow][tCol].baseConnections,
    transforms[tRow]?.[tCol]
  );
  const isConnectedToSink = visitedOrder.has(sinkKey) && sinkConns.includes(puzzle.sinkSide);

  const allWaypointsEnergized = puzzle.waypointCoords.every((wp) =>
    visitedOrder.has(`${wp.row},${wp.col}`)
  );

  // Reconstruct directed path from Source to Sink (if connected) to verify ordered checkpoints & one-way arrows
  let checkpointOrderValid = allWaypointsEnergized;
  let arrowConstraintsValid = true;

  if (isConnectedToSink) {
    const pathKeys: string[] = [];
    let cursor: string | null = sinkKey;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      pathKeys.unshift(cursor);
      cursor = parentMap.get(cursor)?.parentKey ?? null;
    }

    const pathIndexByKey = new Map<string, number>();
    pathKeys.forEach((k, idx) => pathIndexByKey.set(k, idx));

    if (puzzle.orderedCheckpoints && puzzle.waypointCoords.length > 1) {
      const sortedWps = [...puzzle.waypointCoords].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      let prevIdx = -1;
      for (const wp of sortedWps) {
        const wpKey = `${wp.row},${wp.col}`;
        const idx = pathIndexByKey.get(wpKey) ?? visitedOrder.get(wpKey) ?? -1;
        if (idx <= prevIdx) {
          checkpointOrderValid = false;
          break;
        }
        prevIdx = idx;
      }
    }

    // Verify one-way directional arrows on all energized tiles
    for (let i = 0; i < pathKeys.length; i++) {
      const [rStr, cStr] = pathKeys[i].split(',');
      const r = Number(rStr);
      const c = Number(cStr);
      const tile = puzzle.tiles[r][c];
      if (tile.requiredFlowDir) {
        const nextKey = pathKeys[i + 1];
        if (nextKey) {
          const [nrStr, ncStr] = nextKey.split(',');
          const actualExitDir = getDirectionBetween({ row: r, col: c }, { row: Number(nrStr), col: Number(ncStr) });
          if (actualExitDir !== tile.requiredFlowDir) {
            arrowConstraintsValid = false;
          }
        } else if (r === tRow && c === tCol) {
          if (puzzle.sinkSide !== tile.requiredFlowDir) {
            arrowConstraintsValid = false;
          }
        }
      }
    }
  } else {
    // Even when not connected to sink yet, check if any energized tile violates its arrow flow
    for (const coord of energizedCoords) {
      const key = `${coord.row},${coord.col}`;
      const tile = puzzle.tiles[coord.row][coord.col];
      if (tile.requiredFlowDir) {
        const conns = getEffectiveConnections(
          tile.baseConnections,
          transforms[coord.row]?.[coord.col]
        );
        if (!conns.includes(tile.requiredFlowDir)) {
          arrowConstraintsValid = false;
        }
        const pInfo = parentMap.get(key);
        if (pInfo?.viaDir && OPPOSITE_DIR[pInfo.viaDir] === tile.requiredFlowDir) {
          // Signal entered through the arrow's exit tip (backwards flow!)
          arrowConstraintsValid = false;
        }
      }
    }
  }

  return {
    energizedCoords,
    isConnectedToSink,
    allWaypointsEnergized,
    checkpointOrderValid,
    arrowConstraintsValid,
    hasClosedLoop,
  };
}

function buildTopologyPath(
  gridSize: number,
  topology: PathTopologyStyle,
  rng: SeededRandom
): {
  path: Array<{ row: number; col: number }>;
  sourceSide: CardinalDir;
  sinkSide: CardinalDir;
} {
  const N = gridSize;

  if (topology === 'straight-line') {
    // Pure straight horizontal conduit across the middle row
    const midRow = Math.floor(N / 2);
    const path: Array<{ row: number; col: number }> = [];
    for (let c = 0; c < N; c++) path.push({ row: midRow, col: c });
    return { path, sourceSide: 'W', sinkSide: 'E' };
  }

  if (topology === 'single-elbow' || topology === 'horizontal-first') {
    // Across row 0 then down col N-1
    const path: Array<{ row: number; col: number }> = [];
    for (let c = 0; c < N; c++) path.push({ row: 0, col: c });
    for (let r = 1; r < N; r++) path.push({ row: r, col: N - 1 });
    return { path, sourceSide: 'W', sinkSide: 'E' };
  }

  if (topology === 'vertical-first') {
    // Down col 0 then across row N-1
    const path: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < N; r++) path.push({ row: r, col: 0 });
    for (let c = 1; c < N; c++) path.push({ row: N - 1, col: c });
    return { path, sourceSide: 'N', sinkSide: 'E' };
  }

  if (topology === 'multi-elbow' || topology === 'symmetric') {
    // Monotonic staircase path from (0,0) to (N-1,N-1)
    const path: Array<{ row: number; col: number }> = [{ row: 0, col: 0 }];
    let r = 0;
    let c = 0;
    while (r < N - 1 || c < N - 1) {
      if (c < N - 1 && (r === N - 1 || c <= r)) {
        c += 1;
      } else {
        r += 1;
      }
      path.push({ row: r, col: c });
    }
    return { path, sourceSide: 'W', sinkSide: 'E' };
  }

  if (topology === 'perimeter') {
    // Go down col 0 to N-1, then across row N-1 to N-1, or top then right with detour
    const path: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < N; r++) path.push({ row: r, col: 0 });
    for (let c = 1; c < N; c++) path.push({ row: N - 1, col: c });
    return { path, sourceSide: 'W', sinkSide: 'S' };
  }

  if (topology === 'edge-to-edge') {
    const mid = Math.floor(N / 2);
    const path: Array<{ row: number; col: number }> = [];
    for (let c = 0; c < N; c++) {
      path.push({ row: mid, col: c });
    }
    if (mid + 1 < N && N >= 4) {
      // Small detour to make it interesting
      path.splice(
        1,
        2,
        { row: mid, col: 1 },
        { row: mid - 1, col: 1 },
        { row: mid - 1, col: 2 },
        { row: mid, col: 2 }
      );
    }
    return { path, sourceSide: 'W', sinkSide: 'E' };
  }

  if (topology === 'center-endpoint' && N >= 4) {
    const center = Math.floor(N / 2);
    const path: Array<{ row: number; col: number }> = [];
    for (let r = center; r < N; r++) {
      path.push({ row: r, col: center });
    }
    for (let c = center + 1; c < N; c++) {
      path.push({ row: N - 1, col: c });
    }
    return { path, sourceSide: 'N', sinkSide: 'E' };
  }

  if (topology === 'spiral' && N >= 4) {
    // Top row 0..N-1, right col 0..N-2, inner step to (N-1, N-1)
    const path: Array<{ row: number; col: number }> = [];
    for (let c = 0; c < N; c++) path.push({ row: 0, col: c });
    for (let r = 1; r < N - 1; r++) path.push({ row: r, col: N - 1 });
    for (let c = N - 2; c >= 1; c--) path.push({ row: N - 2, col: c });
    for (let c = 1; c < N; c++) path.push({ row: N - 1, col: c });
    return { path, sourceSide: 'W', sinkSide: 'E' };
  }

  // Default / zigzag / corridor / asymmetric: randomized self-avoiding path from (0,0) to (N-1,N-1)
  const target = { row: N - 1, col: N - 1 };
  for (let attempt = 0; attempt < 40; attempt++) {
    const path: Array<{ row: number; col: number }> = [{ row: 0, col: 0 }];
    const visited = new Set<string>(['0,0']);
    let curr = { row: 0, col: 0 };

    while (curr.row !== target.row || curr.col !== target.col) {
      const candidates = [
        { row: curr.row + 1, col: curr.col },
        { row: curr.row, col: curr.col + 1 },
        { row: curr.row - 1, col: curr.col },
        { row: curr.row, col: curr.col - 1 },
      ].filter(
        (n) =>
          n.row >= 0 &&
          n.row < N &&
          n.col >= 0 &&
          n.col < N &&
          !visited.has(`${n.row},${n.col}`)
      );

      if (candidates.length === 0) break;

      const weighted = candidates.sort((a, b) => {
        const distA =
          Math.abs(target.row - a.row) + Math.abs(target.col - a.col) + (rng.nextBool(0.6) ? 0 : 2);
        const distB =
          Math.abs(target.row - b.row) + Math.abs(target.col - b.col) + (rng.nextBool(0.6) ? 0 : 2);
        return distA - distB;
      });

      curr = weighted[0];
      path.push(curr);
      visited.add(`${curr.row},${curr.col}`);
    }

    if (curr.row === target.row && curr.col === target.col && path.length >= N * 2 - 1) {
      return { path, sourceSide: 'W', sinkSide: 'E' };
    }
  }

  // Fallback staircase
  const fallback: Array<{ row: number; col: number }> = [{ row: 0, col: 0 }];
  let r = 0;
  let c = 0;
  while (r < N - 1 || c < N - 1) {
    if (c < N - 1 && (r === N - 1 || (r + c) % 2 === 0)) c += 1;
    else r += 1;
    fallback.push({ row: r, col: c });
  }
  return { path: fallback, sourceSide: 'W', sinkSide: 'E' };
}

export function verifyPathRotationSolution(puzzle: PathRotationPuzzle): boolean {
  const solvedTransforms: TileTransform[][] = puzzle.tiles.map((row) =>
    row.map((tile) => ({
      rotation: tile.solutionRotation,
      flipped: tile.solutionFlipped,
    }))
  );
  const trace = traceEnergizedNetwork(puzzle, solvedTransforms);
  return (
    trace.isConnectedToSink &&
    trace.allWaypointsEnergized &&
    trace.checkpointOrderValid &&
    trace.arrowConstraintsValid
  );
}

export const pathRotationEngine: GameEngine<PathRotationPuzzle, PathRotationState, PathRotationAction> = {
  gameType: 'path-rotation',
  title: 'Path Rotation',
  shortDescription:
    'Rotate and flip conduit tiles to establish a valid directional route from Source to Sink through all Relay Checkpoints.',
  archetypes: PATH_ROTATION_ARCHETYPES,

  generatePuzzle(config: GameConfig, questionIndex: number) {
    const effectiveDifficulty = resolveEffectiveDifficulty(config.difficulty, questionIndex);
    const evaluationMode: EvaluationMode = config.evaluationMode ?? 'practice';
    const rng = new SeededRandom(`${config.seed}::path-rotation::q${questionIndex}`);

    let archetype = PATH_ROTATION_ARCHETYPES[questionIndex % PATH_ROTATION_ARCHETYPES.length];
    if (config.archetypeId) {
      const found = PATH_ROTATION_ARCHETYPES.find(
        (a) => a.id === config.archetypeId || a.code.toLowerCase() === config.archetypeId?.toLowerCase()
      );
      if (found) archetype = found;
    } else {
      const pool = PATH_ROTATION_ARCHETYPES.filter(
        (a) =>
          effectiveDifficulty === 'advanced' ||
          effectiveDifficulty === 'expert' ||
          a.recommendedDifficulty === effectiveDifficulty ||
          a.recommendedDifficulty === 'easy'
      );
      archetype = rng.pick(pool.length > 0 ? pool : PATH_ROTATION_ARCHETYPES);
    }

    const def = PATH_ARCHETYPE_DEFS[archetype.index - 1] ?? PATH_ARCHETYPE_DEFS[0];
    const gridSize = config.gridSizeOverride
      ? Math.max(3, Math.min(6, config.gridSizeOverride))
      : config.archetypeId
      ? def.gridSize
      : effectiveDifficulty === 'beginner' || effectiveDifficulty === 'easy'
      ? Math.min(4, def.gridSize)
      : effectiveDifficulty === 'intermediate'
      ? Math.max(3, Math.min(5, def.gridSize))
      : def.gridSize;

    const { path: solutionPath, sourceSide, sinkSide } = buildTopologyPath(
      gridSize,
      def.topology,
      rng
    );

    const sourceCoord = solutionPath[0];
    const sinkCoord = solutionPath[solutionPath.length - 1];

    const pathIndexMap = new Map<string, number>();
    solutionPath.forEach((coord, idx) => pathIndexMap.set(`${coord.row},${coord.col}`, idx));

    const interiorIndices = solutionPath
      .map((_, i) => i)
      .filter((i) => i > 0 && i < solutionPath.length - 1);

    const shuffledInterior = rng.shuffle(interiorIndices);

    // Select checkpoints along the interior of solutionPath
    const wpCount = Math.min(def.waypointCount, shuffledInterior.length);
    const chosenWpPathIndices = shuffledInterior.slice(0, wpCount).sort((a, b) => a - b);
    const orderedCheckpoints = Boolean(def.orderedCheckpoints && wpCount > 1);
    const waypointCoords: Array<{ row: number; col: number; order?: number }> = chosenWpPathIndices.map(
      (pathIdx, idx) => ({
        row: solutionPath[pathIdx].row,
        col: solutionPath[pathIdx].col,
        order: orderedCheckpoints ? idx + 1 : undefined,
      })
    );

    // Select locked tiles along solutionPath
    const lockedSet = new Set<string>();
    if (def.lockStartAdjacent && solutionPath.length > 2) {
      const startAdj = solutionPath[1];
      lockedSet.add(`${startAdj.row},${startAdj.col}`);
    }
    if (def.lockEndAdjacent && solutionPath.length > 2) {
      const endAdj = solutionPath[solutionPath.length - 2];
      lockedSet.add(`${endAdj.row},${endAdj.col}`);
    }

    const remainingInterior = shuffledInterior.slice(wpCount);
    for (const idx of remainingInterior) {
      if (lockedSet.size >= def.lockedCount) break;
      const coord = solutionPath[idx];
      lockedSet.add(`${coord.row},${coord.col}`);
    }

    // Select restricted 180-degree tiles along solutionPath (excluding locked)
    const restricted180Set = new Set<string>();
    const unlockedPathIndices = interiorIndices.filter(
      (idx) => !lockedSet.has(`${solutionPath[idx].row},${solutionPath[idx].col}`)
    );
    for (let i = 0; i < Math.min(def.restricted180Count ?? 0, unlockedPathIndices.length); i++) {
      const c = solutionPath[unlockedPathIndices[i]];
      restricted180Set.add(`${c.row},${c.col}`);
    }

    // Select directional arrow tiles along solutionPath
    const arrowMap = new Map<string, CardinalDir>();
    const arrowCandidates = rng.shuffle(interiorIndices);
    for (let i = 0; i < Math.min(def.arrowCount ?? 0, arrowCandidates.length); i++) {
      const pIdx = arrowCandidates[i];
      const curr = solutionPath[pIdx];
      const next = solutionPath[pIdx + 1];
      arrowMap.set(`${curr.row},${curr.col}`, getDirectionBetween(curr, next));
    }

    // Select flip-required tiles along solutionPath (excluding locked and restricted180)
    const flipRequiredSet = new Set<string>();
    const flipCandidates = unlockedPathIndices.filter(
      (idx) => !restricted180Set.has(`${solutionPath[idx].row},${solutionPath[idx].col}`)
    );
    for (let i = 0; i < Math.min(def.requireFlipCount ?? 0, flipCandidates.length); i++) {
      const c = solutionPath[flipCandidates[i]];
      flipRequiredSet.add(`${c.row},${c.col}`);
    }

    // Off-path blocker cells
    const offPathCoords: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (!pathIndexMap.has(`${r},${c}`)) {
          offPathCoords.push({ row: r, col: c });
        }
      }
    }
    const shuffledOffPath = rng.shuffle(offPathCoords);
    const blockerSet = new Set<string>();
    for (let i = 0; i < Math.min(def.blockerCount ?? 0, shuffledOffPath.length); i++) {
      blockerSet.add(`${shuffledOffPath[i].row},${shuffledOffPath[i].col}`);
    }

    // If nearCompleteMoves is specified, only scramble that many unlocked path tiles
    const scrambleLimit = def.nearCompleteMoves ?? unlockedPathIndices.length + 2;
    let scrambledCount = 0;
    let optimalMoves = 0;

    const tiles: PathTile[][] = [];
    const initialTransforms: TileTransform[][] = [];

    for (let r = 0; r < gridSize; r++) {
      const tileRow: PathTile[] = [];
      const transformRow: TileTransform[] = [];
      for (let c = 0; c < gridSize; c++) {
        const key = `${r},${c}`;
        const pIdx = pathIndexMap.get(key);
        const wpObj = waypointCoords.find((w) => w.row === r && w.col === c);
        const isWaypoint = Boolean(wpObj);
        const isSource = r === sourceCoord.row && c === sourceCoord.col;
        const isSink = r === sinkCoord.row && c === sinkCoord.col;
        const locked = lockedSet.has(key);
        const rotationStep: 90 | 180 = restricted180Set.has(key) ? 180 : 90;
        const requiredFlowDir = arrowMap.get(key);

        if (pIdx !== undefined) {
          const prevDir: CardinalDir =
            pIdx === 0
              ? sourceSide
              : getDirectionBetween(solutionPath[pIdx], solutionPath[pIdx - 1]);

          const nextDir: CardinalDir =
            pIdx === solutionPath.length - 1
              ? sinkSide
              : getDirectionBetween(solutionPath[pIdx], solutionPath[pIdx + 1]);

          // Use T-junction on path only when highBranchDecoys is active and not restricted/flipped
          const useTee =
            Boolean(def.highBranchDecoys) &&
            !isSource &&
            !isSink &&
            rotationStep === 90 &&
            !flipRequiredSet.has(key) &&
            rng.nextBool(0.3);

          const { shape, baseConnections, solutionRotation } = getBaseShapeAndRotationForDirs(
            prevDir,
            nextDir,
            useTee
          );

          const shouldStartFlipped = flipRequiredSet.has(key) && shape === 'corner';

          tileRow.push({
            row: r,
            col: c,
            shape,
            baseConnections,
            locked,
            rotationStep,
            requiredFlowDir,
            isWaypoint,
            checkpointOrder: wpObj?.order,
            isSource,
            isSink,
            solutionRotation,
            solutionFlipped: false,
          });

          if (locked || scrambledCount >= scrambleLimit) {
            transformRow.push({
              rotation: solutionRotation,
              flipped: false,
            });
          } else {
            scrambledCount++;
            if (rotationStep === 180) {
              // Must scramble by 180 degrees so a single 180-step toggle can solve it
              optimalMoves += 1;
              transformRow.push({
                rotation: (solutionRotation + 180) % 360,
                flipped: false,
              });
            } else if (shouldStartFlipped) {
              optimalMoves += 1;
              transformRow.push({
                rotation: solutionRotation,
                flipped: true,
              });
            } else {
              const offset = rng.pick([90, 180, 270]);
              optimalMoves += offset === 270 ? 1 : offset === 180 ? 2 : 1;
              transformRow.push({
                rotation: (solutionRotation + offset) % 360,
                flipped: false,
              });
            }
          }
        } else if (blockerSet.has(key)) {
          tileRow.push({
            row: r,
            col: c,
            shape: 'blocker',
            baseConnections: [],
            locked: true,
            rotationStep: 90,
            isWaypoint: false,
            isSource: false,
            isSink: false,
            solutionRotation: 0,
            solutionFlipped: false,
          });
          transformRow.push({ rotation: 0, flipped: false });
        } else {
          // Off-path decoy tile
          const decoyShapes: PipeShape[] = def.highBranchDecoys
            ? ['tee', 'corner', 'cross']
            : ['corner', 'straight', 'tee'];
          const shape = rng.pick(decoyShapes);
          const baseConnections: CardinalDir[] =
            shape === 'straight'
              ? ['N', 'S']
              : shape === 'corner'
              ? ['N', 'E']
              : shape === 'tee'
              ? ['N', 'E', 'W']
              : ['N', 'E', 'S', 'W'];

          tileRow.push({
            row: r,
            col: c,
            shape,
            baseConnections,
            locked: false,
            rotationStep: 90,
            isWaypoint: false,
            isSource: false,
            isSink: false,
            solutionRotation: 0,
            solutionFlipped: false,
          });

          transformRow.push({
            rotation: rng.pick([0, 90, 180, 270]),
            flipped: false,
          });
        }
      }
      tiles.push(tileRow);
      initialTransforms.push(transformRow);
    }

    const moveCap =
      def.moveCapSlack !== undefined
        ? Math.max(optimalMoves + def.moveCapSlack + 2, solutionPath.length + 2)
        : undefined;

    const puzzle: PathRotationPuzzle = {
      gridSize,
      sourceCoord,
      sourceSide,
      sinkCoord,
      sinkSide,
      tiles,
      waypointCoords,
      orderedCheckpoints,
      optimalMoves: Math.max(1, optimalMoves),
      moveCap,
      evaluationMode,
      allowUndo: config.practiceRules?.allowUndo ?? true,
    };

    // Ensure puzzle is not accidentally already solved on initial spawn
    let trace = traceEnergizedNetwork(puzzle, initialTransforms);
    if (
      trace.isConnectedToSink &&
      trace.allWaypointsEnergized &&
      trace.checkpointOrderValid &&
      trace.arrowConstraintsValid
    ) {
      const firstUnlocked = solutionPath.find((c) => !tiles[c.row][c.col].locked);
      if (firstUnlocked) {
        const step = tiles[firstUnlocked.row][firstUnlocked.col].rotationStep;
        initialTransforms[firstUnlocked.row][firstUnlocked.col].rotation =
          (initialTransforms[firstUnlocked.row][firstUnlocked.col].rotation + step) % 360;
        trace = traceEnergizedNetwork(puzzle, initialTransforms);
      }
    }

    const cloneTransforms = (t: TileTransform[][]): TileTransform[][] =>
      t.map((row) => row.map((cell) => ({ ...cell })));

    const wpPrompt =
      waypointCoords.length > 0
        ? orderedCheckpoints
          ? ` through Ordered Checkpoints #1 → #${waypointCoords.length}`
          : ` through ${waypointCoords.length} Relay Checkpoint${waypointCoords.length > 1 ? 's' : ''}`
        : '';

    const promptText = `Connect Source (IN) to Sink (OUT)${wpPrompt}`;

    const metadata: PuzzleMetadata = {
      puzzleId: `pr-${config.seed}-q${questionIndex}`,
      gameType: 'path-rotation',
      archetypeId: archetype.id,
      archetypeTitle: `${archetype.code} · ${archetype.title}`,
      category: archetype.category,
      difficulty: effectiveDifficulty,
      seed: `${config.seed}::q${questionIndex}`,
      questionIndex,
      timeLimitSeconds: config.perQuestionTimeSeconds || 35,
      promptText,
      ruleSubtext:
        'Click any unlocked tile to rotate clockwise · Shift+Click or Flip Mode (Key F) to mirror horizontally · Arrow Keys + Space for keyboard routing.',
    };

    const initialState: PathRotationState = {
      transforms: cloneTransforms(initialTransforms),
      initialTransforms: cloneTransforms(initialTransforms),
      history: [],
      energizedCoords: trace.energizedCoords,
      isConnectedToSink: trace.isConnectedToSink,
      allWaypointsEnergized: trace.allWaypointsEnergized,
      checkpointOrderValid: trace.checkpointOrderValid,
      arrowConstraintsValid: trace.arrowConstraintsValid,
      hasClosedLoop: trace.hasClosedLoop,
      movesCount: 0,
      rotationsCount: 0,
      flipsCount: 0,
      hintsUsedCount: 0,
      lockedAttemptsCount: 0,
      lastHintCoord: null,
      lastFeedback: 'Rotate or flip conduit tiles until the signal connects Source (IN) to Sink (OUT).',
    };

    return { metadata, puzzle, initialState };
  },

  validateAction(
    puzzle: PathRotationPuzzle,
    state: PathRotationState,
    action: PathRotationAction
  ): ValidationOutcome<PathRotationState> {
    const cloneTransforms = (t: TileTransform[][]): TileTransform[][] =>
      puzzle.tiles.map((row, r) =>
        row.map((_, c) => ({
          rotation: t[r]?.[c]?.rotation ?? 0,
          flipped: t[r]?.[c]?.flipped ?? false,
        }))
      );

    if (action.type === 'reset-board') {
      const restored = cloneTransforms(state.initialTransforms);
      const trace = traceEnergizedNetwork(puzzle, restored);
      return {
        valid: true,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState: {
          ...state,
          transforms: restored,
          history: [],
          energizedCoords: trace.energizedCoords,
          isConnectedToSink: trace.isConnectedToSink,
          allWaypointsEnergized: trace.allWaypointsEnergized,
          checkpointOrderValid: trace.checkpointOrderValid,
          arrowConstraintsValid: trace.arrowConstraintsValid,
          hasClosedLoop: trace.hasClosedLoop,
          movesCount: 0,
          rotationsCount: 0,
          flipsCount: 0,
          lastHintCoord: null,
          lastFeedback: 'Board reset to initial scrambled configuration.',
        },
        feedbackMessage: 'Board reset to initial scrambled configuration.',
      };
    }

    if (action.type === 'undo-move') {
      if (puzzle.evaluationMode === 'exam' || !puzzle.allowUndo) {
        return {
          valid: false,
          isComplete: false,
          isCorrect: false,
          mistakeMade: false,
          nextState: state,
          feedbackMessage: 'Undo is disabled in this session configuration.',
        };
      }
      if (state.history.length === 0) {
        return {
          valid: false,
          isComplete: false,
          isCorrect: false,
          mistakeMade: false,
          nextState: state,
          feedbackMessage: 'No moves to undo.',
        };
      }
      const previousTransforms = state.history[state.history.length - 1];
      const nextHistory = state.history.slice(0, -1);
      const trace = traceEnergizedNetwork(puzzle, previousTransforms);
      return {
        valid: true,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState: {
          ...state,
          transforms: previousTransforms,
          history: nextHistory,
          energizedCoords: trace.energizedCoords,
          isConnectedToSink: trace.isConnectedToSink,
          allWaypointsEnergized: trace.allWaypointsEnergized,
          checkpointOrderValid: trace.checkpointOrderValid,
          arrowConstraintsValid: trace.arrowConstraintsValid,
          hasClosedLoop: trace.hasClosedLoop,
          movesCount: Math.max(0, state.movesCount - 1),
          lastHintCoord: null,
          lastFeedback: 'Reverted previous tile adjustment.',
        },
        feedbackMessage: 'Reverted previous tile adjustment.',
      };
    }

    if (action.type === 'request-hint') {
      if (puzzle.evaluationMode === 'exam') {
        return {
          valid: false,
          isComplete: false,
          isCorrect: false,
          mistakeMade: false,
          nextState: state,
          feedbackMessage: 'Hints are disabled in Exam Mode.',
        };
      }

      // Find first unlocked tile on the board whose effective connections do not match its solution state
      let targetCoord: { row: number; col: number } | null = null;
      for (let r = 0; r < puzzle.gridSize; r++) {
        for (let c = 0; c < puzzle.gridSize; c++) {
          const tile = puzzle.tiles[r][c];
          if (tile.locked || tile.shape === 'blocker') continue;
          const currConns = getEffectiveConnections(tile.baseConnections, state.transforms[r]?.[c])
            .slice()
            .sort()
            .join(',');
          const solConns = getEffectiveConnections(tile.baseConnections, {
            rotation: tile.solutionRotation,
            flipped: tile.solutionFlipped,
          })
            .slice()
            .sort()
            .join(',');

          if (currConns !== solConns && tile.isSource) {
            targetCoord = { row: r, col: c };
            break;
          }
          if (currConns !== solConns && !targetCoord) {
            targetCoord = { row: r, col: c };
          }
        }
      }

      if (!targetCoord) {
        return {
          valid: false,
          isComplete: false,
          isCorrect: false,
          mistakeMade: false,
          nextState: state,
          feedbackMessage: 'All primary conduit tiles are already aligned with a valid solution.',
        };
      }

      const nextTransforms = cloneTransforms(state.transforms);
      const hintTile = puzzle.tiles[targetCoord.row][targetCoord.col];
      nextTransforms[targetCoord.row][targetCoord.col] = {
        rotation: hintTile.solutionRotation,
        flipped: hintTile.solutionFlipped,
      };

      const trace = traceEnergizedNetwork(puzzle, nextTransforms);
      const isComplete =
        trace.isConnectedToSink &&
        trace.allWaypointsEnergized &&
        trace.checkpointOrderValid &&
        trace.arrowConstraintsValid;

      const feedback = isComplete
        ? `Hint aligned tile (${targetCoord.row + 1}, ${targetCoord.col + 1}) and completed the circuit!`
        : `Hint aligned conduit tile at Row ${targetCoord.row + 1}, Column ${targetCoord.col + 1}.`;

      return {
        valid: true,
        isComplete,
        isCorrect: isComplete,
        mistakeMade: false,
        nextState: {
          ...state,
          transforms: nextTransforms,
          history: [...state.history, cloneTransforms(state.transforms)],
          energizedCoords: trace.energizedCoords,
          isConnectedToSink: trace.isConnectedToSink,
          allWaypointsEnergized: trace.allWaypointsEnergized,
          checkpointOrderValid: trace.checkpointOrderValid,
          arrowConstraintsValid: trace.arrowConstraintsValid,
          hasClosedLoop: trace.hasClosedLoop,
          movesCount: state.movesCount + 1,
          hintsUsedCount: state.hintsUsedCount + 1,
          lastHintCoord: targetCoord,
          lastFeedback: feedback,
        },
        feedbackMessage: feedback,
      };
    }

    const { row, col } = action;
    if (row < 0 || row >= puzzle.gridSize || col < 0 || col >= puzzle.gridSize) {
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState: state,
        feedbackMessage: 'Invalid tile coordinates.',
      };
    }

    const tile = puzzle.tiles[row][col];
    if (tile.shape === 'blocker') {
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: true,
        nextState: {
          ...state,
          lockedAttemptsCount: state.lockedAttemptsCount + 1,
          lastFeedback: 'Blocked cells cannot conduct signals or rotate.',
        },
        feedbackMessage: 'Blocked cells cannot conduct signals or rotate.',
      };
    }

    if (tile.locked) {
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: true,
        nextState: {
          ...state,
          lockedAttemptsCount: state.lockedAttemptsCount + 1,
          lastFeedback: 'Locked anchor tiles have fixed orientation and cannot be rotated or flipped.',
        },
        feedbackMessage: 'Locked anchor tiles have fixed orientation and cannot be rotated or flipped.',
      };
    }

    const nextTransforms = cloneTransforms(state.transforms);
    const current = nextTransforms[row][col];

    let rotationsDelta = 0;
    let flipsDelta = 0;

    if (action.type === 'rotate-tile') {
      if (typeof action.targetRotation === 'number') {
        current.rotation = ((action.targetRotation % 360) + 360) % 360;
      } else {
        const step = tile.rotationStep || 90;
        const delta = step === 180 ? 180 : action.clockwise === false ? 270 : 90;
        current.rotation = (current.rotation + delta) % 360;
      }
      if (action.alignFlip) {
        current.flipped = tile.solutionFlipped;
      }
      rotationsDelta = 1;
    } else if (action.type === 'flip-tile') {
      current.flipped = !current.flipped;
      flipsDelta = 1;
    }

    const trace = traceEnergizedNetwork(puzzle, nextTransforms);
    const isComplete =
      trace.isConnectedToSink &&
      trace.allWaypointsEnergized &&
      trace.checkpointOrderValid &&
      trace.arrowConstraintsValid;

    let feedback = `Tile (${row + 1}, ${col + 1}) rotated to ${current.rotation}°${current.flipped ? ' [Flipped]' : ''}. ${trace.energizedCoords.length} tile(s) energized.`;

    if (!trace.arrowConstraintsValid) {
      feedback = 'Warning: Signal violates a One-Way Directional Arrow constraint!';
    } else if (trace.isConnectedToSink && !trace.allWaypointsEnergized) {
      feedback = 'Sink reached, but one or more Relay Checkpoints are bypassed! Route through all checkpoints.';
    } else if (trace.isConnectedToSink && !trace.checkpointOrderValid) {
      feedback = 'Sink reached, but Ordered Checkpoints were visited out of sequence (#1 must precede #2)!';
    } else if (!trace.isConnectedToSink && trace.hasClosedLoop) {
      feedback = 'Closed loop detected! Redirect the branch toward the Sink (OUT) terminal.';
    } else if (isComplete) {
      feedback = 'Circuit complete! Source, Checkpoints, One-Way Arrows, and Sink are validly connected.';
    }

    const nextState: PathRotationState = {
      ...state,
      transforms: nextTransforms,
      history: [...state.history, cloneTransforms(state.transforms)],
      energizedCoords: trace.energizedCoords,
      isConnectedToSink: trace.isConnectedToSink,
      allWaypointsEnergized: trace.allWaypointsEnergized,
      checkpointOrderValid: trace.checkpointOrderValid,
      arrowConstraintsValid: trace.arrowConstraintsValid,
      hasClosedLoop: trace.hasClosedLoop,
      movesCount: state.movesCount + 1,
      rotationsCount: state.rotationsCount + rotationsDelta,
      flipsCount: state.flipsCount + flipsDelta,
      lastHintCoord: null,
      lastFeedback: feedback,
    };

    return {
      valid: true,
      isComplete,
      isCorrect: isComplete,
      mistakeMade: !trace.arrowConstraintsValid,
      nextState,
      feedbackMessage: feedback,
    };
  },

  isPuzzleComplete(_puzzle: PathRotationPuzzle, state: PathRotationState): boolean {
    return (
      state.isConnectedToSink &&
      state.allWaypointsEnergized &&
      state.checkpointOrderValid &&
      state.arrowConstraintsValid
    );
  },

  calculateQuestionResult({ metadata, puzzle, finalState, elapsedMs, timedOut }): QuestionResult {
    const isCorrect = !timedOut && this.isPuzzleComplete(puzzle, finalState);
    const partialCredit = isCorrect
      ? 1
      : Math.min(0.75, finalState.energizedCoords.length / (puzzle.gridSize * puzzle.gridSize));
    const timeLimitMs = metadata.timeLimitSeconds * 1000;

    const excessMoves = Math.max(
      0,
      Math.floor((finalState.movesCount - Math.max(puzzle.optimalMoves + 3, puzzle.gridSize * 2)) / 3)
    );
    const penaltyCount = excessMoves + finalState.hintsUsedCount;

    const scoreBreakdown = computeQuestionScore({
      isCorrect,
      partialCredit,
      difficulty: metadata.difficulty,
      elapsedMs,
      timeLimitMs,
      mistakesCount: penaltyCount,
    });

    let routeQuality: RouteQualityClassification = 'invalid-disconnected';
    if (isCorrect) {
      if (finalState.movesCount <= puzzle.optimalMoves + 1 && finalState.hintsUsedCount === 0) {
        routeQuality = 'minimum-rotation-optimal';
      } else if (finalState.movesCount <= puzzle.optimalMoves + 4) {
        routeQuality = 'shortest-valid-route';
      } else {
        routeQuality = 'valid-non-optimal';
      }
    }

    let errorCategory: CognitiveErrorCategory = 'none';
    if (!isCorrect) {
      if (!finalState.arrowConstraintsValid) {
        errorCategory = 'directional-arrow-violation';
      } else if (finalState.isConnectedToSink && (!finalState.allWaypointsEnergized || !finalState.checkpointOrderValid)) {
        errorCategory = 'bypassed-checkpoint';
      } else if (finalState.lockedAttemptsCount > 0) {
        errorCategory = 'locked-tile-attempt';
      } else if (timedOut) {
        errorCategory = 'timeout-incomplete';
      } else {
        errorCategory = 'disconnected-conduit';
      }
    } else if (routeQuality === 'valid-non-optimal') {
      errorCategory = 'non-optimal-rotations';
    }

    return {
      puzzleId: metadata.puzzleId,
      gameType: 'path-rotation',
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
      mistakesCount: penaltyCount,
      hintsUsedCount: finalState.hintsUsedCount,
      rotationsCount: finalState.rotationsCount,
      flipsCount: finalState.flipsCount,
      routeQuality,
      errorCategory,
      summaryText: isCorrect
        ? `Connected ${puzzle.gridSize}×${puzzle.gridSize} circuit in ${finalState.movesCount} moves (optimal ~${puzzle.optimalMoves}, ${(elapsedMs / 1000).toFixed(1)}s)`
        : `Incomplete circuit (${finalState.energizedCoords.length} tiles energized, ${finalState.movesCount} moves)`,
    };
  },
};

export type PathFinderArrowSymbol = '↑' | '→' | '↓' | '←' | '↗' | '↘' | '↙' | '↖';

export interface PathFinderSubCell {
  active: boolean;
  arrow: PathFinderArrowSymbol | null;
}

export interface PathFinderPiece {
  id: string;
  homeRow: number;
  homeCol: number;
  isOnSolutionPath: boolean;
  locked: boolean; // true for padlock (🔒) or fixed obstacle (✕)
  isBlocker: boolean; // true for fixed obstacle (✕)
  isEmptySlot: boolean; // true for empty valid grid slots
  rotationDeg: number; // 0, 90, 180, 270
  subgrid: PathFinderSubCell[][]; // 3x3 local matrix rotated via new_row = c, new_col = (N - 1) - r
  lockedPorts: CardinalDir[]; // Active outer ports in current orientation
  activeEntry: CardinalDir | null; // Active flow entry side in current orientation
  activeExit: CardinalDir | null; // Active flow exit side in current orientation
  solvedPorts: CardinalDir[]; // Target ports in solved orientation
  solvedEntry: CardinalDir | null; // Target flow entry in solved orientation
  solvedExit: CardinalDir | null; // Target flow exit in solved orientation
  solvedSubgrid: PathFinderSubCell[][]; // Target 3x3 subgrid in solved orientation
  routeConfigs: Array<{ entry: CardinalDir; exit: CardinalDir }>;
  routeIndex: number;
}

export interface PathFinderBoardEvaluation {
  inEdgeSide: CardinalDir;
  outEdgeSide: CardinalDir;
  isGeometricallyConnected: boolean;
  isDirectionallyAligned: boolean;
  allWaypointsVisited: boolean;
  checkpointOrderValid: boolean;
  isSolved: boolean;
  energizedCoords: Array<{ row: number; col: number }>;
  geometricallyConnectedCoords: Array<{ row: number; col: number }>;
}

function oppositeDir(side: CardinalDir): CardinalDir {
  switch (side) {
    case 'N':
      return 'S';
    case 'S':
      return 'N';
    case 'W':
      return 'E';
    case 'E':
      return 'W';
  }
}

function rotateDirCW(side: CardinalDir, deg: number): CardinalDir {
  const order: CardinalDir[] = ['N', 'E', 'S', 'W'];
  const idx = order.indexOf(side);
  const steps = (((deg / 90) % 4) + 4) % 4;
  return order[(idx + steps) % 4];
}

/**
 * Rotates a directional arrow symbol 90° clockwise:
 * ↑ -> → -> ↓ -> ← -> ↑
 * ↗ -> ↘ -> ↙ -> ↖ -> ↗
 */
export function rotateArrowVector90CW(
  arrow: PathFinderArrowSymbol | null
): PathFinderArrowSymbol | null {
  if (!arrow) return null;
  switch (arrow) {
    case '↑':
      return '→';
    case '→':
      return '↓';
    case '↓':
      return '←';
    case '←':
      return '↑';
    case '↗':
      return '↘';
    case '↘':
      return '↙';
    case '↙':
      return '↖';
    case '↖':
      return '↗';
    default:
      return arrow;
  }
}

/**
 * Rotates an N x N local subgrid (N = 3) 90° clockwise using the exact matrix coordinate transformation:
 *   new_row = c
 *   new_col = (N - 1) - r
 * and rotates every arrow vector inside the rotated cells by 90° clockwise.
 */
export function rotateSubgridMatrix90CW(subgrid: PathFinderSubCell[][]): PathFinderSubCell[][] {
  const N = subgrid.length;
  const rotated: PathFinderSubCell[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => ({ active: false, arrow: null }))
  );

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cell = subgrid[r]?.[c];
      const newRow = c;
      const newCol = N - 1 - r;
      rotated[newRow][newCol] = {
        active: Boolean(cell?.active),
        arrow: rotateArrowVector90CW(cell?.arrow ?? null),
      };
    }
  }

  return rotated;
}

function buildInitial3x3Subgrid(
  ports: CardinalDir[],
  entry: CardinalDir | null,
  exit: CardinalDir | null
): PathFinderSubCell[][] {
  const grid: PathFinderSubCell[][] = Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => ({ active: false, arrow: null }))
  );

  if (ports.length === 0 || !entry || !exit) {
    return grid;
  }

  const sideCoord: Record<CardinalDir, { r: number; c: number }> = {
    N: { r: 0, c: 1 },
    E: { r: 1, c: 2 },
    S: { r: 2, c: 1 },
    W: { r: 1, c: 0 },
  };

  const inwardArrow: Record<CardinalDir, PathFinderArrowSymbol> = {
    N: '↓',
    E: '←',
    S: '↑',
    W: '→',
  };

  const outwardArrow: Record<CardinalDir, PathFinderArrowSymbol> = {
    N: '↑',
    E: '→',
    S: '↓',
    W: '←',
  };

  // Center arrow: straight if entry and exit are opposite, diagonal if turning 90°
  const computeCenterArrow = (
    en: CardinalDir,
    ex: CardinalDir
  ): PathFinderArrowSymbol => {
    if (oppositeDir(en) === ex) {
      return outwardArrow[ex];
    }
    const pair = `${en}->${ex}`;
    switch (pair) {
      case 'W->S':
      case 'N->E':
        return '↘';
      case 'N->W':
      case 'E->S':
        return '↙';
      case 'E->N':
      case 'S->W':
        return '↖';
      case 'S->E':
      case 'W->N':
        return '↗';
      default:
        return outwardArrow[ex];
    }
  };

  // Activate center cell
  grid[1][1] = {
    active: true,
    arrow: computeCenterArrow(entry, exit),
  };

  // Activate entry port cell
  const enPos = sideCoord[entry];
  grid[enPos.r][enPos.c] = {
    active: true,
    arrow: inwardArrow[entry],
  };

  // Activate exit port cell
  const exPos = sideCoord[exit];
  grid[exPos.r][exPos.c] = {
    active: true,
    arrow: outwardArrow[exit],
  };

  // Activate any extra branch ports (for T-junctions)
  for (const p of ports) {
    if (p !== entry && p !== exit) {
      const pos = sideCoord[p];
      grid[pos.r][pos.c] = {
        active: true,
        arrow: outwardArrow[p],
      };
    }
  }

  return grid;
}

/**
 * Pure immutable 90° clockwise rotation of a single PathFinderPiece.
 * Updates its 3x3 subgrid matrix (new_row = c, new_col = 2 - r), arrow vectors,
 * outer ports, and entry/exit flow vectors.
 */
export function rotatePathFinderPiece90CW(piece: PathFinderPiece): PathFinderPiece {
  if (piece.locked || piece.isBlocker || piece.isEmptySlot) {
    return clonePathFinderPiece(piece);
  }

  const rotatedSubgrid = rotateSubgridMatrix90CW(piece.subgrid);
  const rotatedPorts = piece.lockedPorts.map((p) => rotateDirCW(p, 90));
  const rotatedEntry = piece.activeEntry ? rotateDirCW(piece.activeEntry, 90) : null;
  const rotatedExit = piece.activeExit ? rotateDirCW(piece.activeExit, 90) : null;
  const nextRotationDeg = (piece.rotationDeg + 90) % 360;

  const rotatedConfigs = piece.routeConfigs.map((rc) => ({
    entry: rotateDirCW(rc.entry, 90),
    exit: rotateDirCW(rc.exit, 90),
  }));

  return {
    ...piece,
    rotationDeg: nextRotationDeg,
    subgrid: rotatedSubgrid,
    lockedPorts: rotatedPorts,
    activeEntry: rotatedEntry,
    activeExit: rotatedExit,
    solvedPorts: [...piece.solvedPorts],
    solvedSubgrid: piece.solvedSubgrid.map((row) => row.map((cell) => ({ ...cell }))),
    routeConfigs: rotatedConfigs,
    routeIndex: piece.routeIndex,
  };
}

export function clonePathFinderPiece(piece: PathFinderPiece): PathFinderPiece {
  return {
    ...piece,
    subgrid: piece.subgrid.map((row) => row.map((cell) => ({ ...cell }))),
    lockedPorts: [...piece.lockedPorts],
    solvedPorts: [...piece.solvedPorts],
    solvedSubgrid: piece.solvedSubgrid.map((row) => row.map((cell) => ({ ...cell }))),
    routeConfigs: piece.routeConfigs.map((rc) => ({ ...rc })),
  };
}

export function clonePathFinderBoard(board: PathFinderPiece[][]): PathFinderPiece[][] {
  return board.map((row) => row.map((piece) => clonePathFinderPiece(piece)));
}

export function getPortalEdgeSides(puzzle: PathRotationPuzzle): {
  inEdgeSide: CardinalDir;
  outEdgeSide: CardinalDir;
} {
  const n = puzzle.gridSize;
  const sc = puzzle.sourceCoord;
  const sk = puzzle.sinkCoord;
  const inEdgeSide: CardinalDir =
    sc.col === 0 ? 'W' : sc.row === 0 ? 'N' : sc.col === n - 1 ? 'E' : 'W';
  const outEdgeSide: CardinalDir =
    sk.row === n - 1 ? 'S' : sk.col === n - 1 ? 'E' : sk.row === 0 ? 'N' : 'S';
  return { inEdgeSide, outEdgeSide };
}

export function hasSubgridMatchingRoute(
  subgrid: PathFinderSubCell[][],
  ports: CardinalDir[],
  entry: CardinalDir | null,
  exit: CardinalDir | null
): boolean {
  if (!entry || !exit || ports.length === 0) return false;
  const expected = buildInitial3x3Subgrid(ports, entry, exit);
  const sideCoord: Record<CardinalDir, { r: number; c: number }> = {
    N: { r: 0, c: 1 },
    E: { r: 1, c: 2 },
    S: { r: 2, c: 1 },
    W: { r: 1, c: 0 },
  };
  const enPos = sideCoord[entry];
  const exPos = sideCoord[exit];
  return (
    subgrid[enPos.r]?.[enPos.c]?.arrow === expected[enPos.r]?.[enPos.c]?.arrow &&
    subgrid[1]?.[1]?.arrow === expected[1]?.[1]?.arrow &&
    subgrid[exPos.r]?.[exPos.c]?.arrow === expected[exPos.r]?.[exPos.c]?.arrow
  );
}

/**
 * Pure immutable function that changes/reverses ONLY the internal arrows inside a PathFinderPiece
 * while keeping its outer physical gray shape (lockedPorts) and rotation angle (rotationDeg) unchanged.
 */
export function reversePathFinderPieceArrows(piece: PathFinderPiece): PathFinderPiece {
  if (piece.locked || piece.isBlocker || piece.isEmptySlot || !piece.activeEntry || !piece.activeExit) {
    return clonePathFinderPiece(piece);
  }

  const nextRouteIndex =
    piece.routeConfigs.length > 0 ? (piece.routeIndex + 1) % piece.routeConfigs.length : 0;
  const nextRoute =
    piece.routeConfigs.length > 0
      ? piece.routeConfigs[nextRouteIndex]
      : { entry: piece.activeExit, exit: piece.activeEntry };

  const nextSubgrid = buildInitial3x3Subgrid(piece.lockedPorts, nextRoute.entry, nextRoute.exit);

  return {
    ...clonePathFinderPiece(piece),
    subgrid: nextSubgrid,
    activeEntry: nextRoute.entry,
    activeExit: nextRoute.exit,
    routeIndex: nextRouteIndex,
  };
}

/**
 * Evaluates both layers of the Path Finder puzzle:
 * 1. Continuous Geometric Connection: Physical gray polyomino ports connect IN to OUT (and any checkpoints).
 * 2. Consistent Arrow Vectors: Internal arrows flow continuously forward from IN -> to OUT v without opposing vectors.
 */
export function evaluatePathFinderBoard(
  puzzle: PathRotationPuzzle,
  board: PathFinderPiece[][]
): PathFinderBoardEvaluation {
  const n = puzzle.gridSize;
  const { inEdgeSide, outEdgeSide } = getPortalEdgeSides(puzzle);
  const sc = puzzle.sourceCoord;
  const sk = puzzle.sinkCoord;

  const deltas: Array<{ side: CardinalDir; dr: number; dc: number }> = [
    { side: 'N', dr: -1, dc: 0 },
    { side: 'E', dr: 0, dc: 1 },
    { side: 'S', dr: 1, dc: 0 },
    { side: 'W', dr: 0, dc: -1 },
  ];

  // 1. Check Geometric Connectivity (Physical gray path segments from IN to OUT)
  const geometricallyConnectedCoords: Array<{ row: number; col: number }> = [];
  const geoVisited = new Set<string>();
  const sourcePiece = board[sc.row]?.[sc.col];
  const sinkPiece = board[sk.row]?.[sk.col];

  if (
    sourcePiece &&
    !sourcePiece.isBlocker &&
    !sourcePiece.isEmptySlot &&
    sourcePiece.lockedPorts.includes(inEdgeSide)
  ) {
    const queue: Array<{ row: number; col: number }> = [{ row: sc.row, col: sc.col }];
    geoVisited.add(`${sc.row},${sc.col}`);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      geometricallyConnectedCoords.push(curr);
      const currPiece = board[curr.row]?.[curr.col];
      if (!currPiece) continue;

      for (const { side, dr, dc } of deltas) {
        if (!currPiece.lockedPorts.includes(side)) continue;
        const nr = curr.row + dr;
        const nc = curr.col + dc;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        const neighborPiece = board[nr]?.[nc];
        if (!neighborPiece || neighborPiece.isBlocker || neighborPiece.isEmptySlot) continue;
        if (!neighborPiece.lockedPorts.includes(oppositeDir(side))) continue;

        const key = `${nr},${nc}`;
        if (!geoVisited.has(key)) {
          geoVisited.add(key);
          queue.push({ row: nr, col: nc });
        }
      }
    }
  }

  const sinkReachedGeometrically =
    geoVisited.has(`${sk.row},${sk.col}`) &&
    Boolean(sinkPiece && sinkPiece.lockedPorts.includes(outEdgeSide));

  const allWaypointsGeometricallyConnected = puzzle.waypointCoords.every((wp) =>
    geoVisited.has(`${wp.row},${wp.col}`)
  );

  const isGeometricallyConnected =
    sinkReachedGeometrically && allWaypointsGeometricallyConnected;

  // 2. Check Directional Arrow Vector Alignment (Continuous forward arrows from IN -> to OUT)
  const energizedCoords: Array<{ row: number; col: number }> = [];
  const dirVisited = new Set<string>();
  let reachedSinkWithValidArrows = false;

  if (
    sourcePiece &&
    !sourcePiece.isBlocker &&
    !sourcePiece.isEmptySlot &&
    sourcePiece.activeEntry &&
    sourcePiece.activeExit &&
    hasSubgridMatchingRoute(
      sourcePiece.subgrid,
      sourcePiece.lockedPorts,
      sourcePiece.activeEntry,
      sourcePiece.activeExit
    )
  ) {
    if (
      sourcePiece.lockedPorts.includes(inEdgeSide) &&
      sourcePiece.activeEntry === inEdgeSide
    ) {
      let curr = { row: sc.row, col: sc.col };
      while (true) {
        const key = `${curr.row},${curr.col}`;
        if (dirVisited.has(key)) break;

        const piece = board[curr.row]?.[curr.col];
        if (
          !piece ||
          !piece.activeEntry ||
          !piece.activeExit ||
          !hasSubgridMatchingRoute(
            piece.subgrid,
            piece.lockedPorts,
            piece.activeEntry,
            piece.activeExit
          )
        ) {
          break;
        }

        dirVisited.add(key);
        energizedCoords.push({ row: curr.row, col: curr.col });

        if (
          curr.row === sk.row &&
          curr.col === sk.col &&
          piece.activeExit === outEdgeSide &&
          piece.lockedPorts.includes(outEdgeSide)
        ) {
          reachedSinkWithValidArrows = true;
          break;
        }

        const stepDelta = deltas.find((d) => d.side === piece.activeExit);
        if (!stepDelta || !piece.lockedPorts.includes(piece.activeExit)) break;

        const nr = curr.row + stepDelta.dr;
        const nc = curr.col + stepDelta.dc;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) break;

        const nextPiece = board[nr]?.[nc];
        if (
          !nextPiece ||
          nextPiece.isBlocker ||
          nextPiece.isEmptySlot ||
          !nextPiece.activeEntry ||
          !nextPiece.activeExit ||
          !hasSubgridMatchingRoute(
            nextPiece.subgrid,
            nextPiece.lockedPorts,
            nextPiece.activeEntry,
            nextPiece.activeExit
          )
        ) {
          break;
        }

        const requiredEntry = oppositeDir(piece.activeExit);
        if (
          !nextPiece.lockedPorts.includes(requiredEntry) ||
          nextPiece.activeEntry !== requiredEntry
        ) {
          break;
        }

        curr = { row: nr, col: nc };
      }
    }
  }

  const allWaypointsVisited = puzzle.waypointCoords.every((wp) =>
    dirVisited.has(`${wp.row},${wp.col}`)
  );

  let checkpointOrderValid = true;
  if (puzzle.orderedCheckpoints && puzzle.waypointCoords.length > 1) {
    const orderedWps = [...puzzle.waypointCoords].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    let lastIdx = -1;
    for (const wp of orderedWps) {
      const idx = energizedCoords.findIndex((c) => c.row === wp.row && c.col === wp.col);
      if (idx === -1 || idx < lastIdx) {
        checkpointOrderValid = false;
        break;
      }
      lastIdx = idx;
    }
  }

  const isDirectionallyAligned =
    reachedSinkWithValidArrows && allWaypointsVisited && checkpointOrderValid;

  return {
    inEdgeSide,
    outEdgeSide,
    isGeometricallyConnected,
    isDirectionallyAligned,
    allWaypointsVisited,
    checkpointOrderValid,
    isSolved: isGeometricallyConnected && isDirectionallyAligned,
    energizedCoords,
    geometricallyConnectedCoords,
  };
}

/**
 * Builds the solved canonical pieces for a PathRotationPuzzle and scrambles unlocked pieces
 * IN PLACE within their own grid cells (no cross-cell piece swapping and no blank white slots):
 * 1. Every non-blocker grid cell contains a rotatable path piece at its own (homeRow = r, homeCol = c).
 * 2. Unlocked pieces on the solution path have their internal arrows reversed AND are rotated 90° or 270° CW,
 *    so the player both rotates path pieces to align the physical path and changes the internal arrows inside
 *    the path pieces to align arrow flow from IN to OUT.
 */
export function createScrambledPathFinderBoard(
  puzzle: PathRotationPuzzle,
  seedOverride?: string
): {
  solvedBoard: PathFinderPiece[][];
  initialBoard: PathFinderPiece[][];
} {
  const n = puzzle.gridSize;
  const { inEdgeSide, outEdgeSide } = getPortalEdgeSides(puzzle);

  const solSidesGrid: CardinalDir[][][] = puzzle.tiles.map((rowTiles) =>
    rowTiles.map((tile) =>
      getEffectiveConnections(tile.baseConnections, {
        rotation: tile.solutionRotation,
        flipped: tile.solutionFlipped,
      })
    )
  );

  // Reconstruct continuous solved path from sourceCoord -> sinkCoord
  const visited = new Set<string>();
  const parentMap = new Map<string, { row: number; col: number }>();
  const queue: Array<{ row: number; col: number }> = [{ ...puzzle.sourceCoord }];
  visited.add(`${puzzle.sourceCoord.row},${puzzle.sourceCoord.col}`);

  const deltas: Array<{ side: CardinalDir; dr: number; dc: number }> = [
    { side: 'N', dr: -1, dc: 0 },
    { side: 'E', dr: 0, dc: 1 },
    { side: 'S', dr: 1, dc: 0 },
    { side: 'W', dr: 0, dc: -1 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.row === puzzle.sinkCoord.row && curr.col === puzzle.sinkCoord.col) break;
    const currSides = solSidesGrid[curr.row]?.[curr.col] ?? [];
    for (const { side, dr, dc } of deltas) {
      if (!currSides.includes(side)) continue;
      const nr = curr.row + dr;
      const nc = curr.col + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      const neighborSides = solSidesGrid[nr]?.[nc] ?? [];
      if (!neighborSides.includes(oppositeDir(side))) continue;
      const key = `${nr},${nc}`;
      if (!visited.has(key)) {
        visited.add(key);
        parentMap.set(key, curr);
        queue.push({ row: nr, col: nc });
      }
    }
  }

  const solvedPath: Array<{ row: number; col: number }> = [];
  let traceCurr: { row: number; col: number } | undefined = { ...puzzle.sinkCoord };
  while (traceCurr) {
    solvedPath.unshift(traceCurr);
    traceCurr = parentMap.get(`${traceCurr.row},${traceCurr.col}`);
  }

  const pathIndexMap = new Map<string, number>();
  solvedPath.forEach((coord, idx) => {
    pathIndexMap.set(`${coord.row},${coord.col}`, idx);
  });

  const allSides: CardinalDir[] = ['N', 'E', 'S', 'W'];
  const empty3x3 = buildInitial3x3Subgrid([], null, null);

  // Construct canonical solved board where every piece is in its 0° solved orientation in its own cell
  const solvedBoard: PathFinderPiece[][] = puzzle.tiles.map((rowTiles, r) =>
    rowTiles.map((tile, c) => {
      if (tile.shape === 'blocker') {
        return {
          id: `piece-${r}-${c}`,
          homeRow: r,
          homeCol: c,
          isOnSolutionPath: false,
          locked: true,
          isBlocker: true,
          isEmptySlot: false,
          rotationDeg: 0,
          subgrid: empty3x3.map((row) => row.map((cell) => ({ ...cell }))),
          lockedPorts: [],
          activeEntry: null,
          activeExit: null,
          solvedPorts: [],
          solvedEntry: null,
          solvedExit: null,
          solvedSubgrid: empty3x3.map((row) => row.map((cell) => ({ ...cell }))),
          routeConfigs: [],
          routeIndex: 0,
        };
      }

      const pathIdx = pathIndexMap.get(`${r},${c}`);
      if (pathIdx !== undefined && solvedPath.length >= 2) {
        let solEntry: CardinalDir = inEdgeSide;
        let solExit: CardinalDir = outEdgeSide;

        if (pathIdx === 0) {
          const nextCoord = solvedPath[1];
          const toNext: CardinalDir =
            nextCoord.row < r
              ? 'N'
              : nextCoord.row > r
              ? 'S'
              : nextCoord.col < c
              ? 'W'
              : 'E';
          solExit = toNext;
          solEntry = inEdgeSide !== toNext ? inEdgeSide : oppositeDir(toNext);
        } else if (pathIdx === solvedPath.length - 1) {
          const prevCoord = solvedPath[pathIdx - 1];
          const fromPrev: CardinalDir =
            prevCoord.row < r
              ? 'N'
              : prevCoord.row > r
              ? 'S'
              : prevCoord.col < c
              ? 'W'
              : 'E';
          solEntry = fromPrev;
          solExit = outEdgeSide !== fromPrev ? outEdgeSide : oppositeDir(fromPrev);
        } else {
          const prevCoord = solvedPath[pathIdx - 1];
          const nextCoord = solvedPath[pathIdx + 1];
          solEntry =
            prevCoord.row < r
              ? 'N'
              : prevCoord.row > r
              ? 'S'
              : prevCoord.col < c
              ? 'W'
              : 'E';
          solExit =
            nextCoord.row < r
              ? 'N'
              : nextCoord.row > r
              ? 'S'
              : nextCoord.col < c
              ? 'W'
              : 'E';
        }

        if (solEntry === solExit) {
          solExit = oppositeDir(solEntry);
        }

        const portSet = new Set<CardinalDir>([solEntry, solExit]);
        if (!tile.locked && tile.shape === 'tee') {
          const extra = allSides.find((s) => !portSet.has(s));
          if (extra) portSet.add(extra);
        }

        const solvedPorts = Array.from(portSet);
        const solvedSubgrid = buildInitial3x3Subgrid(solvedPorts, solEntry, solExit);

        return {
          id: `piece-${r}-${c}`,
          homeRow: r,
          homeCol: c,
          isOnSolutionPath: true,
          locked: tile.locked,
          isBlocker: false,
          isEmptySlot: false,
          rotationDeg: 0,
          subgrid: solvedSubgrid.map((row) => row.map((cell) => ({ ...cell }))),
          lockedPorts: [...solvedPorts],
          activeEntry: solEntry,
          activeExit: solExit,
          solvedPorts: [...solvedPorts],
          solvedEntry: solEntry,
          solvedExit: solExit,
          solvedSubgrid: solvedSubgrid.map((row) => row.map((cell) => ({ ...cell }))),
          routeConfigs: [
            { entry: solEntry, exit: solExit },
            { entry: solExit, exit: solEntry },
          ],
          routeIndex: 0,
        };
      }

      // Off-path unlocked cell: always populate with an in-place rotatable path piece (never an empty white slot)
      const decoyPortOptions: CardinalDir[][] = [
        ['N', 'W'],
        ['N', 'E'],
        ['S', 'E'],
        ['S', 'W'],
        ['W', 'E'],
        ['N', 'S'],
      ];
      const decoyPorts = decoyPortOptions[(r * n + c) % decoyPortOptions.length];
      const decoySubgrid = buildInitial3x3Subgrid(decoyPorts, decoyPorts[0], decoyPorts[1]);
      return {
        id: `piece-${r}-${c}`,
        homeRow: r,
        homeCol: c,
        isOnSolutionPath: false,
        locked: tile.locked,
        isBlocker: false,
        isEmptySlot: false,
        rotationDeg: 0,
        subgrid: decoySubgrid.map((row) => row.map((cell) => ({ ...cell }))),
        lockedPorts: [...decoyPorts],
        activeEntry: decoyPorts[0],
        activeExit: decoyPorts[1],
        solvedPorts: [...decoyPorts],
        solvedEntry: decoyPorts[0],
        solvedExit: decoyPorts[1],
        solvedSubgrid: decoySubgrid.map((row) => row.map((cell) => ({ ...cell }))),
        routeConfigs: [
          { entry: decoyPorts[0], exit: decoyPorts[1] },
          { entry: decoyPorts[1], exit: decoyPorts[0] },
        ],
        routeIndex: 0,
      };
    })
  );

  const rng = new SeededRandom(
    seedOverride ||
      `PF-ROT-${n}-${puzzle.sourceCoord.row},${puzzle.sourceCoord.col}-${puzzle.sinkCoord.row},${puzzle.sinkCoord.col}-${solvedPath.length}`
  );

  // Scramble unlocked pieces in-place (keeping each piece in its own grid cell):
  // - Reverse internal arrows on unlocked solution-path pieces so that even after rotating pieces into
  //   physical alignment, the player can/must also flip internal arrows inside the pieces.
  // - Rotate unlocked pieces by 90° or 270° clockwise so the physical gray path is broken at start.
  const initialBoard = clonePathFinderBoard(solvedBoard);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const piece = initialBoard[r][c];
      if (piece.locked || piece.isBlocker || piece.isEmptySlot) continue;

      let scrambled = piece;
      if (piece.isOnSolutionPath && (r + c) % 2 === 0) {
        scrambled = reversePathFinderPieceArrows(scrambled);
      }

      const turnOptions = [1, 3];
      const quarterTurns = turnOptions[(r * n + c + rng.nextInt(0, 1)) % 2];
      for (let t = 0; t < quarterTurns; t++) {
        scrambled = rotatePathFinderPiece90CW(scrambled);
      }
      initialBoard[r][c] = scrambled;
    }
  }

  // Ensure at least one unlocked solution-path piece has reversed internal arrows
  const unlockedSolutionCoords: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = initialBoard[r][c];
      if (!p.locked && !p.isBlocker && p.isOnSolutionPath) {
        unlockedSolutionCoords.push({ row: r, col: c });
      }
    }
  }
  if (
    unlockedSolutionCoords.length > 0 &&
    unlockedSolutionCoords.every(
      ({ row, col }) => initialBoard[row][col].routeIndex === 0
    )
  ) {
    const first = unlockedSolutionCoords[0];
    initialBoard[first.row][first.col] = reversePathFinderPieceArrows(
      initialBoard[first.row][first.col]
    );
  }

  return { solvedBoard, initialBoard };
}

/**
 * Rotates the unlocked piece at (row, col) 90° clockwise in-place on a new cloned board.
 * Locked tiles (🔒) and fixed obstacles (✕) cannot be rotated.
 */
export function rotatePathFinderPieceAt(
  board: PathFinderPiece[][],
  row: number,
  col: number
): { rotated: boolean; nextBoard: PathFinderPiece[][] } {
  const piece = board[row]?.[col];
  if (!piece || piece.locked || piece.isBlocker || piece.isEmptySlot) {
    return { rotated: false, nextBoard: board };
  }

  const nextBoard = clonePathFinderBoard(board);
  nextBoard[row][col] = rotatePathFinderPiece90CW(nextBoard[row][col]);
  return { rotated: true, nextBoard };
}

/**
 * Changes/flips ONLY the internal arrows inside the unlocked piece at (row, col)
 * without rotating the whole path piece (keeping rotationDeg and lockedPorts unchanged).
 */
export function cyclePathFinderPieceArrows(
  board: PathFinderPiece[][],
  row: number,
  col: number
): { cycled: boolean; nextBoard: PathFinderPiece[][] } {
  const piece = board[row]?.[col];
  if (!piece || piece.locked || piece.isBlocker || piece.isEmptySlot) {
    return { cycled: false, nextBoard: board };
  }

  const nextBoard = clonePathFinderBoard(board);
  nextBoard[row][col] = reversePathFinderPieceArrows(nextBoard[row][col]);
  return { cycled: true, nextBoard };
}

/**
 * Rotates a single internal arrow at subcell (subRow, subCol) inside the piece at (row, col)
 * by 90° clockwise without rotating the path piece itself. If the updated 3x3 subgrid arrows
 * match a valid flow route through the piece's ports, syncs activeEntry and activeExit.
 */
export function rotateSingleSubcellArrowAt(
  board: PathFinderPiece[][],
  row: number,
  col: number,
  subRow: number,
  subCol: number
): { rotated: boolean; nextBoard: PathFinderPiece[][] } {
  const piece = board[row]?.[col];
  if (!piece || piece.locked || piece.isBlocker || piece.isEmptySlot) {
    return { rotated: false, nextBoard: board };
  }
  const subCell = piece.subgrid[subRow]?.[subCol];
  if (!subCell || !subCell.active || !subCell.arrow) {
    return { rotated: false, nextBoard: board };
  }

  const nextBoard = clonePathFinderBoard(board);
  const nextPiece = nextBoard[row][col];
  nextPiece.subgrid[subRow][subCol] = {
    ...subCell,
    arrow: rotateArrowVector90CW(subCell.arrow),
  };

  // Check if the updated subgrid arrows now match any route in routeConfigs
  for (let i = 0; i < nextPiece.routeConfigs.length; i++) {
    const rc = nextPiece.routeConfigs[i];
    if (hasSubgridMatchingRoute(nextPiece.subgrid, nextPiece.lockedPorts, rc.entry, rc.exit)) {
      nextPiece.activeEntry = rc.entry;
      nextPiece.activeExit = rc.exit;
      nextPiece.routeIndex = i;
      break;
    }
  }

  return { rotated: true, nextBoard };
}

/**
 * Swaps two unlocked pieces on the Path Finder board.
 */
export function swapPathFinderPieces(
  board: PathFinderPiece[][],
  coordA: { row: number; col: number },
  coordB: { row: number; col: number }
): { swapped: boolean; nextBoard: PathFinderPiece[][] } {
  if (coordA.row === coordB.row && coordA.col === coordB.col) {
    return { swapped: false, nextBoard: board };
  }
  const pieceA = board[coordA.row]?.[coordA.col];
  const pieceB = board[coordB.row]?.[coordB.col];
  if (!pieceA || !pieceB || pieceA.locked || pieceB.locked || pieceA.isBlocker || pieceB.isBlocker) {
    return { swapped: false, nextBoard: board };
  }

  const nextBoard = clonePathFinderBoard(board);
  nextBoard[coordA.row][coordA.col] = clonePathFinderPiece(pieceB);
  nextBoard[coordB.row][coordB.col] = clonePathFinderPiece(pieceA);

  return { swapped: true, nextBoard };
}

/**
 * Applies a practice hint to the Path Finder board:
 * 1. If any unlocked solution-path piece is displaced from its home (homeRow, homeCol),
 *    restores it back into (homeRow, homeCol) and aligns its rotation and internal arrows.
 * 2. Otherwise finds the next unlocked solution-path piece whose rotation (0°) or internal arrows
 *    are not yet aligned with its solved state, and aligns it.
 */
export function applyPathFinderHint(
  board: PathFinderPiece[][]
): { applied: boolean; hintCoord: { row: number; col: number } | null; nextBoard: PathFinderPiece[][] } {
  const n = board.length;
  const nextBoard = clonePathFinderBoard(board);

  const alignToSolved = (p: PathFinderPiece): PathFinderPiece => {
    const solvedSubgridClone = p.solvedSubgrid.map((row) => row.map((cell) => ({ ...cell })));
    return {
      ...clonePathFinderPiece(p),
      rotationDeg: 0,
      lockedPorts: [...p.solvedPorts],
      activeEntry: p.solvedEntry,
      activeExit: p.solvedExit,
      subgrid: solvedSubgridClone,
      routeConfigs:
        p.solvedEntry && p.solvedExit
          ? [
              { entry: p.solvedEntry, exit: p.solvedExit },
              { entry: p.solvedExit, exit: p.solvedEntry },
            ]
          : [],
      routeIndex: 0,
    };
  };

  // Step 1: Restore any displaced solution-path piece back to its (homeRow, homeCol) and align it
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const piece = nextBoard[r][c];
      if (piece.locked || piece.isBlocker || !piece.isOnSolutionPath) continue;
      if (piece.homeRow !== r || piece.homeCol !== c) {
        const targetR = piece.homeRow;
        const targetC = piece.homeCol;
        const occupant = nextBoard[targetR][targetC];
        nextBoard[targetR][targetC] = alignToSolved(piece);
        nextBoard[r][c] = occupant;
        return { applied: true, hintCoord: { row: targetR, col: targetC }, nextBoard };
      }
    }
  }

  // Step 2: Align any in-place solution-path piece whose rotation or internal arrows are not yet solved
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const piece = nextBoard[r][c];
      if (piece.locked || piece.isBlocker || piece.isEmptySlot) continue;
      const arrowsMatchSolved =
        piece.activeEntry === piece.solvedEntry &&
        piece.activeExit === piece.solvedExit &&
        hasSubgridMatchingRoute(
          piece.subgrid,
          piece.lockedPorts,
          piece.solvedEntry,
          piece.solvedExit
        );
      if (
        piece.isOnSolutionPath &&
        (piece.rotationDeg % 360 !== 0 || !arrowsMatchSolved)
      ) {
        nextBoard[r][c] = alignToSolved(piece);
        return { applied: true, hintCoord: { row: r, col: c }, nextBoard };
      }
    }
  }

  return { applied: false, hintCoord: null, nextBoard: board };
}



