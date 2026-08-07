/**
 * Both expression evaluators.
 *
 * `literals` is the mode a host picks when it renders content it does not trust
 * and is not sandboxing, so what it *refuses* is the security boundary. `full`
 * is real JavaScript for a single expression, so what it *accepts* is the
 * feature. Prototype pollution is checked explicitly in both.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFullEstreeEvaluator, evaluateEstreeLiteral, parseMdxDocument } from '@mdxstudio/core';
import type { MdxExpressionEvaluator } from '@mdxstudio/core';

/**
 * The ESTree the real parser produces for `{ source }`, so these tests evaluate
 * the same node shapes the renderer does rather than hand-built fixtures.
 */
function expressionOf(source: string): unknown {
  const document = `{${source}}\n`;
  const { slots, error } = parseMdxDocument(document);
  if (error) throw new Error(`could not parse ${document.trim()}: ${error.message}`);
  const [node] = [...slots.keys()];
  if (!node) throw new Error(`no expression slot in ${document.trim()}`);
  return node;
}

const literal = (source: string) => evaluateEstreeLiteral(expressionOf(source));

/** Marker elements, so JSX inside an expression is observable without React. */
const createElement = (type: unknown, props: unknown, ...children: unknown[]) => ({
  __element: type,
  props,
  children,
});
const Fragment = Symbol('Fragment');

function fullEvaluator(scope: Record<string, unknown> = {}): MdxExpressionEvaluator {
  return createFullEstreeEvaluator({ scope, createElement, Fragment });
}

const full = (source: string, scope: Record<string, unknown> = {}) =>
  fullEvaluator(scope)(expressionOf(source));

afterEach(() => {
  // Every pollution test asserts this too; this is the backstop for the rest.
  expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
});

describe('literals mode: what it accepts', () => {
  it.each([
    ["'hello'", 'hello'],
    ['42', 42],
    ['-7', -7],
    ['+"3"', 3],
    ['1.5e3', 1500],
    ['true', true],
    ['false', false],
    ['!0', true],
    ['null', null],
    ['undefined', undefined],
  ])('accepts %s', (source, expected) => {
    expect(literal(source)).toEqual({ ok: true, value: expected });
  });

  it('accepts NaN and Infinity', () => {
    expect(literal('NaN').value).toBeNaN();
    expect(literal('Infinity').value).toBe(Number.POSITIVE_INFINITY);
    expect(literal('-Infinity').value).toBe(Number.NEGATIVE_INFINITY);
  });

  it('accepts arrays, including nested ones and holes', () => {
    expect(literal("[1, 'two', true, null]")).toEqual({
      ok: true,
      value: [1, 'two', true, null],
    });
    expect(literal('[[1, 2], [3]]').value).toEqual([[1, 2], [3]]);
    expect(literal('[1, , 3]').value).toEqual([1, undefined, 3]);
  });

  it('accepts plain objects with identifier and string keys', () => {
    expect(literal("({ a: 1, 'b-2': 'two', c: [3], d: { e: 4 } })")).toEqual({
      ok: true,
      value: { a: 1, 'b-2': 'two', c: [3], d: { e: 4 } },
    });
  });

  it('accepts a template literal with no substitutions', () => {
    expect(literal('`just text`')).toEqual({ ok: true, value: 'just text' });
    expect(literal('``')).toEqual({ ok: true, value: '' });
  });
});

describe('literals mode: what it refuses', () => {
  it.each([
    ['an identifier', 'someValue', /cannot be resolved/],
    ['a call', 'fetch("/x")', /cannot be resolved|not allowed/],
    ['member access', 'window.location', /not allowed|cannot be resolved/],
    ['an arrow function', '() => 1', /ArrowFunctionExpression is not allowed/],
    ['an array spread', '[...list]', /spread elements are not allowed/],
    ['an object spread', '({ ...other })', /object spread is not allowed/],
    ['a computed key', '({ [key]: 1 })', /computed object keys are not allowed/],
    ['an object method', '({ run() { return 1 } })', /methods and accessors are not allowed/],
    ['a getter', '({ get x() { return 1 } })', /methods and accessors are not allowed/],
    ['a substituting template', '`a ${b} c`', /substitutions are not allowed/],
    ['a regular expression', '/x/g', /regular-expression literals are not allowed/],
    ['a BigInt', '1n', /BigInt literals are not allowed/],
    ['JSX', '<Widget />', /JSX inside an expression is not allowed/],
    ['a JSX fragment', '<>text</>', /JSX inside an expression is not allowed/],
    ['an assignment', '(x = 1)', /AssignmentExpression is not allowed/],
    ['arithmetic', '1 + 1', /BinaryExpression is not allowed/],
    ['an unsupported unary', 'typeof 1', /unary "typeof" is not allowed/],
    ['bitwise not', '~1', /unary "~" is not allowed/],
  ])('refuses %s and says why', (_label, source, reason) => {
    const result = literal(source);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(reason);
  });

  it('refuses a __proto__ key rather than building a polluted object', () => {
    const identifierKey = literal("({ __proto__: { polluted: true } })");
    expect(identifierKey).toEqual({
      ok: false,
      reason: '"__proto__" keys are not allowed',
    });

    // The string form reaches the same guard: the key is compared after the
    // literal is stringified, not before.
    const stringKey = literal("({ '__proto__': { polluted: true } })");
    expect(stringKey.ok).toBe(false);
    expect(stringKey.reason).toBe('"__proto__" keys are not allowed');

    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses a __proto__ key nested inside an accepted object', () => {
    const result = literal("({ safe: 1, inner: { __proto__: { polluted: true } } })");
    expect(result.ok).toBe(false);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses anything that is not an expression node', () => {
    expect(evaluateEstreeLiteral(null).ok).toBe(false);
    expect(evaluateEstreeLiteral({ notAType: true }).reason).toBe('not an expression');
    expect(evaluateEstreeLiteral('literal string').reason).toBe('not an expression');
  });

  it('refuses an expression nested past the depth limit', () => {
    const deep = { type: 'ArrayExpression', elements: [] as unknown[] };
    let current = deep;
    for (let index = 0; index < 120; index += 1) {
      const next = { type: 'ArrayExpression', elements: [] as unknown[] };
      current.elements.push(next);
      current = next;
    }

    expect(evaluateEstreeLiteral(deep)).toEqual({
      ok: false,
      reason: 'expression nests too deeply',
    });
  });
});

describe('full mode', () => {
  it('evaluates real expressions', () => {
    expect(full('1 + 2 * 3')).toEqual({ ok: true, value: 7 });
    expect(full('[1, 2, 3].map(n => n * 2)').value).toEqual([2, 4, 6]);
    expect(full('"a,b,c".split(",").length')).toEqual({ ok: true, value: 3 });
    expect(full('true ? "yes" : "no"')).toEqual({ ok: true, value: 'yes' });
  });

  it('resolves names from the scope it was built with', () => {
    const scope = { rows: [{ n: 1 }, { n: 2 }], double: (n: number) => n * 2 };

    expect(full('rows.map(row => double(row.n))', scope).value).toEqual([2, 4]);
    expect(full('`total ${rows.length}`', scope)).toEqual({ ok: true, value: 'total 2' });
  });

  it('lowers JSX written inside an expression to createElement', () => {
    const Widget = () => null;
    const result = full('<Widget count={2}>text</Widget>', { Widget });

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      __element: Widget,
      props: { count: 2 },
      children: ['text'],
    });
  });

  it('lowers a fragment to the Fragment it was given', () => {
    const result = full('<>a</>');
    expect((result.value as { __element: unknown }).__element).toBe(Fragment);
  });

  it('reports an unresolvable name instead of throwing', () => {
    const result = full('missingName.thing');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missingName is not defined/);
  });

  it('reports an error thrown while evaluating', () => {
    const result = full('boom()', {
      boom: () => {
        throw new Error('handler exploded');
      },
    });

    expect(result).toEqual({ ok: false, reason: 'handler exploded' });
  });

  it('ignores scope names that could not be function parameters', () => {
    // A reserved word or a non-identifier key makes `new Function` throw for
    // *every* expression, so those bindings are dropped rather than fatal.
    const scope = { class: 1, 'not-an-identifier': 2, ok: 3 };

    expect(full('ok + 1', scope)).toEqual({ ok: true, value: 4 });
    expect(full('1 + 1', scope)).toEqual({ ok: true, value: 2 });
  });

  it('does not let a document rebind createElement or Fragment through scope', () => {
    const hijack = vi.fn();
    const result = full('<Widget />', {
      Widget: () => null,
      _mdxCreateElement: hijack,
      _mdxFragment: hijack,
    });

    expect(hijack).not.toHaveBeenCalled();
    expect((result.value as { __element: unknown }).__element).toBeTypeOf('function');
  });

  it('compiles each distinct expression once and reuses it', () => {
    const evaluate = fullEvaluator({ n: 2 });
    const expression = expressionOf('n * 21');

    expect(evaluate(expression)).toEqual({ ok: true, value: 42 });
    expect(evaluate(expression)).toEqual({ ok: true, value: 42 });
  });

  it('does not mutate the parser nodes it reads', () => {
    // `buildJsx` rewrites in place and the same ESTree is re-read on every
    // keystroke, so the evaluator has to work on a copy.
    const expression = expressionOf('<Widget />');
    const before = JSON.stringify(expression);

    fullEvaluator({ Widget: () => null })(expression);

    expect(JSON.stringify(expression)).toBe(before);
  });

  it('refuses something that is not an expression', () => {
    expect(fullEvaluator()(null)).toEqual({ ok: false, reason: 'not an expression' });
  });

  it('applies real JavaScript __proto__ semantics without escaping the object', () => {
    // Full mode *is* JavaScript, so `__proto__:` sets that object's prototype -
    // that is the documented contract. What must not happen is the assignment
    // reaching Object.prototype and leaking into every other object.
    const result = full('({ __proto__: { polluted: true } })');

    expect(result.ok).toBe(true);
    expect((result.value as Record<string, unknown>).polluted).toBe(true);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not let an expression write through a literal __proto__ index', () => {
    const target: Record<string, unknown> = {};
    const result = full('(target["__proto__"] = { polluted: true }, "done")', { target });

    expect(result.ok).toBe(true);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
