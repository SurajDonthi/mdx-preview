/**
 * Evaluating the ESTree that `remark-mdx` hands us.
 *
 * MDX gives every `{...}` in a document - attribute values, flow expressions,
 * text expressions - as a parsed ESTree. Two evaluators consume it:
 *
 * - {@link evaluateEstreeLiteral} walks the tree by hand and only builds values
 *   the syntax already spells out: strings, numbers, booleans, `null`, arrays,
 *   objects and substitution-free template literals. Nothing is executed, so a
 *   document cannot reach anything the host did not hand it.
 * - {@link createFullEstreeEvaluator} serialises the expression back to
 *   JavaScript (JSX included) and runs it with `new Function` against a fixed
 *   scope. That is real JavaScript semantics for *expressions only*; whole
 *   documents are never compiled.
 *
 * `MdxRenderer` picks between them with its `expressions` prop. `'full'` is the
 * default and is meant for documents the user wrote. `'literals'` is what a host
 * picks when it renders content it does not trust and is not sandboxing.
 */

import { buildJsx } from 'estree-util-build-jsx';
import { toJs } from 'estree-util-to-js';

/** Anything ESTree-shaped. Kept loose: the parser also emits JSX node types. */
export interface EstreeNodeLike {
  type: string;
  [key: string]: unknown;
}

/**
 * Outcome of evaluating one expression. Failures carry a reason, never throw.
 *
 * Both members declare both fields (the unused one as `undefined`) because this
 * project does not compile with `strictNullChecks`, where a `true`/`false`
 * discriminant does not narrow.
 */
export type MdxExpressionResult =
  | { ok: true; value: unknown; reason?: undefined }
  | { ok: false; value?: undefined; reason: string };

/** Evaluates an expression node to a value, or explains why it will not. */
export type MdxExpressionEvaluator = (expression: unknown) => MdxExpressionResult;

const MAX_LITERAL_DEPTH = 100;

function isNode(value: unknown): value is EstreeNodeLike {
  return typeof value === 'object' && value !== null && typeof (value as EstreeNodeLike).type === 'string';
}

/**
 * Builds a value out of a JSON-ish ESTree expression without executing anything.
 *
 * Accepts string/number/boolean/null literals, arrays, plain objects, template
 * literals with no substitutions, `-`/`+`/`!` applied to something already
 * accepted, and the bare identifiers `undefined`, `NaN` and `Infinity`.
 * Everything else - identifiers, member access, calls, arrow functions, JSX,
 * spreads, regular expressions, BigInt - is refused with a reason.
 */
export function evaluateEstreeLiteral(expression: unknown, depth = 0): MdxExpressionResult {
  if (depth > MAX_LITERAL_DEPTH) {
    return { ok: false, reason: 'expression nests too deeply' };
  }
  if (!isNode(expression)) {
    return { ok: false, reason: 'not an expression' };
  }

  const node = expression as any;

  switch (node.type) {
    case 'Literal': {
      if (node.regex) return { ok: false, reason: 'regular-expression literals are not allowed in literals mode' };
      if (node.bigint !== undefined) return { ok: false, reason: 'BigInt literals are not allowed in literals mode' };
      return { ok: true, value: node.value };
    }

    case 'TemplateLiteral': {
      if (node.expressions && node.expressions.length > 0) {
        return { ok: false, reason: 'template literals with `${...}` substitutions are not allowed in literals mode' };
      }
      const quasi = node.quasis && node.quasis[0];
      const cooked = quasi ? (quasi.value.cooked ?? quasi.value.raw) : '';
      return { ok: true, value: cooked };
    }

    case 'ArrayExpression': {
      const values: unknown[] = [];
      for (const element of node.elements ?? []) {
        if (element === null) {
          values.push(undefined);
          continue;
        }
        if (element.type === 'SpreadElement') {
          return { ok: false, reason: 'spread elements are not allowed in literals mode' };
        }
        const result = evaluateEstreeLiteral(element, depth + 1);
        if (!result.ok) return result;
        values.push(result.value);
      }
      return { ok: true, value: values };
    }

    case 'ObjectExpression': {
      const value: Record<string, unknown> = {};
      for (const property of node.properties ?? []) {
        if (property.type !== 'Property') {
          return { ok: false, reason: 'object spread is not allowed in literals mode' };
        }
        if (property.kind !== 'init' || property.method) {
          return { ok: false, reason: 'object methods and accessors are not allowed in literals mode' };
        }

        let key: string;
        if (!property.computed && property.key.type === 'Identifier') {
          key = property.key.name;
        } else if (property.key.type === 'Literal' && !property.key.regex) {
          key = String(property.key.value);
        } else {
          return { ok: false, reason: 'computed object keys are not allowed in literals mode' };
        }
        if (key === '__proto__') {
          return { ok: false, reason: '"__proto__" keys are not allowed' };
        }

        const result = evaluateEstreeLiteral(property.value, depth + 1);
        if (!result.ok) return result;
        value[key] = result.value;
      }
      return { ok: true, value };
    }

    case 'UnaryExpression': {
      const inner = evaluateEstreeLiteral(node.argument, depth + 1);
      if (!inner.ok) return inner;
      switch (node.operator) {
        case '-':
          return { ok: true, value: -(inner.value as number) };
        case '+':
          return { ok: true, value: +(inner.value as number) };
        case '!':
          return { ok: true, value: !inner.value };
        default:
          return { ok: false, reason: `unary "${node.operator}" is not allowed in literals mode` };
      }
    }

    case 'Identifier': {
      if (node.name === 'undefined') return { ok: true, value: undefined };
      if (node.name === 'NaN') return { ok: true, value: Number.NaN };
      if (node.name === 'Infinity') return { ok: true, value: Number.POSITIVE_INFINITY };
      return { ok: false, reason: `"${node.name}" cannot be resolved in literals mode` };
    }

    case 'JSXElement':
    case 'JSXFragment':
      return { ok: false, reason: 'JSX inside an expression is not allowed in literals mode' };

    default:
      return { ok: false, reason: `${node.type} is not allowed in literals mode` };
  }
}

const CREATE_ELEMENT = '_mdxCreateElement';
const FRAGMENT = '_mdxFragment';

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// A scope name that is a reserved word makes `new Function` throw for every
// expression, so those bindings are dropped instead.
const RESERVED_WORDS = new Set([
  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally',
  'for', 'function', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let',
  'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
]);

export interface FullEstreeEvaluatorOptions {
  /** Names the expression may reference - normally the component registry. */
  scope: Record<string, unknown>;
  /** `React.createElement`, used for JSX written inside an expression. */
  createElement: (type: unknown, props: unknown, ...children: unknown[]) => unknown;
  /** `React.Fragment`, used for `<>...</>` written inside an expression. */
  Fragment: unknown;
}

/**
 * Builds an evaluator with real JavaScript semantics for a single expression.
 *
 * The expression's ESTree is serialised back to source - JSX lowered to
 * `createElement` calls first - and run through `new Function` with `scope`
 * bound as parameters. Only the expression is compiled; the document around it
 * is never turned into code. A reference to a name that is not in scope, or any
 * error thrown while evaluating, comes back as `{ ok: false }`.
 */
export function createFullEstreeEvaluator(
  options: FullEstreeEvaluatorOptions
): MdxExpressionEvaluator {
  const names: string[] = [CREATE_ELEMENT, FRAGMENT];
  const values: unknown[] = [options.createElement, options.Fragment];

  for (const [name, value] of Object.entries(options.scope)) {
    if (name === CREATE_ELEMENT || name === FRAGMENT) continue;
    if (!IDENTIFIER_PATTERN.test(name) || RESERVED_WORDS.has(name)) continue;
    names.push(name);
    values.push(value);
  }

  const compiled = new Map<string, (...args: unknown[]) => unknown>();

  return function evaluate(expression: unknown): MdxExpressionResult {
    let source: string;
    try {
      source = generateExpressionSource(expression);
    } catch (error) {
      return { ok: false, reason: describeError(error) };
    }

    let fn = compiled.get(source);
    if (!fn) {
      try {
        // eslint-disable-next-line no-new-func
        fn = new Function(...names, `"use strict";\nreturn (${source});`) as (
          ...args: unknown[]
        ) => unknown;
      } catch (error) {
        return { ok: false, reason: describeError(error) };
      }
      compiled.set(source, fn);
    }

    try {
      return { ok: true, value: fn(...values) };
    } catch (error) {
      return { ok: false, reason: describeError(error) };
    }
  };
}

/** Serialises one expression back to JavaScript, lowering any JSX it contains. */
function generateExpressionSource(expression: unknown): string {
  if (!isNode(expression)) throw new Error('not an expression');

  // `buildJsx` rewrites in place and the same ESTree is re-read on every
  // keystroke, so it must never see the parser's own nodes.
  const program = {
    type: 'Program',
    sourceType: 'module',
    comments: [],
    body: [{ type: 'ExpressionStatement', expression: structuredClone(expression) }],
  };

  buildJsx(program as never, {
    runtime: 'classic',
    pragma: CREATE_ELEMENT,
    pragmaFrag: FRAGMENT,
  });

  const generated = toJs(program as never).value.trim();
  return generated.endsWith(';') ? generated.slice(0, -1) : generated;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
