import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Beaker,
  Check,
  Flag,
  HelpCircle,
  Lightbulb,
  Lock,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import { HowToPlayModal } from '../components/HowToPlayModal.tsx';
import { shouldHideGameInstructions } from '../storage/persistence.ts';
import {
  PATH_ROTATION_ARCHETYPES,
  SEEDED_TEST_FIXTURES,
  aggregateSessionScore,
  applyPathFinderHint,
  clonePathFinderBoard,
  createScrambledPathFinderBoard,
  cyclePathFinderPieceArrows,
  evaluatePathFinderBoard,
  getEffectiveConnections,
  pathRotationEngine,
  rotatePathFinderPieceAt,
  rotateSingleSubcellArrowAt,
  type CardinalDir,
  type PathFinderArrowSymbol,
  type PathFinderPiece,
  type PathFinderSubCell,
} from '../engine/index.ts';
import type { PathRotationPuzzle, PathTile } from '../engine/pathRotationEngine.ts';
import {
  normalizeDifficulty,
  type Difficulty,
  type EvaluationMode,
  type GameConfig,
  type QuestionResult,
  type SessionRecord,
} from '../types/domain.ts';
import { createDeterministicSeed } from '../utils/prng.ts';
import { soundFX } from '../utils/sound.ts';
import { usePathAudioFeedback } from '../hooks/useAudioFeedback.ts';
import {
  DifficultySelector,
  EvaluationModeSelector,
  FeedbackBanner,
  TimerBar,
} from '../components/SharedControls.tsx';

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

function getEntryArrowAngle(entrySide: CardinalDir): number {
  // Angle in degrees where 0 = Up (↑), 90 = Right (→), 180 = Down (↓), 270 = Left (←)
  switch (entrySide) {
    case 'N':
      return 180; // ↓
    case 'S':
      return 0; // ↑
    case 'W':
      return 90; // →
    case 'E':
      return 270; // ←
  }
}

function getExitArrowAngle(exitSide: CardinalDir): number {
  switch (exitSide) {
    case 'N':
      return 0; // ↑
    case 'S':
      return 180; // ↓
    case 'W':
      return 270; // ←
    case 'E':
      return 90; // →
  }
}

function getCenterArrowAngle(entrySide: CardinalDir, exitSide: CardinalDir): number {
  const inVec: Record<CardinalDir, [number, number]> = {
    N: [0, 1],
    S: [0, -1],
    W: [1, 0],
    E: [-1, 0],
  };
  const outVec: Record<CardinalDir, [number, number]> = {
    N: [0, -1],
    S: [0, 1],
    W: [-1, 0],
    E: [1, 0],
  };
  const dx = inVec[entrySide][0] + outVec[exitSide][0];
  const dy = inVec[entrySide][1] + outVec[exitSide][1];

  if (dx === 0 && dy < 0) return 0; // ↑
  if (dx > 0 && dy < 0) return 45; // ↗
  if (dx > 0 && dy === 0) return 90; // →
  if (dx > 0 && dy > 0) return 135; // ↘
  if (dx === 0 && dy > 0) return 180; // ↓
  if (dx < 0 && dy > 0) return 225; // ↙
  if (dx < 0 && dy === 0) return 270; // ←
  if (dx < 0 && dy < 0) return 315; // ↖
  return 90;
}

const SubCellArrowIcon: React.FC<{ angleDeg: number }> = ({ angleDeg }) => (
  <svg
    viewBox="0 0 16 16"
    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0 pointer-events-none"
    style={{ transform: `rotate(${angleDeg}deg)` }}
    aria-hidden="true"
  >
    <path
      d="M8 13V3.5M8 3.5L4.2 7.3M8 3.5L11.8 7.3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export interface PieceInternalModel {
  lockedPorts: CardinalDir[];
  routeConfigs: Array<{ entry: CardinalDir; exit: CardinalDir }>;
}

/**
 * Computes for each tile (r, c) its locked outer grey footprint (lockedPorts)
 * and its predefined internal directional arrow configurations (routeConfigs),
 * so that cycling arrows updates ONLY the internal flow arrows while keeping
 * the piece's outer shape, orientation, and grid placement locked in place.
 */
export function buildBoardPieceModels(puzzle: PathRotationPuzzle): PieceInternalModel[][] {
  const n = puzzle.gridSize;
  const solSidesGrid: CardinalDir[][][] = puzzle.tiles.map((row: PathTile[]) =>
    row.map((tile: PathTile) =>
      getEffectiveConnections(tile.baseConnections, {
        rotation: tile.solutionRotation,
        flipped: tile.solutionFlipped,
      })
    )
  );

  // Find a continuous solved path from sourceCoord -> sinkCoord along solution connections
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

  // Reconstruct main path from sourceCoord to sinkCoord
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

  return puzzle.tiles.map((rowTiles: PathTile[], r: number) =>
    rowTiles.map((tile: PathTile, c: number) => {
      const solSides = solSidesGrid[r][c];
      const pathIdx = pathIndexMap.get(`${r},${c}`);

      let solEntry: CardinalDir = solSides[0] ?? 'W';
      let solExit: CardinalDir = solSides[1] ?? oppositeDir(solEntry);

      if (pathIdx !== undefined && solvedPath.length >= 2) {
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
          solEntry =
            puzzle.sourceSide && puzzle.sourceSide !== toNext
              ? puzzle.sourceSide
              : c === 0 && toNext !== 'W'
              ? 'W'
              : r === 0 && toNext !== 'N'
              ? 'N'
              : oppositeDir(toNext);
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
          solExit =
            puzzle.sinkSide && puzzle.sinkSide !== fromPrev
              ? puzzle.sinkSide
              : r === n - 1 && fromPrev !== 'S'
              ? 'S'
              : c === n - 1 && fromPrev !== 'E'
              ? 'E'
              : oppositeDir(fromPrev);
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
      }

      if (solEntry === solExit) {
        solExit = oppositeDir(solEntry);
      }

      // Build locked grey shape ports: always include solEntry, solExit, and any other sides in solSides.
      // For rich multi-branch pieces (like T-junctions in the reference deck), include a deterministic 3rd branch port on non-straight pieces.
      const portSet = new Set<CardinalDir>([solEntry, solExit, ...solSides]);
      if (portSet.size === 2 && tile.shape !== 'straight' && (r + c) % 2 === 0) {
        const extra = allSides.find((s) => !portSet.has(s));
        if (extra) portSet.add(extra);
      }

      const lockedPorts = Array.from(portSet);
      const extraBranches = lockedPorts.filter((p) => p !== solEntry && p !== solExit);

      let routeConfigs: Array<{ entry: CardinalDir; exit: CardinalDir }>;
      if (extraBranches.length > 0) {
        const b1 = extraBranches[0];
        routeConfigs = [
          { entry: solEntry, exit: solExit }, // 0: Solved route
          { entry: solExit, exit: b1 }, // 1: Branch detour A
          { entry: b1, exit: solEntry }, // 2: Branch detour B
          { entry: solExit, exit: solEntry }, // 3: Reversed flow
        ];
      } else {
        routeConfigs = [
          { entry: solEntry, exit: solExit }, // 0: Solved route
          { entry: solExit, exit: solEntry }, // 1: Reversed flow
        ];
      }

      return {
        lockedPorts,
        routeConfigs,
      };
    })
  );
}

/**
 * Exported 3x3 Sub-Grid Directional Arrow Tile Renderer (used in PathRotationPage and AssessmentPage)
 */
const ARROW_SYMBOL_TO_ANGLE: Record<PathFinderArrowSymbol, number> = {
  '↑': 0,
  '↗': 45,
  '→': 90,
  '↘': 135,
  '↓': 180,
  '↙': 225,
  '←': 270,
  '↖': 315,
};

/**
 * Exported 3x3 Sub-Grid Directional Arrow Tile Renderer (used in PathRotationPage and AssessmentPage)
 */
export const TileConduitSvg: React.FC<{
  sides: CardinalDir[];
  energized: boolean;
  isSource?: boolean;
  isSink?: boolean;
  isWaypoint?: boolean;
  checkpointOrder?: number;
  oneWayDirection?: CardinalDir;
  isBlocker?: boolean;
  isEmptySlot?: boolean;
  isConnectedToSink?: boolean;
  lockedPorts?: CardinalDir[];
  activeRoute?: { entry: CardinalDir; exit: CardinalDir };
  subgrid?: PathFinderSubCell[][];
  rotationDeg?: number;
  isSelectedPiece?: boolean;
}> = ({
  sides,
  energized,
  isWaypoint,
  checkpointOrder,
  isBlocker,
  isEmptySlot,
  isConnectedToSink,
  lockedPorts,
  activeRoute,
  subgrid,
  isSelectedPiece,
}) => {
  if (isBlocker) {
    return (
      <div className="relative w-full h-full grid grid-cols-3 grid-rows-3 bg-slate-200/90">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="border border-slate-300/80 bg-slate-300/60" />
        ))}
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-700 font-mono text-base sm:text-lg font-extrabold select-none"
          aria-hidden="true"
        >
          ✕
        </span>
      </div>
    );
  }

  const shapePorts =
    lockedPorts !== undefined ? lockedPorts : isEmptySlot ? [] : sides;

  if (isEmptySlot || (shapePorts.length === 0 && !subgrid)) {
    return (
      <div className="relative w-full h-full grid grid-cols-3 grid-rows-3 bg-white">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className={`border ${
              isSelectedPiece ? 'border-[#F5B700]/60 bg-amber-50/20' : 'border-slate-300/75 bg-white'
            }`}
          />
        ))}
        {isWaypoint && (
          <span className="pointer-events-none absolute bottom-0.5 left-0.5 px-1 py-0.2 rounded bg-fuchsia-600 text-[8px] font-mono font-extrabold text-white shadow z-20">
            {checkpointOrder ? `CP${checkpointOrder}` : 'CP'}
          </span>
        )}
      </div>
    );
  }

  const activeBg =
    isConnectedToSink && energized
      ? 'bg-[#D97706] text-white'
      : energized
      ? 'bg-[#6C7075] text-white'
      : 'bg-[#6C7075] text-white';

  // When a 3x3 subgrid matrix is provided (Path Finder pieces), render directly from the rotated 3x3 matrix
  if (subgrid && subgrid.length === 3) {
    return (
      <div className="relative w-full h-full grid grid-cols-3 grid-rows-3 bg-white">
        {[0, 1, 2].map((sr) =>
          [0, 1, 2].map((sc) => {
            const key = `${sr}-${sc}`;
            const cell = subgrid[sr]?.[sc] ?? { active: false, arrow: null };
            const isOccupied = cell.active;
            const arrowSymbol = cell.arrow;
            const arrowAngle = arrowSymbol ? ARROW_SYMBOL_TO_ANGLE[arrowSymbol] : undefined;

            const selectedSubCellBorder =
              isSelectedPiece && isOccupied
                ? 'border-[2.5px] border-[#F5B700] shadow-[inset_0_0_0_1px_rgba(245,183,0,0.45)] z-10'
                : 'border border-slate-300/75';

            return (
              <div
                key={key}
                data-subcell={key}
                data-active-arrow={isOccupied ? 'true' : undefined}
                data-arrow-symbol={arrowSymbol ?? undefined}
                className={`flex items-center justify-center select-none transition-colors ${selectedSubCellBorder} ${
                  isOccupied ? activeBg : 'bg-white text-transparent'
                }`}
              >
                {isOccupied && arrowAngle !== undefined && (
                  <SubCellArrowIcon angleDeg={arrowAngle} />
                )}
              </div>
            );
          })
        )}

        {isWaypoint && (
          <span className="pointer-events-none absolute bottom-0.5 left-0.5 px-1 py-0.2 rounded bg-fuchsia-600 text-[8px] font-mono font-extrabold text-white shadow z-20">
            {checkpointOrder ? `CP${checkpointOrder}` : 'CP'}
          </span>
        )}
      </div>
    );
  }

  // Fallback for AssessmentPage legacy tiles without a 3x3 subgrid prop
  const route =
    activeRoute ??
    (shapePorts.length >= 2
      ? { entry: shapePorts[0], exit: shapePorts[1] }
      : { entry: 'W' as CardinalDir, exit: 'E' as CardinalDir });

  const sideCoord: Record<CardinalDir, [number, number]> = {
    N: [0, 1],
    S: [2, 1],
    W: [1, 0],
    E: [1, 2],
  };

  const occupiedGreySet = new Set<string>(['1-1']);
  for (const p of shapePorts) {
    const [sr, sc] = sideCoord[p];
    occupiedGreySet.add(`${sr}-${sc}`);
  }

  const [entryR, entryC] = sideCoord[route.entry];
  const [exitR, exitC] = sideCoord[route.exit];
  const arrowAngleMap = new Map<string, number>();
  arrowAngleMap.set(`${entryR}-${entryC}`, getEntryArrowAngle(route.entry));
  arrowAngleMap.set('1-1', getCenterArrowAngle(route.entry, route.exit));
  arrowAngleMap.set(`${exitR}-${exitC}`, getExitArrowAngle(route.exit));

  return (
    <div className="relative w-full h-full grid grid-cols-3 grid-rows-3 bg-white">
      {[0, 1, 2].map((sr) =>
        [0, 1, 2].map((sc) => {
          const key = `${sr}-${sc}`;
          const isOccupied = occupiedGreySet.has(key);
          const arrowAngle = arrowAngleMap.get(key);
          const isArrowCell = arrowAngle !== undefined;

          const selectedSubCellBorder =
            isSelectedPiece && isArrowCell
              ? 'border-[2.5px] border-[#F5B700] shadow-[inset_0_0_0_1px_rgba(245,183,0,0.45)] z-10'
              : 'border border-slate-300/75';

          return (
            <div
              key={key}
              data-subcell={key}
              data-active-arrow={isArrowCell ? 'true' : undefined}
              className={`flex items-center justify-center select-none transition-colors ${selectedSubCellBorder} ${
                isOccupied ? activeBg : 'bg-white text-transparent'
              }`}
            >
              {isOccupied && arrowAngle !== undefined && (
                <SubCellArrowIcon angleDeg={arrowAngle} />
              )}
            </div>
          );
        })
      )}

      {isWaypoint && (
        <span className="pointer-events-none absolute bottom-0.5 left-0.5 px-1 py-0.2 rounded bg-fuchsia-600 text-[8px] font-mono font-extrabold text-white shadow z-20">
          {checkpointOrder ? `CP${checkpointOrder}` : 'CP'}
        </span>
      )}
    </div>
  );
};

export const PathRotationPage: React.FC = () => {
  const { settings, recordSession } = useLab();
  const {
    triggerRotateAudio,
    triggerSubmitAudio,
    triggerSwapAudio,
    triggerErrorAudio,
    lastAudioEvent,
    rotateAudioCount,
    submitAudioCount,
  } = usePathAudioFeedback(settings.soundEnabled);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryDifficulty = searchParams.get('difficulty') as Difficulty | null;
  const querySeed = searchParams.get('seed');
  const queryArchetype = searchParams.get('archetype') || undefined;
  const queryMode = searchParams.get('mode') as EvaluationMode | null;
  const queryQuestions = Number(searchParams.get('questions'));
  const autostart = searchParams.get('autostart') === '1';

  const [config, setConfig] = useState<GameConfig>(() => ({
    gameType: 'path-rotation',
    difficulty: queryDifficulty
      ? normalizeDifficulty(queryDifficulty)
      : settings.defaultDifficulty,
    evaluationMode:
      queryMode === 'exam' || queryMode === 'practice'
        ? queryMode
        : settings.defaultEvaluationMode,
    questionCount:
      Number.isFinite(queryQuestions) && queryQuestions >= 1 && queryQuestions <= 20
        ? queryQuestions
        : settings.defaultSessionLength || 10,
    timeLimitSeconds: (settings.defaultSessionLength || 10) * 35,
    perQuestionTimeSeconds: 35,
    seed: querySeed || createDeterministicSeed('PR'),
    archetypeId: queryArchetype,
    practiceRules: {
      ...settings.practiceRules,
      allowUndo: (queryMode ?? settings.defaultEvaluationMode) === 'practice',
      showLiveValidation: true,
    },
  }));

  const [stage, setStage] = useState<'title' | 'playing' | 'paused'>(
    autostart ? 'playing' : 'title'
  );
  const [howToPlayOpen, setHowToPlayOpen] = useState<boolean>(false);
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [sessionStartIso, setSessionStartIso] = useState<string>(() => new Date().toISOString());

  const generated = useMemo(
    () => pathRotationEngine.generatePuzzle(config, questionIndex),
    [config, questionIndex]
  );

  // Build scrambled initial board where movable pieces are shuffled out of their solved slots
  const initialScrambledBoard = useMemo(
    () => createScrambledPathFinderBoard(generated.puzzle, generated.metadata.seed).initialBoard,
    [generated]
  );

  const [boardPieces, setBoardPieces] = useState<PathFinderPiece[][]>(() =>
    clonePathFinderBoard(initialScrambledBoard)
  );
  const [boardHistory, setBoardHistory] = useState<PathFinderPiece[][][]>([]);
  const [movesCount, setMovesCount] = useState<number>(0);
  const [swapsCount, setSwapsCount] = useState<number>(0);
  const [arrowCyclesCount, setArrowCyclesCount] = useState<number>(0);
  const [hintsUsedCount, setHintsUsedCount] = useState<number>(0);
  const [lockedAttemptsCount, setLockedAttemptsCount] = useState<number>(0);

  const [selectedCoord, setSelectedCoord] = useState<{ row: number; col: number } | null>(null);
  const selectedCoordRef = useRef<{ row: number; col: number } | null>(null);
  selectedCoordRef.current = selectedCoord;

  const [lastFocusedCoord, setLastFocusedCoord] = useState<{ row: number; col: number }>({
    row: generated.puzzle.sourceCoord.row,
    col: generated.puzzle.sourceCoord.col,
  });
  const [hasCycledSinceSelect, setHasCycledSinceSelect] = useState<boolean>(false);
  const hasCycledSinceSelectRef = useRef<boolean>(false);
  hasCycledSinceSelectRef.current = hasCycledSinceSelect;

  const [feedbackTone, setFeedbackTone] = useState<'neutral' | 'success' | 'error'>('neutral');
  const [feedbackMessage, setFeedbackMessage] = useState<string>(
    'Pieces are scrambled in their grid slots! Click any unlocked piece to rotate it 90° CW, and use Arrows (⇄) to change the arrows inside a piece.'
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    generated.metadata.timeLimitSeconds
  );

  const boardPiecesRef = useRef(boardPieces);
  boardPiecesRef.current = boardPieces;

  const movesCountRef = useRef(movesCount);
  movesCountRef.current = movesCount;

  const questionStartRef = useRef<number>(performance.now());
  const pauseStartedAtRef = useRef<number | null>(null);
  const pausedAccumulatedMsRef = useRef<number>(0);
  const advancingRef = useRef<boolean>(false);
  const sessionFinalizedRef = useRef<boolean>(false);

  const isExamMode = config.evaluationMode === 'exam';

  useEffect(() => {
    const freshBoard = clonePathFinderBoard(initialScrambledBoard);
    setBoardPieces(freshBoard);
    boardPiecesRef.current = freshBoard;
    setBoardHistory([]);
    setMovesCount(0);
    movesCountRef.current = 0;
    setSwapsCount(0);
    setArrowCyclesCount(0);
    setHintsUsedCount(0);
    setLockedAttemptsCount(0);
    selectedCoordRef.current = null;
    setSelectedCoord(null);
    hasCycledSinceSelectRef.current = false;
    setHasCycledSinceSelect(false);

    // Find first unlocked non-empty piece as fallback focus target for keyboard/cycle button
    let defaultFocus = {
      row: generated.puzzle.sourceCoord.row,
      col: generated.puzzle.sourceCoord.col,
    };
    outer: for (let r = 0; r < generated.puzzle.gridSize; r++) {
      for (let c = 0; c < generated.puzzle.gridSize; c++) {
        const p = freshBoard[r]?.[c];
        if (p && !p.locked && !p.isBlocker && !p.isEmptySlot) {
          defaultFocus = { row: r, col: c };
          break outer;
        }
      }
    }
    setLastFocusedCoord(defaultFocus);

    setFeedbackTone('neutral');
    setFeedbackMessage(
      'Pieces are scrambled in their grid slots! Click any unlocked piece to rotate it 90° CW, and use Arrows (⇄) to change the arrows inside a piece.'
    );
    setRemainingSeconds(generated.metadata.timeLimitSeconds);
    questionStartRef.current = performance.now();
    pauseStartedAtRef.current = null;
    pausedAccumulatedMsRef.current = 0;
    advancingRef.current = false;
  }, [generated, initialScrambledBoard]);

  const boardEval = useMemo(
    () => evaluatePathFinderBoard(generated.puzzle, boardPieces),
    [generated.puzzle, boardPieces]
  );

  const buildSynthesizedEngineState = useCallback(
    (
      currentBoard: PathFinderPiece[][],
      currentMoves: number,
      currentRotations: number,
      currentSwaps: number,
      currentHints: number,
      currentLockedAttempts: number
    ) => {
      const evalState = evaluatePathFinderBoard(generated.puzzle, currentBoard);
      const transforms = generated.puzzle.tiles.map((rowTiles) =>
        rowTiles.map((tile) => ({
          rotation: evalState.isSolved ? tile.solutionRotation : (tile.solutionRotation + 90) % 360,
          flipped: tile.solutionFlipped,
        }))
      );
      return {
        ...generated.initialState,
        transforms,
        energizedCoords: evalState.isSolved
          ? evalState.energizedCoords
          : evalState.geometricallyConnectedCoords,
        isConnectedToSink: evalState.isGeometricallyConnected,
        allWaypointsEnergized: evalState.allWaypointsVisited,
        checkpointOrderValid: evalState.checkpointOrderValid,
        arrowConstraintsValid: evalState.isDirectionallyAligned,
        hasClosedLoop: false,
        movesCount: currentMoves,
        rotationsCount: currentRotations,
        flipsCount: currentSwaps,
        hintsUsedCount: currentHints,
        lockedAttemptsCount: currentLockedAttempts,
        lastFeedback: feedbackMessage,
      };
    },
    [generated, feedbackMessage]
  );

  const saveAndNavigateResults = useCallback(
    (finalResults: QuestionResult[], status: 'completed' | 'abandoned') => {
      if (sessionFinalizedRef.current) return;
      sessionFinalizedRef.current = true;

      const sessionId = `ses-pr-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const score = aggregateSessionScore(finalResults, config.questionCount);

      const record: SessionRecord = {
        sessionId,
        mode: config.evaluationMode === 'exam' ? 'exam' : 'practice',
        orchestratorMode: 'single-game-challenge',
        evaluationMode: config.evaluationMode,
        gameType: 'path-rotation',
        status,
        startedAtIso: sessionStartIso,
        completedAtIso: new Date().toISOString(),
        seed: config.seed,
        difficulty: config.difficulty,
        config,
        score,
        questionResults: finalResults,
      };

      recordSession(record);
      soundFX.playComplete(settings.soundEnabled);
      navigate(`/results/${sessionId}`);
    },
    [config, sessionStartIso, recordSession, settings.soundEnabled, navigate]
  );

  const finalizeQuestionAndAdvance = useCallback(
    (
      finalBoard: PathFinderPiece[][],
      finalMoves: number,
      timedOut: boolean
    ) => {
      if (advancingRef.current) return;
      advancingRef.current = true;

      const rawElapsed =
        performance.now() - questionStartRef.current - pausedAccumulatedMsRef.current;
      const elapsedMs = timedOut
        ? generated.metadata.timeLimitSeconds * 1000
        : Math.max(50, Math.round(rawElapsed));

      const synthState = buildSynthesizedEngineState(
        finalBoard,
        finalMoves,
        arrowCyclesCount,
        swapsCount,
        hintsUsedCount,
        lockedAttemptsCount
      );

      const qResult = pathRotationEngine.calculateQuestionResult({
        metadata: generated.metadata,
        puzzle: generated.puzzle,
        finalState: synthState,
        elapsedMs,
        timedOut,
      });

      const updatedResults = [...results, qResult];
      setResults(updatedResults);

      if (questionIndex + 1 < config.questionCount) {
        setQuestionIndex((prev) => prev + 1);
      } else {
        saveAndNavigateResults(updatedResults, 'completed');
      }
    },
    [
      generated,
      arrowCyclesCount,
      swapsCount,
      hintsUsedCount,
      lockedAttemptsCount,
      buildSynthesizedEngineState,
      results,
      questionIndex,
      config.questionCount,
      saveAndNavigateResults,
    ]
  );

  useEffect(() => {
    if (stage !== 'playing') return;

    const interval = window.setInterval(() => {
      const elapsedSec =
        (performance.now() - questionStartRef.current - pausedAccumulatedMsRef.current) / 1000;
      const nextRemaining = Math.max(0, generated.metadata.timeLimitSeconds - elapsedSec);
      setRemainingSeconds(nextRemaining);

      if (nextRemaining <= 0) {
        window.clearInterval(interval);
        soundFX.playError(settings.soundEnabled);
        finalizeQuestionAndAdvance(boardPiecesRef.current, movesCountRef.current, true);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [
    stage,
    generated.metadata.timeLimitSeconds,
    finalizeQuestionAndAdvance,
    settings.soundEnabled,
  ]);

  useEffect(() => {
    if (!settings.practiceRules.suspendTimerOnInactiveTab || isExamMode) return;
    const handleVisibility = () => {
      if (document.hidden && stage === 'playing') {
        pauseStartedAtRef.current = performance.now();
        setStage('paused');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [settings.practiceRules.suspendTimerOnInactiveTab, isExamMode, stage]);

  const handleTogglePause = useCallback(() => {
    if (isExamMode) return;
    setStage((prev) => {
      if (prev === 'playing') {
        pauseStartedAtRef.current = performance.now();
        return 'paused';
      }
      if (prev === 'paused') {
        if (pauseStartedAtRef.current !== null) {
          pausedAccumulatedMsRef.current += performance.now() - pauseStartedAtRef.current;
          pauseStartedAtRef.current = null;
        }
        return 'playing';
      }
      return prev;
    });
  }, [isExamMode]);

  /**
   * Core 90° Clockwise Piece Rotation Function:
   * - Used by BOTH Trigger 1 (direct click on an unlocked path piece) and Trigger 2 (bottom ↺ rotation button).
   * - Rotates the 3x3 subgrid matrix (new_row = col, new_col = 2 - row), rotates all arrow vectors 90° CW,
   *   updates entry/exit ports, increments Moves by 1, and returns a fresh cloned board reference.
   */
  const executePieceRotation90CW = useCallback(
    (targetRow: number, targetCol: number) => {
      if (stage !== 'playing' || advancingRef.current) return false;

      const currentBoard = boardPiecesRef.current;
      const piece = currentBoard[targetRow]?.[targetCol];
      const baseTile = generated.puzzle.tiles[targetRow]?.[targetCol];

      if (
        !piece ||
        piece.locked ||
        piece.isBlocker ||
        piece.isEmptySlot ||
        baseTile?.locked ||
        baseTile?.shape === 'blocker'
      ) {
        return false;
      }

      const rotOutcome = rotatePathFinderPieceAt(currentBoard, targetRow, targetCol);
      if (!rotOutcome.rotated) return false;

      setBoardHistory((prev) => [...prev, clonePathFinderBoard(currentBoard)]);
      boardPiecesRef.current = rotOutcome.nextBoard;
      setBoardPieces(rotOutcome.nextBoard);

      const nextMoves = movesCountRef.current + 1;
      movesCountRef.current = nextMoves;
      setMovesCount(nextMoves);
      setArrowCyclesCount((prev) => prev + 1);

      const nextCoord = { row: targetRow, col: targetCol };
      selectedCoordRef.current = nextCoord;
      setSelectedCoord(nextCoord);
      setLastFocusedCoord(nextCoord);

      const rotatedPiece = rotOutcome.nextBoard[targetRow][targetCol];
      const nextEval = evaluatePathFinderBoard(generated.puzzle, rotOutcome.nextBoard);
      triggerRotateAudio({
        row: targetRow,
        col: targetCol,
        rotationDeg: rotatedPiece.rotationDeg,
        pieceId: rotatedPiece.id,
      });

      if (nextEval.isSolved) {
        setFeedbackTone('success');
        setFeedbackMessage(
          'Continuous path and forward arrow vectors aligned from IN → to OUT! Click Submit to confirm.'
        );
      } else if (nextEval.isGeometricallyConnected && !nextEval.isDirectionallyAligned) {
        setFeedbackTone('neutral');
        setFeedbackMessage(
          `Physical path is connected! Now press Arrows (⇄) or click the sub-grid arrows to align the internal arrows from IN → to OUT.`
        );
      } else {
        setFeedbackTone('neutral');
        setFeedbackMessage(
          `Rotated piece (${targetRow + 1}, ${targetCol + 1}) 90° clockwise (${rotatedPiece.rotationDeg}°). Click again to rotate, or press Arrows (⇄) to flip its internal arrows.`
        );
      }

      return true;
    },
    [stage, generated.puzzle, triggerRotateAudio]
  );

  /**
   * Trigger 1: Direct Click on the Path Piece
   * - Clicking an unlocked path piece directly on the grid immediately selects it (gold/yellow border)
   *   and rotates the piece 90° clockwise in its own grid slot, incrementing Moves by 1.
   * - Repeated clicks on the same piece continue rotating it by 90° on each click.
   * - Locked tiles (🔒) and fixed obstacles (✕) are safeguarded: direct clicks do not trigger rotation or selection.
   */
  const handleTileClick = useCallback(
    (row: number, col: number, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (stage !== 'playing' || advancingRef.current) return;

      const currentBoard = boardPiecesRef.current;
      const clickedPiece = currentBoard[row]?.[col];
      const baseTile = generated.puzzle.tiles[row]?.[col];

      // Locked Tile Safeguard: locked pieces (🔒) and fixed obstacles (✕) must not trigger rotation or selection
      if (
        !clickedPiece ||
        clickedPiece.locked ||
        clickedPiece.isBlocker ||
        baseTile?.locked ||
        baseTile?.shape === 'blocker'
      ) {
        setLockedAttemptsCount((prev) => prev + 1);
        setFeedbackTone('error');
        setFeedbackMessage('Locked tile cannot be selected or rotated.');
        triggerErrorAudio({ row, col, reason: 'locked' });
        return;
      }

      hasCycledSinceSelectRef.current = false;
      setHasCycledSinceSelect(false);

      // Direct Tile Click Rotation: select this unlocked path piece in-place and rotate it 90° clockwise immediately
      executePieceRotation90CW(row, col);
    },
    [stage, generated.puzzle, triggerErrorAudio, executePieceRotation90CW]
  );

  /**
   * Trigger 2: Bottom Rotation Button (↺)
   * - Executes the exact same 90° clockwise rotation function on whichever piece is currently selected.
   * - If no piece is currently selected, the button has no effect on moves/board and gives subtle feedback.
   */
  const handleRotateSelectedPiece = useCallback(() => {
    if (stage !== 'playing' || advancingRef.current) return;
    const activeCoord = selectedCoordRef.current ?? selectedCoord;
    if (!activeCoord) {
      setFeedbackTone('neutral');
      setFeedbackMessage(
        'Select an unlocked path piece on the grid first, then click Rotate to rotate it 90° clockwise.'
      );
      return;
    }
    hasCycledSinceSelectRef.current = false;
    setHasCycledSinceSelect(false);
    executePieceRotation90CW(activeCoord.row, activeCoord.col);
  }, [stage, selectedCoord, executePieceRotation90CW]);

  /**
   * Change Internal Arrows Button (⇄):
   * - Changes/flips ONLY the internal arrows inside the selected path piece (without rotating the gray path piece).
   */
  const handleCyclePieceArrows = useCallback(
    (targetRow?: number, targetCol?: number) => {
      if (stage !== 'playing' || advancingRef.current) return;

      const activeCoord =
        targetRow !== undefined && targetCol !== undefined
          ? { row: targetRow, col: targetCol }
          : selectedCoordRef.current ?? selectedCoord ?? lastFocusedCoord;

      if (!activeCoord) {
        setFeedbackTone('neutral');
        setFeedbackMessage(
          'Select an unlocked path piece on the grid first, then click Arrows (⇄) to change the arrows inside that piece.'
        );
        return;
      }

      const currentBoard = boardPiecesRef.current;
      const targetPiece = currentBoard[activeCoord.row]?.[activeCoord.col];
      const baseTile = generated.puzzle.tiles[activeCoord.row]?.[activeCoord.col];

      if (
        !targetPiece ||
        targetPiece.locked ||
        targetPiece.isBlocker ||
        targetPiece.isEmptySlot ||
        baseTile?.locked ||
        baseTile?.shape === 'blocker'
      ) {
        setFeedbackTone('error');
        setFeedbackMessage('Locked tile arrows cannot be modified.');
        triggerErrorAudio({ row: activeCoord.row, col: activeCoord.col, reason: 'locked' });
        return;
      }

      const cycleOutcome = cyclePathFinderPieceArrows(
        currentBoard,
        activeCoord.row,
        activeCoord.col
      );
      if (!cycleOutcome.cycled) return;

      setBoardHistory((prev) => [...prev, clonePathFinderBoard(currentBoard)]);
      boardPiecesRef.current = cycleOutcome.nextBoard;
      setBoardPieces(cycleOutcome.nextBoard);

      const nextMoves = movesCountRef.current + 1;
      movesCountRef.current = nextMoves;
      setMovesCount(nextMoves);
      setSwapsCount((prev) => prev + 1);

      selectedCoordRef.current = activeCoord;
      setSelectedCoord(activeCoord);
      setLastFocusedCoord(activeCoord);
      hasCycledSinceSelectRef.current = true;
      setHasCycledSinceSelect(true);

      const updatedPiece = cycleOutcome.nextBoard[activeCoord.row][activeCoord.col];
      const nextEval = evaluatePathFinderBoard(generated.puzzle, cycleOutcome.nextBoard);

      triggerRotateAudio({
        row: activeCoord.row,
        col: activeCoord.col,
        rotationDeg: updatedPiece.rotationDeg,
        pieceId: updatedPiece.id,
      });

      if (nextEval.isSolved) {
        setFeedbackTone('success');
        setFeedbackMessage(
          'Internal arrows aligned! Continuous path and forward arrow vectors flow from IN → to OUT! Click Submit to confirm.'
        );
      } else {
        setFeedbackTone('neutral');
        setFeedbackMessage(
          `Changed internal arrows inside piece (${activeCoord.row + 1}, ${
            activeCoord.col + 1
          }) (${updatedPiece.activeEntry ?? ''} → ${
            updatedPiece.activeExit ?? ''
          }) without rotating the piece.`
        );
      }
    },
    [
      stage,
      selectedCoord,
      lastFocusedCoord,
      generated.puzzle,
      triggerRotateAudio,
      triggerErrorAudio,
    ]
  );

  /**
   * Rotates a single internal arrow inside the selected piece's 3x3 subgrid by 90° clockwise
   * without rotating the whole path piece.
   */
  const handleRotateSingleSubcellArrow = useCallback(
    (subRow: number, subCol: number) => {
      if (stage !== 'playing' || advancingRef.current) return;
      const activeCoord = selectedCoordRef.current ?? selectedCoord ?? lastFocusedCoord;
      if (!activeCoord) return;

      const currentBoard = boardPiecesRef.current;
      const subOutcome = rotateSingleSubcellArrowAt(
        currentBoard,
        activeCoord.row,
        activeCoord.col,
        subRow,
        subCol
      );
      if (!subOutcome.rotated) return;

      setBoardHistory((prev) => [...prev, clonePathFinderBoard(currentBoard)]);
      boardPiecesRef.current = subOutcome.nextBoard;
      setBoardPieces(subOutcome.nextBoard);

      const nextMoves = movesCountRef.current + 1;
      movesCountRef.current = nextMoves;
      setMovesCount(nextMoves);
      setSwapsCount((prev) => prev + 1);

      selectedCoordRef.current = activeCoord;
      setSelectedCoord(activeCoord);
      setLastFocusedCoord(activeCoord);
      hasCycledSinceSelectRef.current = true;
      setHasCycledSinceSelect(true);

      const updatedPiece = subOutcome.nextBoard[activeCoord.row][activeCoord.col];
      const nextEval = evaluatePathFinderBoard(generated.puzzle, subOutcome.nextBoard);

      triggerRotateAudio({
        row: activeCoord.row,
        col: activeCoord.col,
        rotationDeg: updatedPiece.rotationDeg,
        pieceId: updatedPiece.id,
      });

      if (nextEval.isSolved) {
        setFeedbackTone('success');
        setFeedbackMessage(
          'Internal arrow aligned! Continuous path and forward arrow vectors flow from IN → to OUT! Click Submit to confirm.'
        );
      } else {
        setFeedbackTone('neutral');
        setFeedbackMessage(
          `Rotated internal arrow (${subRow + 1}, ${subCol + 1}) inside piece (${
            activeCoord.row + 1
          }, ${activeCoord.col + 1}) to ${
            updatedPiece.subgrid[subRow]?.[subCol]?.arrow ?? ''
          } without rotating the piece.`
        );
      }
    },
    [stage, selectedCoord, lastFocusedCoord, generated.puzzle, triggerRotateAudio]
  );

  /**
   * Validates both conditions when Submit (✓) is clicked:
   * 1. Continuous Connection: All path pieces form an unbroken physical line from IN to OUT.
   * 2. Consistent Arrow Vectors: Every arrow on the active track points continuously forward from IN → to OUT ↓.
   */
  const handleSubmitRoute = useCallback(() => {
    if (stage !== 'playing' || advancingRef.current) return;
    const currentEval = evaluatePathFinderBoard(generated.puzzle, boardPiecesRef.current);

    triggerSubmitAudio(currentEval.isSolved, {
      isGeometricallyConnected: currentEval.isGeometricallyConnected,
      isDirectionallyAligned: currentEval.isDirectionallyAligned,
    });

    if (currentEval.isSolved) {
      setFeedbackTone('success');
      setFeedbackMessage(
        'Circuit verified! Continuous physical path and forward arrow flow confirmed.'
      );
      finalizeQuestionAndAdvance(boardPiecesRef.current, movesCountRef.current, false);
      return;
    }

    setFeedbackTone('error');
    if (!currentEval.isGeometricallyConnected) {
      setFeedbackMessage(
        'Cannot submit: The physical gray path between IN and OUT is broken. Rotate the path pieces in their grid cells to connect IN to OUT first.'
      );
    } else {
      setFeedbackMessage(
        'Cannot submit: The gray track connects IN to OUT, but internal arrows inside one or more pieces point against the flow. Select misaligned pieces and press Arrows (⇄) to flip their internal arrows.'
      );
    }
  }, [stage, generated.puzzle, triggerSubmitAudio, finalizeQuestionAndAdvance]);

  const handleUndo = useCallback(() => {
    if (stage !== 'playing' || isExamMode || advancingRef.current || boardHistory.length === 0) {
      return;
    }
    const previousBoard = boardHistory[boardHistory.length - 1];
    setBoardHistory((prev) => prev.slice(0, -1));
    boardPiecesRef.current = previousBoard;
    setBoardPieces(previousBoard);
    const nextMoves = Math.max(0, movesCountRef.current - 1);
    movesCountRef.current = nextMoves;
    setMovesCount(nextMoves);
    setSelectedCoord(null);
    setHasCycledSinceSelect(false);
    setFeedbackTone('neutral');
    setFeedbackMessage('Reverted previous move.');
  }, [stage, isExamMode, boardHistory]);

  const handleHint = useCallback(() => {
    if (stage !== 'playing' || isExamMode || advancingRef.current) return;
    const hintOutcome = applyPathFinderHint(boardPiecesRef.current);
    if (!hintOutcome.applied) return;

    setBoardHistory((prev) => [...prev, clonePathFinderBoard(boardPiecesRef.current)]);
    boardPiecesRef.current = hintOutcome.nextBoard;
    setBoardPieces(hintOutcome.nextBoard);

    const nextMoves = movesCountRef.current + 1;
    movesCountRef.current = nextMoves;
    setMovesCount(nextMoves);
    setHintsUsedCount((prev) => prev + 1);

    if (hintOutcome.hintCoord) {
      setSelectedCoord(hintOutcome.hintCoord);
      setLastFocusedCoord(hintOutcome.hintCoord);
      setHasCycledSinceSelect(true);
    }

    const nextEval = evaluatePathFinderBoard(generated.puzzle, hintOutcome.nextBoard);
    setFeedbackTone(nextEval.isSolved ? 'success' : 'neutral');
    setFeedbackMessage(
      nextEval.isSolved
        ? 'Hint aligned the final circuit segment! Advancing...'
        : `Hint placed and aligned piece at (${(hintOutcome.hintCoord?.row ?? 0) + 1}, ${
            (hintOutcome.hintCoord?.col ?? 0) + 1
          }).`
    );

    if (nextEval.isSolved) {
      soundFX.playSuccess(settings.soundEnabled);
      finalizeQuestionAndAdvance(hintOutcome.nextBoard, nextMoves, false);
    }
  }, [stage, isExamMode, generated.puzzle, settings.soundEnabled, finalizeQuestionAndAdvance]);

  const handleResetBoard = useCallback(() => {
    if (stage !== 'playing' || advancingRef.current) return;
    const restored = clonePathFinderBoard(initialScrambledBoard);
    boardPiecesRef.current = restored;
    setBoardPieces(restored);
    setBoardHistory([]);
    movesCountRef.current = 0;
    setMovesCount(0);
    setSwapsCount(0);
    setArrowCyclesCount(0);
    setSelectedCoord(null);
    setHasCycledSinceSelect(false);
    setFeedbackTone('neutral');
    setFeedbackMessage('Board reset to initial scrambled configuration.');
  }, [stage, initialScrambledBoard]);

  const handleFinishEarly = useCallback(() => {
    if (results.length > 0) {
      saveAndNavigateResults(results, 'abandoned');
    } else {
      const elapsedMs = Math.max(
        50,
        Math.round(performance.now() - questionStartRef.current - pausedAccumulatedMsRef.current)
      );
      const synthState = buildSynthesizedEngineState(
        boardPiecesRef.current,
        movesCountRef.current,
        arrowCyclesCount,
        swapsCount,
        hintsUsedCount,
        lockedAttemptsCount
      );
      const qResult = pathRotationEngine.calculateQuestionResult({
        metadata: generated.metadata,
        puzzle: generated.puzzle,
        finalState: synthState,
        elapsedMs,
        timedOut: false,
      });
      saveAndNavigateResults([qResult], 'abandoned');
    }
  }, [
    generated,
    results,
    arrowCyclesCount,
    swapsCount,
    hintsUsedCount,
    lockedAttemptsCount,
    buildSynthesizedEngineState,
    saveAndNavigateResults,
  ]);

  const launchGameRoundNow = useCallback(() => {
    setHowToPlayOpen(false);
    sessionFinalizedRef.current = false;
    setQuestionIndex(0);
    setResults([]);
    setSessionStartIso(new Date().toISOString());
    questionStartRef.current = performance.now();
    pausedAccumulatedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    setStage('playing');
  }, []);

  const handleStartRequest = useCallback(() => {
    if (shouldHideGameInstructions('path_finder')) {
      launchGameRoundNow();
    } else {
      setHowToPlayOpen(true);
    }
  }, [launchGameRoundNow]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (howToPlayOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (stage === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartRequest();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedCoord) {
          setSelectedCoord(null);
          setHasCycledSinceSelect(false);
        } else if (!isExamMode) {
          handleTogglePause();
        }
        return;
      }

      if (stage !== 'playing') return;

      const g = generated.puzzle.gridSize;
      const curr = selectedCoord ?? lastFocusedCoord;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = { row: Math.max(0, curr.row - 1), col: curr.col };
        setSelectedCoord(next);
        setLastFocusedCoord(next);
        setHasCycledSinceSelect(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = { row: Math.min(g - 1, curr.row + 1), col: curr.col };
        setSelectedCoord(next);
        setLastFocusedCoord(next);
        setHasCycledSinceSelect(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = { row: curr.row, col: Math.max(0, curr.col - 1) };
        setSelectedCoord(next);
        setLastFocusedCoord(next);
        setHasCycledSinceSelect(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = { row: curr.row, col: Math.min(g - 1, curr.col + 1) };
        setSelectedCoord(next);
        setLastFocusedCoord(next);
        setHasCycledSinceSelect(false);
      } else if (e.key === ' ' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRotateSelectedPiece();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleCyclePieceArrows();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmitRoute();
      } else if ((e.key === 'z' || e.key === 'Z') && !isExamMode) {
        e.preventDefault();
        handleUndo();
      } else if ((e.key === 'h' || e.key === 'H') && !isExamMode) {
        e.preventDefault();
        handleHint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    stage,
    howToPlayOpen,
    isExamMode,
    generated.puzzle.gridSize,
    selectedCoord,
    lastFocusedCoord,
    handleStartRequest,
    handleTogglePause,
    handleRotateSelectedPiece,
    handleCyclePieceArrows,
    handleSubmitRoute,
    handleUndo,
    handleHint,
  ]);

  const applyFixture = (fixtureId: string) => {
    const found = SEEDED_TEST_FIXTURES.find((f) => f.id === fixtureId);
    if (!found) return;
    setConfig((prev) => ({
      ...prev,
      difficulty: found.difficulty,
      questionCount: found.questionCount,
      seed: found.seed,
      archetypeId: found.archetypeId,
    }));
  };

  if (stage === 'title') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <span className="text-xs font-mono text-emerald-300">
            Module 03 · 50 Path Finder Archetypes (PR-01 to PR-50)
          </span>
        </div>

        <section className="bg-[#0E152B] border border-emerald-500/35 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center text-slate-950 font-extrabold text-lg shadow-lg shrink-0">
                ↗
              </div>
              <div className="space-y-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-400/40 text-emerald-300">
                  🧭 PATH FINDER
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                  Path Rotation Studio
                </h1>
              </div>
            </div>

            <button
              type="button"
              data-testid="open-how-to-play-btn"
              onClick={() => setHowToPlayOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-200 bg-emerald-500/10 border border-emerald-400/30 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>(?) How to Play</span>
            </button>
          </div>

          <div className="space-y-4 pt-3 border-t border-slate-800/80">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Evaluation Mode
              </label>
              <EvaluationModeSelector
                value={config.evaluationMode ?? 'practice'}
                onChange={(evaluationMode) =>
                  setConfig((prev) => ({
                    ...prev,
                    evaluationMode,
                    practiceRules: {
                      ...prev.practiceRules!,
                      allowUndo: evaluationMode === 'practice',
                    },
                  }))
                }
                idPrefix="pr-eval"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Select Difficulty Tier
              </label>
              <DifficultySelector
                value={config.difficulty}
                onChange={(difficulty) => setConfig((prev) => ({ ...prev, difficulty }))}
                idPrefix="pr-diff"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="pr-archetype-select"
                  className="block text-xs font-medium text-slate-400 mb-1"
                >
                  Target Archetype (50 Available)
                </label>
                <select
                  id="pr-archetype-select"
                  value={config.archetypeId || ''}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      archetypeId: e.target.value || undefined,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs bg-[#080D1A] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-400"
                >
                  <option value="">Adaptive / Mixed Rotation (All 50)</option>
                  {PATH_ROTATION_ARCHETYPES.map((arch) => (
                    <option key={arch.id} value={arch.id}>
                      {arch.code} — {arch.title} ({arch.recommendedDifficulty})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="pr-question-count"
                  className="block text-xs font-medium text-slate-400 mb-1"
                >
                  Puzzle Count
                </label>
                <select
                  id="pr-question-count"
                  value={config.questionCount}
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    setConfig((prev) => ({
                      ...prev,
                      questionCount: count,
                      timeLimitSeconds: count * prev.perQuestionTimeSeconds,
                    }));
                  }}
                  className="w-full px-3 py-2 text-xs bg-[#080D1A] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-400"
                >
                  <option value={3}>3 Circuits (Quick Check)</option>
                  <option value={5}>5 Circuits (Sprint)</option>
                  <option value={10}>10 Circuits (Standard)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pr-seed-input"
                  className="block text-xs font-medium text-slate-400 mb-1"
                >
                  Deterministic Seed
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="pr-seed-input"
                    type="text"
                    value={config.seed}
                    onChange={(e) => setConfig((prev) => ({ ...prev, seed: e.target.value }))}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#080D1A] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        seed: createDeterministicSeed('PR'),
                      }))
                    }
                    className="p-2 text-slate-400 hover:text-slate-100 bg-[#080D1A] border border-slate-800 rounded-xl cursor-pointer"
                    title="Generate new seed"
                    aria-label="Generate new random seed"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#080D1A]/90 border border-slate-800/80 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-emerald-300">
                <Beaker className="w-3.5 h-3.5" />
                <span>Reproducible Benchmark Fixtures</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SEEDED_TEST_FIXTURES.filter((f) => f.gameType === 'path-rotation').map((fix) => (
                  <button
                    key={fix.id}
                    type="button"
                    onClick={() => applyFixture(fix.id)}
                    className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40 transition-colors cursor-pointer"
                  >
                    {fix.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setHowToPlayOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>(?) How to Play</span>
            </button>

            <button
              type="button"
              data-start="true"
              data-testid="start-path-finder-btn"
              onClick={handleStartRequest}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-slate-950 bg-gradient-to-r from-emerald-300 via-teal-400 to-cyan-500 rounded-full hover:brightness-105 transition-all cursor-pointer shadow-lg"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Launch Path Finder</span>
            </button>
          </div>
        </section>

        <HowToPlayModal
          gameId="path_finder"
          open={howToPlayOpen}
          onStartPlay={launchGameRoundNow}
          onClose={() => setHowToPlayOpen(false)}
        />
      </div>
    );
  }

  const { puzzle, metadata } = generated;
  const gridSize = puzzle.gridSize;
  const totalSec = metadata.timeLimitSeconds || 35;
  const displaySec = Math.max(0, Math.ceil(remainingSeconds));
  const timerRatio = Math.max(0, Math.min(1, remainingSeconds / totalSec));
  const ringRadius = 21;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - timerRatio);

  const isEnergizedCell = (r: number, c: number) =>
    boardEval.energizedCoords.some((ec) => ec.row === r && ec.col === c);

  const activeInspectorCoord = selectedCoord ?? lastFocusedCoord;
  const inspectedPiece = boardPieces[activeInspectorCoord.row]?.[activeInspectorCoord.col];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Top Header */}
      <header className="bg-[#0E152B] border border-emerald-500/30 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="p-2 rounded-xl bg-[#080D1A] border border-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <span className="text-emerald-300 font-semibold">Path Finder</span>
              <span>·</span>
              <span>{metadata.archetypeTitle}</span>
              <span>·</span>
              <span className="uppercase text-emerald-400">{metadata.difficulty}</span>
              <span>·</span>
              <span>
                {gridSize}×{gridSize} Grid
              </span>
              {isExamMode && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">
                  <ShieldAlert className="w-3 h-3" /> EXAM
                </span>
              )}
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-100">
              Circuit {questionIndex + 1} of {config.questionCount}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isExamMode && (
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={boardHistory.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#080D1A] border border-slate-700/80 text-slate-200 hover:border-emerald-400/50 disabled:opacity-40 cursor-pointer"
                aria-label="Undo last tile move"
              >
                <Undo2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                onClick={handleHint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#080D1A] border border-amber-500/40 text-amber-300 hover:bg-amber-950/30 cursor-pointer"
                aria-label="Apply Practice Hint"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Hint</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleResetBoard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#080D1A] border border-slate-700/80 text-slate-200 hover:border-slate-500 cursor-pointer"
            aria-label="Reset board to initial state"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset</span>
          </button>

          {!isExamMode && (
            <button
              type="button"
              onClick={handleTogglePause}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#080D1A] border border-slate-700/80 text-slate-200 hover:border-slate-500 cursor-pointer"
            >
              {stage === 'paused' ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pause</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleFinishEarly}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#080D1A] border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-500 cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5 text-emerald-400" />
            <span>Finish Early</span>
          </button>
        </div>
      </header>

      {/* Preset Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: '3×3', arch: 'pr-01', diff: 'easy' as Difficulty },
          { label: '3×3 Practice 2', arch: 'pr-02', diff: 'easy' as Difficulty },
          { label: '3×3 Practice 3', arch: 'pr-06', diff: 'easy' as Difficulty },
          { label: '4×4', arch: 'pr-11', diff: 'intermediate' as Difficulty },
          { label: '5×5', arch: 'pr-21', diff: 'advanced' as Difficulty },
        ].map((preset) => {
          const isActive = config.archetypeId === preset.arch;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() =>
                setConfig((prev) => ({
                  ...prev,
                  archetypeId: preset.arch,
                  difficulty: preset.diff,
                  seed: createDeterministicSeed('PR'),
                }))
              }
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-md'
                  : 'bg-[#0E152B] text-slate-300 border-slate-800 hover:border-emerald-500/40 hover:text-white'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Main White Card Container — clicking outside the grid deselects the current piece */}
      <div
        onClick={() => {
          if (selectedCoord) {
            setSelectedCoord(null);
            setHasCycledSinceSelect(false);
          }
        }}
        className="relative rounded-[28px] bg-[#F4F6FA] border-[3px] border-[#1F2937] shadow-[0_24px_60px_rgba(0,0,0,0.55)] p-5 sm:p-7 text-slate-900 overflow-hidden"
      >
        {stage === 'paused' && (
          <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4">
            <Pause className="w-10 h-10 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Circuit Paused</h2>
            <p className="text-xs text-slate-300 max-w-sm">
              Conduit topology is concealed while paused to preserve timing integrity.
            </p>
            <button
              type="button"
              onClick={handleTogglePause}
              className="px-6 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 rounded-full hover:bg-emerald-300 cursor-pointer"
            >
              Resume Circuit
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left / Center: 3x3 Sub-Grid Arrow Matrix + Bottom Control Dock */}
          <div className="lg:col-span-7 flex flex-col items-center">
            {/* Outer padding wrapper so edge-anchored IN/OUT badges sit directly flush on the outer cell borders */}
            <div className="relative px-8 py-6 w-full flex justify-center">
              <div
                role="grid"
                aria-label="Path Rotation Circuit Grid"
                onClick={(e) => e.stopPropagation()}
                className="relative grid gap-0 w-full max-w-[400px] aspect-square rounded-[18px] bg-white border-[3px] border-[#3B4252] shadow-md overflow-visible"
                style={{
                  gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`,
                }}
              >
                {puzzle.tiles.map((rowTiles: PathTile[], r: number) =>
                  rowTiles.map((tile: PathTile, c: number) => {
                    const placedPiece = boardPieces[r]?.[c];
                    const energized = isEnergizedCell(r, c);
                    const isSelected = selectedCoord?.row === r && selectedCoord?.col === c;
                    const isLockedCell =
                      Boolean(placedPiece?.locked) ||
                      Boolean(placedPiece?.isBlocker) ||
                      tile.locked ||
                      tile.shape === 'blocker';

                    const activeRoute =
                      placedPiece && placedPiece.routeConfigs.length > 0
                        ? placedPiece.routeConfigs[
                            placedPiece.routeIndex % placedPiece.routeConfigs.length
                          ]
                        : undefined;

                    const inEdgeSide = boardEval.inEdgeSide;
                    const outEdgeSide = boardEval.outEdgeSide;

                    const inPositionClasses =
                      inEdgeSide === 'W'
                        ? 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2'
                        : inEdgeSide === 'N'
                        ? 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2'
                        : 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2';

                    const outPositionClasses =
                      outEdgeSide === 'S'
                        ? 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2'
                        : outEdgeSide === 'E'
                        ? 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2'
                        : 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2';

                    const outLabelText =
                      outEdgeSide === 'S'
                        ? 'OUT ↓'
                        : outEdgeSide === 'E'
                        ? 'OUT →'
                        : outEdgeSide === 'N'
                        ? 'OUT ↑'
                        : 'OUT ←';

                    return (
                      <div
                        key={`tile-${r}-${c}`}
                        role="button"
                        tabIndex={0}
                        data-testid={`path-piece-${r}-${c}`}
                        data-piece-id={placedPiece?.id}
                        data-rotation-deg={placedPiece?.rotationDeg ?? 0}
                        data-locked={isLockedCell ? 'true' : 'false'}
                        data-empty-slot={placedPiece?.isEmptySlot ? 'true' : 'false'}
                        data-selected={isSelected ? 'true' : 'false'}
                        data-swap-target={
                          hasCycledSinceSelect && !isLockedCell && !isSelected ? 'true' : 'false'
                        }
                        onClick={(e) => handleTileClick(r, c, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleTileClick(r, c);
                          }
                        }}
                        aria-label={`Row ${r + 1} Column ${c + 1} ${
                          placedPiece?.isBlocker
                            ? 'Fixed Obstacle'
                            : placedPiece?.isEmptySlot
                            ? 'Empty Slot'
                            : 'Path Piece'
                        }${tile.isSource ? ', Source IN' : ''}${tile.isSink ? ', Sink OUT' : ''}${
                          tile.isWaypoint ? ', Relay Checkpoint' : ''
                        }${isLockedCell ? ', Locked' : ''}${isSelected ? ', Selected' : ''}${
                          hasCycledSinceSelect && !isLockedCell && !isSelected
                            ? ', Available Swap Target'
                            : ''
                        }`}
                        className={`relative flex items-center justify-center border-[1.5px] border-[#4C566A] transition-all select-none ${
                          isLockedCell ? 'cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'z-20 ring-3 ring-[#F5B700] border-[#F5B700]'
                            : hasCycledSinceSelect && !isLockedCell
                            ? 'z-10 ring-2 ring-emerald-400 border-emerald-400 hover:ring-3 hover:ring-emerald-300'
                            : selectedCoord && !isLockedCell
                            ? 'hover:ring-2 hover:ring-emerald-400/75'
                            : ''
                        }`}
                      >
                        {/* Edge-Anchored "IN" Marker flush on outer entry border */}
                        {tile.isSource && (
                          <span
                            data-testid="path-in-edge-marker"
                            className={`pointer-events-none absolute ${inPositionClasses} z-30 inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-[#10B981] border-2 border-white text-white font-mono text-[11px] font-extrabold tracking-tight shadow-[0_3px_10px_rgba(16,185,129,0.55)] whitespace-nowrap`}
                          >
                            IN →
                          </span>
                        )}

                        {/* Edge-Anchored "OUT" Marker flush on outer exit border */}
                        {tile.isSink && (
                          <span
                            data-testid="path-out-edge-marker"
                            className={`pointer-events-none absolute ${outPositionClasses} z-30 inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-[#F59E0B] border-2 border-white text-white font-mono text-[11px] font-extrabold tracking-tight shadow-[0_3px_10px_rgba(245,158,11,0.55)] whitespace-nowrap`}
                          >
                            {outLabelText}
                          </span>
                        )}

                        <TileConduitSvg
                          sides={placedPiece?.lockedPorts ?? []}
                          energized={energized}
                          isSource={tile.isSource}
                          isSink={tile.isSink}
                          isWaypoint={tile.isWaypoint}
                          checkpointOrder={tile.checkpointOrder}
                          oneWayDirection={tile.requiredFlowDir}
                          isBlocker={Boolean(placedPiece?.isBlocker || tile.shape === 'blocker')}
                          isEmptySlot={Boolean(placedPiece?.isEmptySlot)}
                          isConnectedToSink={boardEval.isSolved}
                          lockedPorts={placedPiece?.lockedPorts ?? []}
                          activeRoute={activeRoute}
                          subgrid={placedPiece?.subgrid}
                          rotationDeg={placedPiece?.rotationDeg}
                          isSelectedPiece={isSelected}
                        />

                        {hasCycledSinceSelect && !isLockedCell && !isSelected && (
                          <span
                            data-testid={`path-swap-target-badge-${r}-${c}`}
                            className="pointer-events-none absolute top-1 right-1 p-0.5 rounded bg-emerald-600/95 text-white z-20 shadow"
                          >
                            <Repeat className="w-2.5 h-2.5" />
                          </span>
                        )}

                        {isLockedCell && !placedPiece?.isBlocker && tile.shape !== 'blocker' && (
                          <span
                            data-testid={`path-locked-badge-${r}-${c}`}
                            className="pointer-events-none absolute bottom-1 right-1 p-0.5 rounded bg-slate-900/80 text-amber-300 z-20 shadow"
                            title="Locked anchor piece (🔒)"
                          >
                            <Lock className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bottom Control Bar: Timer Ring | Rotate Selected Piece (↺) | Swap Mode (⇄) | Submit (✓) */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 flex flex-col items-center gap-2"
            >
              <div className="flex items-start justify-center gap-3.5">
                {/* Circular Countdown Ring */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 50 50">
                      <circle
                        cx="25"
                        cy="25"
                        r={ringRadius}
                        fill="none"
                        stroke="#E2E8F0"
                        strokeWidth="4.5"
                      />
                      <circle
                        cx="25"
                        cy="25"
                        r={ringRadius}
                        fill="none"
                        stroke={displaySec <= 7 ? '#EF4444' : '#334155'}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringDashOffset}
                      />
                    </svg>
                    <span className="absolute font-mono text-xs font-extrabold text-slate-900">
                      {displaySec}s
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-slate-500">Timer</span>
                </div>

                {/* Bottom Rotation Button (↺) — Rotates selected piece 90° clockwise */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    data-testid="path-rotate-button"
                    data-audio-rotate-count={rotateAudioCount}
                    onClick={handleRotateSelectedPiece}
                    className={`w-12 h-12 rounded-2xl bg-[#2D3139] text-white flex items-center justify-center shadow-md transition-all ${
                      selectedCoord
                        ? 'hover:bg-[#3B404A] ring-2 ring-[#F5B700]/85 cursor-pointer active:scale-95'
                        : 'opacity-60 cursor-not-allowed'
                    }`}
                    aria-label="Rotate selected piece 90 degrees clockwise (↺)"
                    title="Rotate Selected Piece 90° Clockwise (↺)"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <span className="text-[10px] font-mono font-bold text-slate-700">Rotate</span>
                </div>

                {/* Change Internal Arrows Button (⇄) — Changes arrows inside the selected piece without rotating the whole piece */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    data-testid="path-cycle-arrows-button"
                    data-arrows-cycled={hasCycledSinceSelect ? 'true' : 'false'}
                    onClick={() => handleCyclePieceArrows()}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md cursor-pointer transition-all active:scale-95 ${
                      hasCycledSinceSelect
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.5)]'
                        : 'bg-[#2D3139] hover:bg-[#3B404A] text-white'
                    }`}
                    aria-label="Change internal arrows inside selected path piece without rotating piece (⇄)"
                    title="Change Internal Arrows Inside Selected Path Piece (⇄)"
                  >
                    <Repeat className="w-5 h-5" />
                  </button>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      hasCycledSinceSelect ? 'text-emerald-600' : 'text-slate-700'
                    }`}
                  >
                    Arrows
                  </span>
                </div>

                {/* Submit / Check Route Button (✓) */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    data-testid="path-submit-button"
                    data-audio-submit-count={submitAudioCount}
                    data-last-audio-kind={lastAudioEvent?.kind ?? 'none'}
                    onClick={handleSubmitRoute}
                    className="w-12 h-12 rounded-2xl bg-[#2D3139] hover:bg-[#3B404A] text-white flex items-center justify-center shadow-md cursor-pointer transition-transform active:scale-95"
                    aria-label="Check and submit path connection"
                    title="Submit Route (✓)"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <span className="text-[10px] font-mono font-bold text-slate-700">Submit</span>
                </div>
              </div>

              <div
                data-testid="path-moves-counter"
                className="text-xs font-mono font-semibold text-slate-600"
              >
                Moves: {movesCount}
              </div>
            </div>
          </div>

          {/* Right Column: Dual-Layer Status, Selected Piece Inspector & Timer */}
          <div onClick={(e) => e.stopPropagation()} className="lg:col-span-5 space-y-4">
            <div className="p-4 rounded-2xl bg-[#0E152B] border border-slate-800 text-slate-100 space-y-3 shadow-lg">
              <div className="text-xs font-bold text-white">{metadata.promptText}</div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                <strong>1. Rotate Path Pieces In-Place (90° CW):</strong> Every path piece stays in
                its own grid cell. Click any unlocked piece or press <strong>Rotate (↺)</strong> to
                align the gray track from <strong>IN →</strong> to <strong>OUT ↓</strong>.
                <br />
                <strong>2. Change Internal Arrows (⇄):</strong> Even after aligning the gray pieces,
                press <strong>Arrows (⇄)</strong> (or click individual arrows in the 3×3 piece
                editor below) to change the arrows <em>inside</em> the selected piece without
                rotating the piece itself.
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80">
                <div className="p-2.5 rounded-xl bg-[#080D1A] border border-slate-800/80">
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    1. Physical Path
                  </div>
                  <div
                    data-testid="path-geometric-status"
                    className={`text-xs font-bold font-mono mt-0.5 ${
                      boardEval.isGeometricallyConnected ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {boardEval.isGeometricallyConnected ? 'Connected' : 'Scrambled / Broken'}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#080D1A] border border-slate-800/80">
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    2. Arrow Vectors
                  </div>
                  <div
                    data-testid="path-directional-status"
                    className={`text-xs font-bold font-mono mt-0.5 ${
                      boardEval.isDirectionallyAligned ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {boardEval.isDirectionallyAligned ? 'Aligned' : 'Needs Alignment'}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Piece Inspector + Internal Arrow Editor */}
            <div className="p-4 rounded-2xl bg-[#0E152B] border border-slate-800 text-slate-100 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">
                  {selectedCoord
                    ? `Selected Piece (${selectedCoord.row + 1}, ${selectedCoord.col + 1})`
                    : `Target Piece (${activeInspectorCoord.row + 1}, ${
                        activeInspectorCoord.col + 1
                      })`}
                </span>
                <span className="text-xs font-mono text-amber-300">
                  {inspectedPiece
                    ? `${inspectedPiece.rotationDeg}° CW · ${
                        inspectedPiece.activeEntry ?? '-'
                      } → ${inspectedPiece.activeExit ?? '-'}`
                    : 'N/A'}
                </span>
              </div>

              {/* Interactive 3x3 Sub-Grid Internal Arrow Editor */}
              {inspectedPiece && !inspectedPiece.isBlocker && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#080D1A] border border-slate-800/90">
                  <div
                    data-testid="inspector-subgrid-editor"
                    className="grid grid-cols-3 grid-rows-3 w-20 h-20 rounded-lg overflow-hidden border border-slate-600 shrink-0 bg-white"
                  >
                    {[0, 1, 2].map((sr) =>
                      [0, 1, 2].map((sc) => {
                        const subCell = inspectedPiece.subgrid[sr]?.[sc] ?? {
                          active: false,
                          arrow: null,
                        };
                        const isOccupied = subCell.active && Boolean(subCell.arrow);
                        const arrowAngle = subCell.arrow
                          ? ARROW_SYMBOL_TO_ANGLE[subCell.arrow]
                          : undefined;
                        return (
                          <button
                            key={`insp-${sr}-${sc}`}
                            type="button"
                            disabled={!isOccupied || inspectedPiece.locked}
                            data-testid={`inspector-subcell-${sr}-${sc}`}
                            data-arrow-symbol={subCell.arrow ?? undefined}
                            onClick={() => handleRotateSingleSubcellArrow(sr, sc)}
                            title={
                              isOccupied
                                ? `Click to rotate internal arrow (${sr + 1}, ${sc + 1}) inside this piece`
                                : undefined
                            }
                            className={`flex items-center justify-center border border-slate-300/80 transition-colors ${
                              isOccupied
                                ? 'bg-[#4B5563] hover:bg-emerald-600 text-white cursor-pointer'
                                : 'bg-white cursor-default'
                            }`}
                          >
                            {isOccupied && arrowAngle !== undefined && (
                              <SubCellArrowIcon angleDeg={arrowAngle} />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="text-[11px] text-slate-300 space-y-1 leading-snug">
                    <div className="font-semibold text-emerald-300">
                      Internal Arrow Controls
                    </div>
                    <p className="text-slate-400">
                      Click <strong>Change Arrows (⇄)</strong> to flip all arrows inside this piece,
                      or click any gray sub-cell on the left to rotate a single internal arrow.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleRotateSelectedPiece}
                  className="w-full py-2.5 px-3 text-xs font-semibold rounded-xl bg-[#080D1A] border border-amber-500/40 text-amber-300 hover:bg-amber-950/30 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Rotate Piece 90° (R)</span>
                </button>

                <button
                  type="button"
                  data-testid="inspector-swap-button"
                  onClick={() => handleCyclePieceArrows()}
                  className="w-full py-2.5 px-3 text-xs font-semibold rounded-xl border bg-[#080D1A] border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/30 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Repeat className="w-3.5 h-3.5 shrink-0" />
                  <span>Change Arrows (S)</span>
                </button>
              </div>
            </div>

            <TimerBar
              remainingSeconds={remainingSeconds}
              totalSeconds={metadata.timeLimitSeconds}
              visible={settings.showTimerCountdown}
              label="Circuit Countdown"
            />

            <FeedbackBanner message={feedbackMessage} tone={feedbackTone} />
          </div>
        </div>
      </div>
    </div>
  );
};
