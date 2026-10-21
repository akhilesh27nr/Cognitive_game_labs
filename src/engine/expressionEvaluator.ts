/**
 * Safe Structured Expression AST & Exact Scaled-Integer / Rational Evaluator
 * Never uses unsafe eval(). Guarantees finite numeric results, no division by zero,
 * exact operator precedence, and zero floating-point comparison drift.
 */

export const SCALE_FACTOR = 1_000_000; // Exact 6-decimal-place scaled integer representation

export type BinaryOp = 'add' | 'sub' | 'mul' | 'div' | 'mod';
export type UnaryOp = 'neg' | 'abs' | 'square' | 'cube' | 'sqrt' | 'cbrt' | 'double' | 'half';

export type ExprNode =
  | { kind: 'literal'; value: number; display?: string }
  | { kind: 'fraction'; numerator: number; denominator: number }
  | { kind: 'mixed-fraction'; whole: number; numerator: number; denominator: number }
  | { kind: 'percent-of'; percent: number; base: number }
  | { kind: 'percent-change'; base: number; percent: number; direction: 'increase' | 'decrease' }
  | { kind: 'unary'; op: UnaryOp; operand: ExprNode }
  | { kind: 'binary'; op: BinaryOp; left: ExprNode; right: ExprNode; bracketed?: boolean }
  | { kind: 'missing-operand'; promptLabel: string; solvedValue: number };

export interface EvaluatedExpression {
  label: string;
  exactScaledValue: number; // Math.round(numericValue * SCALE_FACTOR)
  numericValue: number;
  ast: ExprNode;
}

function assertFiniteValue(n: number, context: string): void {
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    throw new Error(`Invalid non-finite expression value in ${context}`);
  }
}

/**
 * Evaluates a structured ExprNode into an exact numeric value without eval().
 */
export function evaluateExprNode(node: ExprNode): number {
  switch (node.kind) {
    case 'literal': {
      assertFiniteValue(node.value, 'literal');
      return node.value;
    }
    case 'fraction': {
      if (node.denominator === 0) {
        throw new Error('Division by zero in fraction');
      }
      const res = node.numerator / node.denominator;
      assertFiniteValue(res, 'fraction');
      return res;
    }
    case 'mixed-fraction': {
      if (node.denominator === 0) {
        throw new Error('Division by zero in mixed-fraction');
      }
      const sign = node.whole < 0 ? -1 : 1;
      const res = node.whole + sign * (node.numerator / node.denominator);
      assertFiniteValue(res, 'mixed-fraction');
      return res;
    }
    case 'percent-of': {
      const res = (node.percent / 100) * node.base;
      assertFiniteValue(res, 'percent-of');
      return res;
    }
    case 'percent-change': {
      const delta = (node.percent / 100) * node.base;
      const res = node.direction === 'increase' ? node.base + delta : node.base - delta;
      assertFiniteValue(res, 'percent-change');
      return res;
    }
    case 'missing-operand': {
      assertFiniteValue(node.solvedValue, 'missing-operand');
      return node.solvedValue;
    }
    case 'unary': {
      const v = evaluateExprNode(node.operand);
      let res = 0;
      switch (node.op) {
        case 'neg':
          res = -v;
          break;
        case 'abs':
          res = Math.abs(v);
          break;
        case 'square':
          res = v * v;
          break;
        case 'cube':
          res = v * v * v;
          break;
        case 'sqrt':
          if (v < 0) throw new Error('Square root of negative number');
          res = Math.sqrt(v);
          break;
        case 'cbrt':
          res = Math.cbrt(v);
          break;
        case 'double':
          res = v * 2;
          break;
        case 'half':
          res = v / 2;
          break;
      }
      assertFiniteValue(res, `unary:${node.op}`);
      return res;
    }
    case 'binary': {
      const l = evaluateExprNode(node.left);
      const r = evaluateExprNode(node.right);
      let res = 0;
      switch (node.op) {
        case 'add':
          res = l + r;
          break;
        case 'sub':
          res = l - r;
          break;
        case 'mul':
          res = l * r;
          break;
        case 'div':
          if (r === 0) throw new Error('Division by zero in binary div');
          res = l / r;
          break;
        case 'mod':
          if (r === 0) throw new Error('Modulo by zero');
          res = ((l % r) + r) % r;
          break;
      }
      assertFiniteValue(res, `binary:${node.op}`);
      return res;
    }
  }
}

/**
 * Formats an ExprNode into a clean, unambiguous human-readable mathematical expression.
 */
export function formatExprNode(node: ExprNode): string {
  switch (node.kind) {
    case 'literal': {
      if (node.display) return node.display;
      return node.value < 0 ? `(${node.value})` : String(node.value);
    }
    case 'fraction':
      return `${node.numerator}/${node.denominator}`;
    case 'mixed-fraction':
      return `${node.whole} ${node.numerator}/${node.denominator}`;
    case 'percent-of':
      return `${node.percent}% of ${node.base}`;
    case 'percent-change':
      return `${node.base} ${node.direction === 'increase' ? '+' : '−'} ${node.percent}%`;
    case 'missing-operand':
      return node.promptLabel;
    case 'unary': {
      const inner = formatExprNode(node.operand);
      switch (node.op) {
        case 'neg':
          return `−${inner}`;
        case 'abs':
          return `|${inner}|`;
        case 'square':
          return `${inner}²`;
        case 'cube':
          return `${inner}³`;
        case 'sqrt':
          return `√${inner}`;
        case 'cbrt':
          return `∛${inner}`;
        case 'double':
          return `2 × (${inner})`;
        case 'half':
          return `(${inner}) ÷ 2`;
      }
      break;
    }
    case 'binary': {
      const leftStr = formatExprNode(node.left);
      const rightStr = formatExprNode(node.right);
      const sym =
        node.op === 'add'
          ? '+'
          : node.op === 'sub'
          ? '−'
          : node.op === 'mul'
          ? '×'
          : node.op === 'div'
          ? '÷'
          : 'mod';
      const core = `${leftStr} ${sym} ${rightStr}`;
      return node.bracketed ? `(${core})` : core;
    }
  }
}

export function buildEvaluatedExpression(ast: ExprNode, customLabel?: string): EvaluatedExpression {
  const rawVal = evaluateExprNode(ast);
  const exactScaledValue = Math.round(rawVal * SCALE_FACTOR);
  const numericValue = exactScaledValue / SCALE_FACTOR;
  const label = customLabel ?? formatExprNode(ast);
  return {
    label,
    exactScaledValue,
    numericValue,
    ast,
  };
}

export function compareScaledValues(
  aScaled: number,
  bScaled: number,
  order: 'ascending' | 'descending',
  tieBreakIndexA = 0,
  tieBreakIndexB = 0
): number {
  if (aScaled !== bScaled) {
    return order === 'ascending' ? aScaled - bScaled : bScaled - aScaled;
  }
  return tieBreakIndexA - tieBreakIndexB;
}
