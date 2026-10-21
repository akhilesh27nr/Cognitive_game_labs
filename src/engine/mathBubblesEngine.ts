import {
  normalizeDifficulty,
  type CanonicalDifficulty,
  type CognitiveErrorCategory,
  type Difficulty,
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
import {
  buildEvaluatedExpression,
  compareScaledValues,
  type EvaluatedExpression,
  type ExprNode,
} from './expressionEvaluator.ts';

export type BubbleOrderRule = 'ascending' | 'descending';

export interface MathBubbleItem {
  id: string;
  displayIndex: number; // 1..4
  label: string;
  numericValue: number;
  exactScaledValue: number;
  shortcutKey: string;
  isSelectableTarget: boolean;
  floatPhaseOffset: number; // For gentle non-intrusive floating animation
}

export interface MathBubblePuzzle {
  orderRule: BubbleOrderRule;
  bubbleCount: 3 | 4;
  allowIdenticalValues: boolean;
  tieBreakRuleText: string;
  evaluationMode: EvaluationMode;
  bubbles: MathBubbleItem[];
  expectedSequenceIds: string[];
}

export interface MathBubbleState {
  selectedIds: string[];
  mistakesCount: number;
  attemptsCount: number;
  errorCategoriesTriggered: CognitiveErrorCategory[];
  lastFeedback: string;
}

export type MathBubbleAction =
  | { type: 'select-bubble'; bubbleId: string }
  | { type: 'undo-last' }
  | { type: 'clear-selection' };

interface MathArchetypeDefinition {
  code: string;
  title: string;
  category: string;
  description: string;
  recommendedDifficulty: CanonicalDifficulty;
  defaultOrder: BubbleOrderRule;
  forceFourBubbles?: boolean;
  allowTies?: boolean;
}

export const MATH_ARCHETYPE_REGISTRY: readonly MathArchetypeDefinition[] = [
  { code: 'MB-01', title: 'Addition of Integers', category: 'Additive Fluency', description: 'Evaluate sums of positive integers and order from lowest to highest.', recommendedDifficulty: 'beginner', defaultOrder: 'ascending' },
  { code: 'MB-02', title: 'Subtraction of Integers', category: 'Subtractive Reasoning', description: 'Evaluate integer differences and order from lowest to highest.', recommendedDifficulty: 'beginner', defaultOrder: 'ascending' },
  { code: 'MB-03', title: 'Multiplication', category: 'Multiplicative Fluency', description: 'Evaluate integer products across core multiplication tables.', recommendedDifficulty: 'beginner', defaultOrder: 'ascending' },
  { code: 'MB-04', title: 'Exact Division', category: 'Division & Factors', description: 'Calculate exact integer quotients with zero remainder.', recommendedDifficulty: 'beginner', defaultOrder: 'ascending' },
  { code: 'MB-05', title: 'Mixed Addition and Subtraction', category: 'Mixed Arithmetic', description: 'Three-term addition and subtraction chains (a + b − c).', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-06', title: 'Multiplication Followed by Addition', category: 'Operator Precedence', description: 'Evaluate a × b + c expressions respecting multiplication before addition.', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-07', title: 'Multiplication Followed by Subtraction', category: 'Operator Precedence', description: 'Evaluate a × b − c expressions respecting operator precedence.', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-08', title: 'Division Followed by Addition', category: 'Operator Precedence', description: 'Evaluate a ÷ b + c expressions with exact integer quotients.', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-09', title: 'Division Followed by Subtraction', category: 'Operator Precedence', description: 'Evaluate a ÷ b − c expressions accurately under time pressure.', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-10', title: 'Bracket Precedence', category: 'Grouping & Precedence', description: 'Evaluate (a + b) × c and (a − b) ÷ c grouped expressions.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-11', title: 'Nested Bracket Precedence', category: 'Grouping & Precedence', description: 'Multi-layer grouped expressions such as ((a + b) × c) − d.', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-12', title: 'Negative Results', category: 'Signed Arithmetic', description: 'Subtractions that cross below zero (e.g., 7 − 15 = −8).', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-13', title: 'Negative Operands', category: 'Signed Arithmetic', description: 'Addition and subtraction involving explicit negative numbers.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-14', title: 'Negative Multiplied by Positive', category: 'Signed Arithmetic', description: 'Products of a negative integer and a positive integer.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-15', title: 'Negative Multiplied by Negative', category: 'Signed Arithmetic', description: 'Sign-reversal products of two negative integers (−a × −b).', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-16', title: 'Negative Division', category: 'Signed Arithmetic', description: 'Exact quotients with negative dividends or divisors.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-17', title: 'Decimal Addition', category: 'Decimal Precision', description: 'Sums of tenths and hundredths decimal values.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-18', title: 'Decimal Subtraction', category: 'Decimal Precision', description: 'Differences between terminating decimal values.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-19', title: 'Decimal Multiplication', category: 'Decimal Precision', description: 'Products of decimals with integers or tenths.', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-20', title: 'Decimal Division (Terminating)', category: 'Decimal Precision', description: 'Exact terminating decimal quotients without rounding ambiguity.', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-21', title: 'Fractions with Common Denominators', category: 'Fractional Value', description: 'Compare and combine fractions sharing a common denominator.', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-22', title: 'Fractions with Different Denominators', category: 'Fractional Value', description: 'Order fractions with denominators 2, 4, 5, 8, and 10.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-23', title: 'Fraction Addition and Subtraction', category: 'Fractional Value', description: 'Evaluate sums and differences of terminating fractions.', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-24', title: 'Integer and Fraction Combinations', category: 'Fractional Value', description: 'Evaluate mixed integer plus fraction expressions (e.g., 3 + 3/4).', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-25', title: 'Percentages of Integers', category: 'Proportional Reasoning', description: 'Calculate exact percentages (10%, 20%, 25%, 50%, 75%) of whole numbers.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-26', title: 'Percentage Increase', category: 'Proportional Reasoning', description: 'Evaluate base values increased by a stated percentage (N + P%).', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-27', title: 'Percentage Decrease', category: 'Proportional Reasoning', description: 'Evaluate base values discounted by a stated percentage (N − P%).', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-28', title: 'Square Numbers', category: 'Powers & Roots', description: 'Evaluate perfect squares (n²) combined with linear offsets.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-29', title: 'Square Roots of Perfect Squares', category: 'Powers & Roots', description: 'Evaluate exact principal square roots (√n) in arithmetic expressions.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-30', title: 'Cubes of Small Integers', category: 'Powers & Roots', description: 'Evaluate small integer cubes (2³ to 6³) and compare magnitudes.', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-31', title: 'Cube Roots of Perfect Cubes', category: 'Powers & Roots', description: 'Evaluate exact cube roots (∛8, ∛27, ∛64, ∛125, ∛216) with offsets.', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-32', title: 'Doubled Expressions', category: 'Scaling Operations', description: 'Evaluate 2 × (a + b) and 2 × (a − b) doubled quantities.', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-33', title: 'Halved Expressions', category: 'Scaling Operations', description: 'Evaluate (a + b) ÷ 2 midpoint and halving expressions.', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-34', title: 'Expressions with Repeated Operations', category: 'Multi-Step Chains', description: 'Evaluate repeated additions or multiplications (a + a + a or a × a × b).', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-35', title: 'Mixed Operator Precedence', category: 'Operator Precedence', description: 'Contrast a + b × c against (a + b) × c within the same bubble set.', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-36', title: 'Close-Value Ordering', category: 'High-Interference Comparison', description: 'Distinguish expressions whose values differ by only 1 or 0.5 units.', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-37', title: 'Negative Versus Positive Ordering', category: 'Signed Arithmetic', description: 'Sort mixed positive and negative outcomes across zero.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-38', title: 'Four-Bubble Ordering', category: 'Extended Working Memory', description: 'Four-bubble comparative ranking requiring full 4-item sort.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending', forceFourBubbles: true },
  { code: 'MB-39', title: 'Descending-Order Questions', category: 'Rule Reversal', description: 'Rank arithmetic expressions from HIGHEST value down to LOWEST.', recommendedDifficulty: 'intermediate', defaultOrder: 'descending', forceFourBubbles: true },
  { code: 'MB-40', title: 'Expressions with Identical Values', category: 'Tie-Breaking Logic', description: 'Includes equivalent expressions; ties are broken by lower bubble number [Key 1..4].', recommendedDifficulty: 'advanced', defaultOrder: 'ascending', forceFourBubbles: true, allowTies: true },
  { code: 'MB-41', title: 'Missing-Operation Arithmetic', category: 'Algebraic Deduction', description: 'Solve for ? in equations like ? + 7 = 19 and order by the value of ?.', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-42', title: 'Simple Proportional Arithmetic', category: 'Proportional Reasoning', description: 'Evaluate scaled ratios (e.g., 3/5 of 40 or 4 parts of 15).', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-43', title: 'Remainder-Based Arithmetic (Explicit Mod)', category: 'Modular Arithmetic', description: 'Order bubbles by the explicit remainder of a ÷ b (written a mod b).', recommendedDifficulty: 'advanced', defaultOrder: 'ascending' },
  { code: 'MB-44', title: 'Absolute-Value Expressions', category: 'Signed Arithmetic', description: 'Evaluate |a − b| magnitude expressions and sort ascending.', recommendedDifficulty: 'intermediate', defaultOrder: 'ascending' },
  { code: 'MB-45', title: 'Expressions with Zero', category: 'Identity & Zero Rules', description: 'Evaluate expressions containing 0 × n, n + 0, 0 ÷ n, and n − n.', recommendedDifficulty: 'beginner', defaultOrder: 'ascending' },
  { code: 'MB-46', title: 'Multiplication by Powers of Ten', category: 'Place Value Scaling', description: 'Multiply decimals and integers by 10, 100, and 0.1.', recommendedDifficulty: 'easy', defaultOrder: 'ascending' },
  { code: 'MB-47', title: 'Decimal-Place Comparisons', category: 'Decimal Precision', description: 'Compare tricky decimal magnitudes (e.g., 0.4 vs 0.35 vs 0.08 + 0.3).', recommendedDifficulty: 'advanced', defaultOrder: 'ascending', forceFourBubbles: true },
  { code: 'MB-48', title: 'Fraction-to-Decimal Comparisons', category: 'Cross-Representation', description: 'Compare fractions (3/4, 2/5) directly against decimals (0.7, 0.45).', recommendedDifficulty: 'advanced', defaultOrder: 'ascending', forceFourBubbles: true },
  { code: 'MB-49', title: 'Mixed Fractions and Percentages', category: 'Cross-Representation', description: 'Compare percentage expressions, fractions, and decimal sums in one arena.', recommendedDifficulty: 'expert', defaultOrder: 'descending', forceFourBubbles: true },
  { code: 'MB-50', title: 'Adaptive Multi-Operation Synthesis', category: 'Executive Synthesis', description: 'Expert synthesis combining roots, powers, brackets, negatives, and proportions.', recommendedDifficulty: 'expert', defaultOrder: 'descending', forceFourBubbles: true },
];

export const MATH_BUBBLES_ARCHETYPES: readonly PuzzleArchetype[] = MATH_ARCHETYPE_REGISTRY.map((def, idx) => ({
  id: def.code.toLowerCase(),
  gameType: 'math-bubbles',
  index: idx + 1,
  code: def.code,
  title: def.title,
  category: def.category,
  description: def.description,
  recommendedDifficulty: def.recommendedDifficulty,
  hasAutomatedTestCoverage: true,
}));

function lit(value: number, display?: string): ExprNode {
  return { kind: 'literal', value, display };
}

function bin(op: 'add' | 'sub' | 'mul' | 'div' | 'mod', left: ExprNode, right: ExprNode, bracketed = false): ExprNode {
  return { kind: 'binary', op, left, right, bracketed };
}

function un(op: 'neg' | 'abs' | 'square' | 'cube' | 'sqrt' | 'cbrt' | 'double' | 'half', operand: ExprNode): ExprNode {
  return { kind: 'unary', op, operand };
}

function difficultyScale(diff: CanonicalDifficulty): number {
  switch (diff) {
    case 'beginner':
      return 1;
    case 'easy':
      return 1.3;
    case 'intermediate':
      return 1.7;
    case 'advanced':
      return 2.2;
    case 'expert':
    case 'adaptive':
      return 2.8;
  }
}

/**
 * Data-driven AST generator for each of the 50 mathematical variation archetypes.
 */
export function generateArchetypeExpression(
  archetypeIndex: number,
  difficulty: CanonicalDifficulty,
  rng: SeededRandom,
  slotIndex: number
): EvaluatedExpression {
  const scale = difficultyScale(difficulty);
  const maxAdd = Math.round(12 * scale);

  switch (archetypeIndex) {
    case 1: {
      // 1. Addition of integers
      const a = rng.nextInt(2, maxAdd);
      const b = rng.nextInt(2, maxAdd);
      return buildEvaluatedExpression(bin('add', lit(a), lit(b)));
    }
    case 2: {
      // 2. Subtraction of integers
      const b = rng.nextInt(2, maxAdd);
      const d = rng.nextInt(2, maxAdd + 5);
      return buildEvaluatedExpression(bin('sub', lit(b + d), lit(b)));
    }
    case 3: {
      // 3. Multiplication
      const hi = difficulty === 'beginner' ? 7 : difficulty === 'easy' ? 9 : 14;
      const a = rng.nextInt(2, hi);
      const b = rng.nextInt(2, hi);
      return buildEvaluatedExpression(bin('mul', lit(a), lit(b)));
    }
    case 4: {
      // 4. Exact division
      const div = rng.nextInt(2, 9);
      const q = rng.nextInt(2, Math.round(10 * scale));
      return buildEvaluatedExpression(bin('div', lit(div * q), lit(div)));
    }
    case 5: {
      // 5. Mixed addition and subtraction
      const a = rng.nextInt(8, maxAdd + 10);
      const b = rng.nextInt(4, maxAdd);
      const c = rng.nextInt(2, Math.min(a + b - 1, maxAdd));
      return buildEvaluatedExpression(bin('sub', bin('add', lit(a), lit(b)), lit(c)));
    }
    case 6: {
      // 6. Multiplication followed by addition
      const a = rng.nextInt(2, 9);
      const b = rng.nextInt(2, 9);
      const c = rng.nextInt(2, 15);
      return buildEvaluatedExpression(bin('add', bin('mul', lit(a), lit(b)), lit(c)));
    }
    case 7: {
      // 7. Multiplication followed by subtraction
      const a = rng.nextInt(3, 10);
      const b = rng.nextInt(3, 10);
      const c = rng.nextInt(2, a * b - 1);
      return buildEvaluatedExpression(bin('sub', bin('mul', lit(a), lit(b)), lit(c)));
    }
    case 8: {
      // 8. Division followed by addition
      const d = rng.nextInt(2, 8);
      const q = rng.nextInt(2, 12);
      const c = rng.nextInt(3, 18);
      return buildEvaluatedExpression(bin('add', bin('div', lit(d * q), lit(d)), lit(c)));
    }
    case 9: {
      // 9. Division followed by subtraction
      const d = rng.nextInt(2, 8);
      const q = rng.nextInt(6, 18);
      const c = rng.nextInt(1, q - 1);
      return buildEvaluatedExpression(bin('sub', bin('div', lit(d * q), lit(d)), lit(c)));
    }
    case 10: {
      // 10. Bracket precedence
      const a = rng.nextInt(2, 9);
      const b = rng.nextInt(2, 8);
      const c = rng.nextInt(2, 6);
      return buildEvaluatedExpression(bin('mul', bin('add', lit(a), lit(b), true), lit(c)));
    }
    case 11: {
      // 11. Nested bracket precedence
      const a = rng.nextInt(2, 6);
      const b = rng.nextInt(2, 6);
      const c = rng.nextInt(2, 4);
      const d = rng.nextInt(2, 10);
      const inner = bin('add', lit(a), lit(b), true);
      const mid = bin('mul', inner, lit(c), true);
      return buildEvaluatedExpression(bin('sub', mid, lit(d)));
    }
    case 12: {
      // 12. Negative results
      const a = rng.nextInt(2, 14);
      const b = a + rng.nextInt(2, 18);
      return buildEvaluatedExpression(bin('sub', lit(a), lit(b)));
    }
    case 13: {
      // 13. Negative operands
      const a = -rng.nextInt(3, 18);
      const b = rng.nextInt(4, 22);
      return buildEvaluatedExpression(bin('add', lit(a), lit(b)));
    }
    case 14: {
      // 14. Negative multiplied by positive
      const a = -rng.nextInt(2, 9);
      const b = rng.nextInt(2, 8);
      return buildEvaluatedExpression(bin('mul', lit(a), lit(b)));
    }
    case 15: {
      // 15. Negative multiplied by negative
      const a = -rng.nextInt(2, 9);
      const b = -rng.nextInt(2, 9);
      return buildEvaluatedExpression(bin('mul', lit(a), lit(b)));
    }
    case 16: {
      // 16. Negative division
      const d = rng.nextInt(2, 8);
      const q = rng.nextInt(2, 12);
      return buildEvaluatedExpression(bin('div', lit(-d * q), lit(d)));
    }
    case 17: {
      // 17. Decimal addition
      const a = rng.nextInt(11, 59) / 10;
      const b = rng.nextInt(11, 49) / 10;
      return buildEvaluatedExpression(
        bin('add', lit(a, a.toFixed(1)), lit(b, b.toFixed(1)))
      );
    }
    case 18: {
      // 18. Decimal subtraction
      const b = rng.nextInt(11, 45) / 10;
      const diff = rng.nextInt(5, 45) / 10;
      const a = Number((b + diff).toFixed(1));
      return buildEvaluatedExpression(
        bin('sub', lit(a, a.toFixed(1)), lit(b, b.toFixed(1)))
      );
    }
    case 19: {
      // 19. Decimal multiplication
      const a = rng.nextInt(2, 15) / 2; // x.0 or x.5
      const b = rng.nextInt(2, 8);
      return buildEvaluatedExpression(
        bin('mul', lit(a, a.toFixed(1)), lit(b))
      );
    }
    case 20: {
      // 20. Decimal division with terminating results
      const divisors = [2, 4, 5];
      const d = rng.pick(divisors);
      const qTenths = rng.nextInt(4, 36);
      const dividend = Number(((qTenths / 10) * d).toFixed(2));
      return buildEvaluatedExpression(
        bin('div', lit(dividend, String(dividend)), lit(d))
      );
    }
    case 21: {
      // 21. Fractions with common denominators
      const den = rng.pick([4, 5, 8, 10]);
      const a = rng.nextInt(1, den * 2);
      const b = rng.nextInt(1, den * 2);
      return buildEvaluatedExpression(
        bin('add', { kind: 'fraction', numerator: a, denominator: den }, { kind: 'fraction', numerator: b, denominator: den })
      );
    }
    case 22: {
      // 22. Fractions with different denominators
      const pairs: Array<[number, number]> = [
        [1, 2],
        [3, 4],
        [2, 5],
        [3, 5],
        [4, 5],
        [3, 8],
        [5, 8],
        [7, 10],
        [9, 10],
        [5, 4],
        [7, 5],
      ];
      const [num, den] = pairs[(slotIndex + rng.nextInt(0, pairs.length - 1)) % pairs.length];
      const mult = rng.nextInt(1, 3);
      return buildEvaluatedExpression({
        kind: 'fraction',
        numerator: num * mult,
        denominator: den,
      });
    }
    case 23: {
      // 23. Fraction addition and subtraction
      const denA = rng.pick([2, 4]);
      const denB = rng.pick([5, 10]);
      const numA = rng.nextInt(1, 7);
      const numB = rng.nextInt(1, 9);
      const op = rng.nextBool() ? 'add' : 'sub';
      return buildEvaluatedExpression(
        bin(
          op,
          { kind: 'fraction', numerator: numA, denominator: denA },
          { kind: 'fraction', numerator: numB, denominator: denB }
        )
      );
    }
    case 24: {
      // 24. Integer and fraction combinations
      const whole = rng.nextInt(1, 8);
      const den = rng.pick([2, 4, 5, 10]);
      const num = rng.nextInt(1, den - 1);
      return buildEvaluatedExpression({
        kind: 'mixed-fraction',
        whole,
        numerator: num,
        denominator: den,
      });
    }
    case 25: {
      // 25. Percentages of integers
      const pct = rng.pick([10, 20, 25, 40, 50, 75]);
      const base = rng.nextInt(2, 16) * 4;
      return buildEvaluatedExpression({ kind: 'percent-of', percent: pct, base });
    }
    case 26: {
      // 26. Percentage increase
      const pct = rng.pick([10, 20, 25, 50]);
      const base = rng.nextInt(2, 12) * 10;
      return buildEvaluatedExpression({
        kind: 'percent-change',
        base,
        percent: pct,
        direction: 'increase',
      });
    }
    case 27: {
      // 27. Percentage decrease
      const pct = rng.pick([10, 20, 25, 40, 50]);
      const base = rng.nextInt(2, 14) * 10;
      return buildEvaluatedExpression({
        kind: 'percent-change',
        base,
        percent: pct,
        direction: 'decrease',
      });
    }
    case 28: {
      // 28. Square numbers
      const n = rng.nextInt(2, 12);
      const offset = rng.nextInt(1, 15);
      return buildEvaluatedExpression(bin('add', un('square', lit(n)), lit(offset)));
    }
    case 29: {
      // 29. Square roots of perfect squares
      const root = rng.nextInt(3, 15);
      const offset = rng.nextInt(2, 16);
      return buildEvaluatedExpression(bin('add', un('sqrt', lit(root * root)), lit(offset)));
    }
    case 30: {
      // 30. Cubes of small integers
      const base = rng.nextInt(2, 5);
      const offset = rng.nextInt(1, 20);
      return buildEvaluatedExpression(bin('sub', un('cube', lit(base)), lit(offset)));
    }
    case 31: {
      // 31. Cube roots of perfect cubes
      const root = rng.nextInt(2, 6);
      const cube = root * root * root;
      const mult = rng.nextInt(2, 7);
      return buildEvaluatedExpression(bin('mul', un('cbrt', lit(cube)), lit(mult)));
    }
    case 32: {
      // 32. Doubled expressions
      const a = rng.nextInt(3, 18);
      const b = rng.nextInt(2, 14);
      return buildEvaluatedExpression(un('double', bin('add', lit(a), lit(b))));
    }
    case 33: {
      // 33. Halved expressions
      const a = rng.nextInt(4, 24);
      const b = rng.nextInt(4, 24);
      return buildEvaluatedExpression(un('half', bin('add', lit(a), lit(b))));
    }
    case 34: {
      // 34. Expressions with repeated operations
      const a = rng.nextInt(2, 9);
      const b = rng.nextInt(2, 9);
      const c = rng.nextInt(2, 9);
      return buildEvaluatedExpression(bin('add', bin('add', lit(a), lit(b)), lit(c)));
    }
    case 35: {
      // 35. Expressions with mixed operator precedence
      const a = rng.nextInt(2, 8);
      const b = rng.nextInt(2, 7);
      const c = rng.nextInt(2, 5);
      if (slotIndex % 2 === 0) {
        return buildEvaluatedExpression(bin('add', lit(a), bin('mul', lit(b), lit(c))));
      }
      return buildEvaluatedExpression(bin('mul', bin('add', lit(a), lit(b), true), lit(c)));
    }
    case 36: {
      // 36. Close-value ordering (clustered around anchor 50)
      const target = 50 + slotIndex * 2 + rng.nextInt(-1, 1);
      const partA = rng.nextInt(15, 35);
      const partB = target - partA;
      return buildEvaluatedExpression(bin('add', lit(partA), lit(partB)));
    }
    case 37: {
      // 37. Negative versus positive ordering
      const sign = slotIndex % 2 === 0 ? -1 : 1;
      const a = rng.nextInt(4, 18) * sign;
      const b = rng.nextInt(2, 12);
      return buildEvaluatedExpression(bin('add', lit(a), lit(b)));
    }
    case 38: {
      // 38. Four-bubble ordering
      const a = rng.nextInt(4, 15);
      const b = rng.nextInt(2, 8);
      const c = rng.nextInt(3, 12);
      return buildEvaluatedExpression(bin('sub', bin('mul', lit(a), lit(b)), lit(c)));
    }
    case 39: {
      // 39. Descending-order questions
      const a = rng.nextInt(10, 45);
      const b = rng.nextInt(5, 35);
      return buildEvaluatedExpression(bin('add', lit(a), lit(b)));
    }
    case 40: {
      // 40. Expressions with identical values (permitted & explicitly tested)
      const sharedTarget = 24;
      if (slotIndex === 0) {
        return buildEvaluatedExpression(bin('mul', lit(6), lit(4)));
      }
      if (slotIndex === 1) {
        return buildEvaluatedExpression(bin('add', lit(15), lit(9)));
      }
      const other = sharedTarget + (slotIndex === 2 ? -6 : 8) + rng.nextInt(1, 5);
      return buildEvaluatedExpression(bin('add', lit(other - 5), lit(5)));
    }
    case 41: {
      // 41. Missing-operation arithmetic (? + b = c)
      const solved = rng.nextInt(4, 28);
      const b = rng.nextInt(5, 19);
      const total = solved + b;
      return buildEvaluatedExpression({
        kind: 'missing-operand',
        promptLabel: `? + ${b} = ${total}`,
        solvedValue: solved,
      });
    }
    case 42: {
      // 42. Simple proportional arithmetic
      const unit = rng.nextInt(3, 12);
      const parts = rng.nextInt(2, 7);
      return buildEvaluatedExpression(
        bin('mul', { kind: 'fraction', numerator: parts, denominator: 2 }, lit(unit * 2))
      );
    }
    case 43: {
      // 43. Remainder-based arithmetic (explicit mod)
      const mod = rng.nextInt(5, 13);
      const rem = rng.nextInt(1, mod - 1);
      const mult = rng.nextInt(3, 8);
      return buildEvaluatedExpression(bin('mod', lit(mult * mod + rem), lit(mod)));
    }
    case 44: {
      // 44. Absolute-value expressions
      const a = rng.nextInt(3, 18);
      const b = rng.nextInt(20, 48);
      return buildEvaluatedExpression(un('abs', bin('sub', lit(a), lit(b))));
    }
    case 45: {
      // 45. Expressions with zero
      if (slotIndex === 0) {
        const n = rng.nextInt(5, 25);
        return buildEvaluatedExpression(bin('mul', lit(0), lit(n)));
      }
      if (slotIndex === 1) {
        const n = rng.nextInt(4, 18);
        return buildEvaluatedExpression(bin('add', lit(n), lit(0)));
      }
      const n = rng.nextInt(6, 28);
      return buildEvaluatedExpression(bin('sub', lit(n), lit(rng.nextInt(1, n - 1))));
    }
    case 46: {
      // 46. Multiplication by powers of ten
      const pow = rng.pick([10, 100]);
      const dec = rng.nextInt(12, 95) / (pow === 10 ? 10 : 100);
      return buildEvaluatedExpression(bin('mul', lit(dec, String(dec)), lit(pow)));
    }
    case 47: {
      // 47. Decimal-place comparisons
      const candidates = [
        [0.4, 0.05],
        [0.35, 0.08],
        [0.5, 0.02],
        [0.28, 0.19],
        [0.6, 0.04],
        [0.48, 0.11],
      ];
      const [a, b] = candidates[(slotIndex + rng.nextInt(0, candidates.length - 1)) % candidates.length];
      const jitter = rng.nextInt(1, 9) / 100;
      const bAdj = Number((b + jitter).toFixed(2));
      return buildEvaluatedExpression(bin('add', lit(a, String(a)), lit(bAdj, bAdj.toFixed(2))));
    }
    case 48: {
      // 48. Fraction-to-decimal comparisons
      if (slotIndex % 2 === 0) {
        const den = rng.pick([4, 5, 10]);
        const num = rng.nextInt(1, den * 2 - 1);
        return buildEvaluatedExpression({ kind: 'fraction', numerator: num, denominator: den });
      }
      const dec = rng.nextInt(15, 185) / 100;
      return buildEvaluatedExpression(lit(dec, dec.toFixed(2)));
    }
    case 49: {
      // 49. Mixed fractions and percentages
      if (slotIndex % 3 === 0) {
        const pct = rng.pick([20, 25, 50, 75]);
        const base = rng.nextInt(2, 10) * 4;
        return buildEvaluatedExpression({ kind: 'percent-of', percent: pct, base });
      }
      if (slotIndex % 3 === 1) {
        const whole = rng.nextInt(2, 9);
        return buildEvaluatedExpression({ kind: 'mixed-fraction', whole, numerator: 1, denominator: 2 });
      }
      const d = rng.nextInt(15, 95) / 10;
      return buildEvaluatedExpression(bin('add', lit(d, d.toFixed(1)), lit(1.5, '1.5')));
    }
    case 50:
    default: {
      // 50. Adaptive challenge questions combining multiple previously introduced operations
      const root = rng.nextInt(3, 9);
      const mult = rng.nextInt(2, 6);
      const offset = rng.nextInt(-12, 18);
      const left = bin('mul', un('sqrt', lit(root * root)), lit(mult), true);
      return buildEvaluatedExpression(
        offset >= 0 ? bin('add', left, lit(offset)) : bin('sub', left, lit(Math.abs(offset)))
      );
    }
  }
}

function classifyErrorCategory(
  puzzle: MathBubblePuzzle,
  archetypeIndex: number,
  selectedBubbleId: string,
  expectedBubbleId: string
): CognitiveErrorCategory {
  const chosen = puzzle.bubbles.find((b) => b.id === selectedBubbleId);
  const expected = puzzle.bubbles.find((b) => b.id === expectedBubbleId);
  if (!chosen || !expected) return 'order-inversion';

  if (chosen.numericValue < 0 || expected.numericValue < 0) {
    return 'negative-sign-error';
  }
  if ([6, 7, 8, 9, 10, 11, 35].includes(archetypeIndex)) {
    return 'operator-precedence-error';
  }
  if ([21, 22, 23, 24, 48, 49].includes(archetypeIndex)) {
    return 'fraction-decimal-conversion-error';
  }
  if (Math.abs(chosen.numericValue - expected.numericValue) <= 1.5) {
    return 'close-value-precision-error';
  }
  return 'order-inversion';
}

export const mathBubblesEngine: GameEngine<MathBubblePuzzle, MathBubbleState, MathBubbleAction> = {
  gameType: 'math-bubbles',
  title: 'Math Bubble Arena',
  shortDescription:
    'Evaluate floating arithmetic expressions and select bubbles in strict numerical order under a configurable per-question timer.',
  archetypes: MATH_BUBBLES_ARCHETYPES,

  generatePuzzle(config: GameConfig, questionIndex: number) {
    const effectiveDifficulty = resolveEffectiveDifficulty(config.difficulty, questionIndex);
    const rng = new SeededRandom(`${config.seed}::math-bubbles::q${questionIndex}`);

    let archetype = MATH_BUBBLES_ARCHETYPES[questionIndex % MATH_BUBBLES_ARCHETYPES.length];
    if (config.archetypeId) {
      const found = MATH_BUBBLES_ARCHETYPES.find(
        (a) => a.id === config.archetypeId?.toLowerCase() || a.code.toLowerCase() === config.archetypeId?.toLowerCase()
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
      const pool = MATH_BUBBLES_ARCHETYPES.filter(
        (a) => Math.abs(difficultyRank[a.recommendedDifficulty] - targetRank) <= 1
      );
      archetype = rng.pick(pool.length > 0 ? pool : MATH_BUBBLES_ARCHETYPES);
    }

    const def = MATH_ARCHETYPE_REGISTRY[archetype.index - 1] ?? MATH_ARCHETYPE_REGISTRY[0];

    // Support 3-bubble and 4-bubble questions as required in Section A1
    const bubbleCount: 3 | 4 =
      def.forceFourBubbles ||
      effectiveDifficulty === 'advanced' ||
      effectiveDifficulty === 'expert' ||
      (effectiveDifficulty === 'intermediate' && questionIndex % 2 === 1)
        ? 4
        : 3;

    const orderRule: BubbleOrderRule =
      def.defaultOrder === 'descending' ||
      (archetype.index !== 40 && effectiveDifficulty !== 'beginner' && questionIndex % 4 === 3)
        ? 'descending'
        : 'ascending';

    const allowIdenticalValues = Boolean(def.allowTies);
    const usedScaledValues = new Set<number>();
    const usedLabels = new Set<string>();
    const evaluatedItems: EvaluatedExpression[] = [];

    for (let slot = 0; slot < bubbleCount; slot++) {
      let chosen: EvaluatedExpression | null = null;
      for (let attempt = 0; attempt < 60; attempt++) {
        const candidate = generateArchetypeExpression(archetype.index, effectiveDifficulty, rng, slot);
        const isDuplicateValue = usedScaledValues.has(candidate.exactScaledValue);
        const isDuplicateLabel = usedLabels.has(candidate.label);

        if (!isDuplicateLabel && (allowIdenticalValues || !isDuplicateValue)) {
          chosen = candidate;
          break;
        }
      }

      if (!chosen) {
        // Deterministic unique fallback
        let offset = (slot + 1) * 7 + rng.nextInt(1, 20);
        while (usedScaledValues.has(offset * 1_000_000)) {
          offset += 1;
        }
        chosen = buildEvaluatedExpression(bin('add', lit(offset - 3), lit(3)));
      }

      usedScaledValues.add(chosen.exactScaledValue);
      usedLabels.add(chosen.label);
      evaluatedItems.push(chosen);
    }

    const shuffled = rng.shuffle(evaluatedItems);
    const bubbles: MathBubbleItem[] = shuffled.map((item, idx) => ({
      id: `bubble-${questionIndex}-${idx + 1}`,
      displayIndex: idx + 1,
      label: item.label,
      numericValue: item.numericValue,
      exactScaledValue: item.exactScaledValue,
      shortcutKey: String(idx + 1),
      isSelectableTarget: true,
      floatPhaseOffset: (idx * 90) % 360,
    }));

    const sortedTargets = [...bubbles].sort((a, b) =>
      compareScaledValues(
        a.exactScaledValue,
        b.exactScaledValue,
        orderRule,
        a.displayIndex,
        b.displayIndex
      )
    );

    const expectedSequenceIds = sortedTargets.map((b) => b.id);

    const tieBreakRuleText = allowIdenticalValues
      ? 'Tie-breaker rule: If two bubbles have the exact same numeric value, select the lower-numbered bubble [Key 1..4] first.'
      : 'Each bubble evaluates to a unique value.';

    const promptText =
      orderRule === 'ascending'
        ? 'Select bubbles in order from LOWEST to HIGHEST value'
        : 'Select bubbles in order from HIGHEST to LOWEST value';

    const ruleSubtext =
      orderRule === 'ascending'
        ? `Evaluate all ${bubbleCount} expressions and select from smallest to largest. ${tieBreakRuleText}`
        : `Evaluate all ${bubbleCount} expressions and select from largest down to smallest. ${tieBreakRuleText}`;

    const metadata: PuzzleMetadata = {
      puzzleId: `mb-${config.seed}-q${questionIndex}`,
      gameType: 'math-bubbles',
      archetypeId: archetype.id,
      archetypeTitle: `${archetype.code} · ${archetype.title}`,
      category: archetype.category,
      difficulty: effectiveDifficulty,
      seed: `${config.seed}::q${questionIndex}`,
      questionIndex,
      timeLimitSeconds: config.perQuestionTimeSeconds || 15,
      promptText,
      ruleSubtext,
    };

    const puzzle: MathBubblePuzzle = {
      orderRule,
      bubbleCount,
      allowIdenticalValues,
      tieBreakRuleText,
      evaluationMode: config.evaluationMode ?? 'practice',
      bubbles,
      expectedSequenceIds,
    };

    const initialState: MathBubbleState = {
      selectedIds: [],
      mistakesCount: 0,
      attemptsCount: 0,
      errorCategoriesTriggered: [],
      lastFeedback: `Select ${bubbleCount} bubbles (${orderRule === 'ascending' ? 'Lowest → Highest' : 'Highest → Lowest'}).`,
    };

    return { metadata, puzzle, initialState };
  },

  validateAction(
    puzzle: MathBubblePuzzle,
    state: MathBubbleState,
    action: MathBubbleAction
  ): ValidationOutcome<MathBubbleState> {
    if (action.type === 'clear-selection') {
      const nextState: MathBubbleState = {
        ...state,
        selectedIds: [],
        lastFeedback: 'Selection reset.',
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

    if (action.type === 'undo-last') {
      if (state.selectedIds.length === 0) {
        return {
          valid: false,
          isComplete: false,
          isCorrect: false,
          mistakeMade: false,
          nextState: state,
          feedbackMessage: 'No selected bubble to undo.',
        };
      }
      const nextState: MathBubbleState = {
        ...state,
        selectedIds: state.selectedIds.slice(0, -1),
        lastFeedback: 'Removed last selected bubble.',
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

    // Prevent duplicate selections
    if (state.selectedIds.includes(action.bubbleId)) {
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState: {
          ...state,
          lastFeedback: 'That bubble is already selected in your sequence.',
        },
        feedbackMessage: 'That bubble is already selected in your sequence.',
      };
    }

    const exists = puzzle.bubbles.some((b) => b.id === action.bubbleId);
    if (!exists) {
      return {
        valid: false,
        isComplete: false,
        isCorrect: false,
        mistakeMade: false,
        nextState: state,
        feedbackMessage: 'Invalid bubble selection.',
      };
    }

    const stepIndex = state.selectedIds.length;
    const expectedNextId = puzzle.expectedSequenceIds[stepIndex];
    const chosenBubble = puzzle.bubbles.find((b) => b.id === action.bubbleId);
    const expectedBubble = puzzle.bubbles.find((b) => b.id === expectedNextId);

    const updatedSelected = [...state.selectedIds, action.bubbleId];
    const isSequenceFull = updatedSelected.length === puzzle.expectedSequenceIds.length;
    const isStepCorrect =
      action.bubbleId === expectedNextId ||
      (Boolean(chosenBubble && expectedBubble) &&
        chosenBubble!.exactScaledValue === expectedBubble!.exactScaledValue);

    const isFullOrderCorrect =
      isSequenceFull &&
      puzzle.expectedSequenceIds.every((expId, idx) => {
        const pickedId = updatedSelected[idx];
        if (pickedId === expId) return true;
        const pickedB = puzzle.bubbles.find((b) => b.id === pickedId);
        const expB = puzzle.bubbles.find((b) => b.id === expId);
        return Boolean(pickedB && expB && pickedB.exactScaledValue === expB.exactScaledValue);
      });

    const archIdx = 1;
    const errCat = !isStepCorrect
      ? classifyErrorCategory(puzzle, archIdx, action.bubbleId, expectedNextId)
      : 'none';

    const nextMistakes = isStepCorrect ? state.mistakesCount : state.mistakesCount + 1;

    if (puzzle.evaluationMode === 'exam') {
      const nextState: MathBubbleState = {
        selectedIds: updatedSelected,
        mistakesCount: nextMistakes,
        attemptsCount: state.attemptsCount + 1,
        errorCategoriesTriggered:
          errCat !== 'none'
            ? [...state.errorCategoriesTriggered, errCat]
            : state.errorCategoriesTriggered,
        lastFeedback: isSequenceFull
          ? 'Sequence complete. Validating selections and advancing to next question.'
          : `Bubble ${updatedSelected.length} of ${puzzle.expectedSequenceIds.length} selected.`,
      };

      return {
        valid: true,
        isComplete: isSequenceFull,
        isCorrect: isFullOrderCorrect,
        mistakeMade: isSequenceFull && !isFullOrderCorrect,
        nextState,
        feedbackMessage: nextState.lastFeedback,
      };
    }

    let feedback = `Assigned #${updatedSelected.length} of ${puzzle.expectedSequenceIds.length}.`;
    if (isSequenceFull) {
      feedback = isFullOrderCorrect
        ? 'Correct ordering! All bubbles verified in green.'
        : `Sequence evaluated: green = correct rank, red = wrong order slot.`;
    }

    const nextState: MathBubbleState = {
      selectedIds: updatedSelected,
      mistakesCount: nextMistakes,
      attemptsCount: state.attemptsCount + 1,
      errorCategoriesTriggered:
        errCat !== 'none'
          ? [...state.errorCategoriesTriggered, errCat]
          : state.errorCategoriesTriggered,
      lastFeedback: feedback,
    };

    return {
      valid: true,
      isComplete: isFullOrderCorrect,
      isCorrect: isFullOrderCorrect,
      mistakeMade: !isStepCorrect,
      nextState,
      feedbackMessage: feedback,
    };
  },

  isPuzzleComplete(puzzle: MathBubblePuzzle, state: MathBubbleState): boolean {
    if (state.selectedIds.length !== puzzle.expectedSequenceIds.length) return false;
    return puzzle.expectedSequenceIds.every((id, idx) => state.selectedIds[idx] === id);
  },

  calculateQuestionResult({ metadata, puzzle, finalState, elapsedMs, timedOut }): QuestionResult {
    const isCorrect = !timedOut && this.isPuzzleComplete(puzzle, finalState);
    const correctSteps = finalState.selectedIds.filter(
      (id, idx) => puzzle.expectedSequenceIds[idx] === id
    ).length;
    const partialCredit =
      puzzle.expectedSequenceIds.length > 0
        ? correctSteps / puzzle.expectedSequenceIds.length
        : 0;
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
      : finalState.errorCategoriesTriggered[0] ?? 'order-inversion';

    return {
      puzzleId: metadata.puzzleId,
      gameType: 'math-bubbles',
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
      attemptsCount: Math.max(1, finalState.attemptsCount),
      mistakesCount: finalState.mistakesCount,
      errorCategory,
      summaryText: isCorrect
        ? `Ordered ${puzzle.expectedSequenceIds.length} bubbles (${puzzle.orderRule}) in ${(
            elapsedMs / 1000
          ).toFixed(1)}s (${finalState.mistakesCount} mistakes)`
        : timedOut
        ? `Timed out at ${correctSteps}/${puzzle.expectedSequenceIds.length} correct positions`
        : `Incorrect ordering (${correctSteps}/${puzzle.expectedSequenceIds.length} matched, ${finalState.mistakesCount} mistakes)`,
    };
  },
};
