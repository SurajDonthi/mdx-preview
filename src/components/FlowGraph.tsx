import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Icons from 'lucide-react';
import { MdxRenderContext, MdxThemeCategory } from './MermaidDiagram';

/* ------------------------------------------------------------------ *
 * Public shape
 * ------------------------------------------------------------------ */

export interface FlowGraphNodeInput {
  id: string;
  label?: string;
  /** Small second line under the label (a file name, a type, a count). */
  meta?: string;
  /** Band the node belongs to. Bands stack top to bottom. */
  group?: string;
  /** Tooltip body. */
  description?: string;
  /** Visual accent: ui | state | module | external | store | decision | risk. */
  kind?: string;
}

export interface FlowGraphEdgeInput {
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  label?: string;
  /** `solid` (default) or `dashed` for derived/return paths. */
  kind?: string;
}

export interface FlowGraphGroupInput {
  id: string;
  label?: string;
  description?: string;
}

export interface FlowGraphFlowInput {
  id?: string;
  label?: string;
  summary?: string;
  /** Ordered node ids. Consecutive pairs light up when they are real edges. */
  path?: string[];
  /** Extra nodes that belong to the flow but are not on the ordered path. */
  nodes?: string[];
  /** Extra edges: "A->B", ["A","B"] or { from, to }. */
  edges?: Array<string | string[] | FlowGraphEdgeInput>;
  /** indigo | emerald | amber | violet | cyan | sky | rose | fuchsia | slate */
  tone?: string;
}

export interface FlowGraphData {
  nodes?: Array<FlowGraphNodeInput | string>;
  edges?: Array<FlowGraphEdgeInput | string | string[]>;
  groups?: Array<FlowGraphGroupInput | string>;
  flows?: FlowGraphFlowInput[];
}

export interface FlowGraphProps extends FlowGraphData {
  title?: string;
  subtitle?: string;
  /** Everything can also be handed over in one object. */
  data?: FlowGraphData;
  /** Flow id (or label) selected on first render. */
  defaultFlow?: string;
  className?: string;
}

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const TONE_ORDER = ['indigo', 'emerald', 'amber', 'violet', 'cyan', 'sky', 'rose', 'fuchsia'];

const TONE_HEX: Record<string, string> = {
  indigo: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  rose: '#f43f5e',
  fuchsia: '#d946ef',
  slate: '#64748b',
};

const KIND_ACCENT: Record<string, string> = {
  ui: '#10b981',
  component: '#10b981',
  state: '#6366f1',
  module: '#8b5cf6',
  service: '#8b5cf6',
  external: '#0ea5e9',
  store: '#0ea5e9',
  decision: '#f59e0b',
  risk: '#f43f5e',
};

const DASHED_KINDS = new Set(['external', 'store']);

const NODE_MIN_W = 148;
const NODE_MAX_W = 224;
const NODE_FLOOR_W = 112;
const GAP_X = 12;
const GAP_Y = 14;
const BAND_PAD_X = 12;
const BAND_HEAD = 30;
const BAND_PAD_BOTTOM = 14;
const BAND_GAP = 42;
const LABEL_SIZE = 11.5;
const META_SIZE = 9.5;
const LINE_H = 13;
const NODE_PAD_Y = 10;
const CHAR_RATIO = 0.55;
/** Marks a laid-out line as the small meta line rather than a label line. */
const META_MARKER = String.fromCharCode(1);
const SIDE_BY_SIDE_AT = 760;
const SVG_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/* ------------------------------------------------------------------ *
 * Normalisation — never throws, drops anything it cannot understand
 * ------------------------------------------------------------------ */

interface NormNode {
  id: string;
  label: string;
  meta: string;
  description: string;
  group: string;
  kind: string;
}

interface NormEdge {
  key: string;
  from: string;
  to: string;
  label: string;
  dashed: boolean;
}

interface NormFlow {
  id: string;
  label: string;
  summary: string;
  tone: string;
  hex: string;
  path: string[];
  nodeIds: Set<string>;
  edgeKeys: Set<string>;
}

interface NormGroup {
  id: string;
  label: string;
  nodes: NormNode[];
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function asText(value: any): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function edgeEnds(raw: any): { from: string; to: string; label: string; dashed: boolean } | null {
  if (typeof raw === 'string') {
    const parts = raw.split(/-+>|→/);
    if (parts.length !== 2) return null;
    const from = parts[0].trim();
    const to = parts[1].trim();
    return from && to ? { from, to, label: '', dashed: false } : null;
  }
  if (Array.isArray(raw)) {
    const from = asText(raw[0]).trim();
    const to = asText(raw[1]).trim();
    return from && to ? { from, to, label: asText(raw[2]), dashed: false } : null;
  }
  if (raw && typeof raw === 'object') {
    const from = asText(raw.from ?? raw.source ?? raw.a).trim();
    const to = asText(raw.to ?? raw.target ?? raw.b).trim();
    if (!from || !to) return null;
    const kind = asText(raw.kind ?? raw.type).toLowerCase();
    return {
      from,
      to,
      label: asText(raw.label ?? raw.title),
      dashed: kind === 'dashed' || kind === 'async' || raw.dashed === true,
    };
  }
  return null;
}

function edgeKey(from: string, to: string): string {
  return from + ' -> ' + to;
}

function undirectedKey(from: string, to: string): string {
  return from < to ? from + ' <-> ' + to : to + ' <-> ' + from;
}

/** Longest-path layering, safe against cycles and missing endpoints. */
function computeLayers(nodes: NormNode[], edges: NormEdge[]): Map<string, number> {
  const layer = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const remaining = new Map<string, number>();

  nodes.forEach((node) => {
    layer.set(node.id, 0);
    adjacency.set(node.id, []);
    remaining.set(node.id, 0);
  });
  edges.forEach((edge) => {
    if (edge.from === edge.to) return;
    adjacency.get(edge.from)?.push(edge.to);
    remaining.set(edge.to, (remaining.get(edge.to) || 0) + 1);
  });

  const queue = nodes.filter((node) => (remaining.get(node.id) || 0) === 0).map((node) => node.id);
  const settled = new Set<string>();
  const drain = () => {
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (settled.has(id)) continue;
      settled.add(id);
      for (const next of adjacency.get(id) || []) {
        // A node already placed keeps its layer, otherwise a back edge in a
        // cycle would drag its own ancestor downwards.
        if (!settled.has(next)) {
          layer.set(next, Math.max(layer.get(next) || 0, (layer.get(id) || 0) + 1));
        }
        const left = (remaining.get(next) || 0) - 1;
        remaining.set(next, left);
        if (left <= 0) queue.push(next);
      }
    }
  };

  drain();
  // Every node left over sits in a cycle. Break it by seeding one node at a
  // time so a fully cyclic graph still gets a readable layering.
  for (let guard = 0; guard <= nodes.length && settled.size < nodes.length; guard += 1) {
    const next = nodes.find((node) => !settled.has(node.id));
    if (!next) break;
    queue.push(next.id);
    drain();
  }
  return layer;
}

function normalise(props: FlowGraphProps) {
  const data = props.data && typeof props.data === 'object' ? props.data : {};
  const rawNodes = asArray(props.nodes ?? data.nodes);
  const rawEdges = asArray(props.edges ?? data.edges);
  const rawGroups = asArray(props.groups ?? data.groups);
  const rawFlows = asArray(props.flows ?? data.flows);

  const nodeById = new Map<string, NormNode>();
  const nodes: NormNode[] = [];

  rawNodes.forEach((raw: any) => {
    let id = '';
    let node: NormNode | null = null;
    if (typeof raw === 'string') {
      id = raw.trim();
      node = { id, label: id, meta: '', description: '', group: '', kind: '' };
    } else if (typeof raw === 'object') {
      id = asText(raw.id ?? raw.key ?? raw.name).trim();
      node = {
        id,
        label: asText(raw.label ?? raw.title ?? raw.name) || id,
        meta: asText(raw.meta ?? raw.subtitle),
        description: asText(raw.description ?? raw.detail ?? raw.tooltip),
        group: asText(raw.group ?? raw.band ?? raw.layer).trim(),
        kind: asText(raw.kind ?? raw.type).trim().toLowerCase(),
      };
    }
    if (!id || !node || nodeById.has(id)) return;
    nodeById.set(id, node);
    nodes.push(node);
  });

  const edges: NormEdge[] = [];
  const edgeSeen = new Set<string>();
  rawEdges.forEach((raw: any) => {
    const ends = edgeEnds(raw);
    if (!ends) return;
    if (!nodeById.has(ends.from) || !nodeById.has(ends.to)) return;
    if (ends.from === ends.to) return;
    const key = edgeKey(ends.from, ends.to);
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push({ key, from: ends.from, to: ends.to, label: ends.label, dashed: ends.dashed });
  });

  // Bands: explicit groups first, then any group referenced by a node,
  // then a computed layering when the document supplied no grouping at all.
  const groupOrder: string[] = [];
  const groupLabels = new Map<string, string>();
  rawGroups.forEach((raw: any) => {
    const id = typeof raw === 'string' ? raw.trim() : asText(raw?.id ?? raw?.key ?? raw?.name).trim();
    if (!id || groupLabels.has(id)) return;
    groupOrder.push(id);
    groupLabels.set(id, typeof raw === 'string' ? raw : asText(raw?.label ?? raw?.title) || id);
  });

  const anyGrouped = nodes.some((node) => node.group);
  if (!anyGrouped && nodes.length > 0) {
    const layers = computeLayers(nodes, edges);
    nodes.forEach((node) => {
      node.group = `layer-${layers.get(node.id) || 0}`;
    });
    const seen = new Set<string>();
    nodes
      .slice()
      .sort((a, b) => (layers.get(a.id) || 0) - (layers.get(b.id) || 0))
      .forEach((node) => {
        if (seen.has(node.group)) return;
        seen.add(node.group);
        groupOrder.push(node.group);
        groupLabels.set(node.group, '');
      });
  }

  nodes.forEach((node) => {
    const id = node.group || '';
    if (!groupLabels.has(id)) {
      groupOrder.push(id);
      groupLabels.set(id, id);
    }
  });

  const groups: NormGroup[] = groupOrder
    .map((id) => ({
      id,
      label: groupLabels.get(id) || '',
      nodes: nodes.filter((node) => (node.group || '') === id),
    }))
    .filter((group) => group.nodes.length > 0);

  const flows: NormFlow[] = [];
  rawFlows.forEach((raw: any, index: number) => {
    if (!raw || typeof raw !== 'object') return;
    const label = asText(raw.label ?? raw.title ?? raw.name ?? raw.id);
    const id = asText(raw.id) || label || `flow-${index + 1}`;
    if (!label && !id) return;
    const path = asArray(raw.path)
      .map((value: any) => asText(value).trim())
      .filter((value: string) => nodeById.has(value));

    const nodeIds = new Set<string>(path);
    asArray(raw.nodes)
      .map((value: any) => asText(value).trim())
      .filter((value: string) => nodeById.has(value))
      .forEach((value: string) => nodeIds.add(value));

    const edgeKeys = new Set<string>();
    const addEdge = (from: string, to: string) => {
      if (!nodeById.has(from) || !nodeById.has(to)) return;
      // Prefer the edge in the direction the flow travels; fall back to the
      // reverse edge so a slightly loose path still lights the right corridor.
      const forward = edgeKey(from, to);
      const backward = edgeKey(to, from);
      const chosen = edgeSeen.has(forward) ? forward : edgeSeen.has(backward) ? backward : '';
      if (!chosen) return;
      nodeIds.add(from);
      nodeIds.add(to);
      edgeKeys.add(chosen);
    };
    for (let step = 0; step + 1 < path.length; step += 1) addEdge(path[step], path[step + 1]);
    asArray(raw.edges).forEach((value: any) => {
      const ends = edgeEnds(value);
      if (ends) addEdge(ends.from, ends.to);
    });

    const tone = TONE_HEX[asText(raw.tone).toLowerCase()]
      ? asText(raw.tone).toLowerCase()
      : TONE_ORDER[flows.length % TONE_ORDER.length];

    flows.push({
      id,
      label: label || id,
      summary: asText(raw.summary ?? raw.description),
      tone,
      hex: TONE_HEX[tone],
      path,
      nodeIds,
      edgeKeys,
    });
  });

  // Pairs wired in both directions get pulled apart so they do not overdraw.
  const bidirectional = new Set<string>();
  edges.forEach((edge) => {
    if (edgeSeen.has(edgeKey(edge.to, edge.from))) {
      bidirectional.add(undirectedKey(edge.from, edge.to));
    }
  });

  return { nodes, nodeById, edges, groups, flows, bidirectional };
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedNode {
  node: NormNode;
  rect: Rect;
  lines: string[];
}

interface PlacedBand {
  group: NormGroup;
  rect: Rect;
}

/** Breaks an over-long identifier at camelCase humps and separators. */
function softSplit(word: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let index = 0; index < word.length; index += 1) {
    const character = word[index];
    const previous = word[index - 1] || '';
    const boundary =
      current.length > 0 &&
      ((/[a-z0-9]/.test(previous) && /[A-Z]/.test(character)) || /[._\-/]/.test(character));
    if (boundary) {
      parts.push(current);
      current = '';
    }
    current += character;
  }
  if (current) parts.push(current);
  return parts;
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const limit = Math.max(4, Math.floor(maxChars));

  const tokens: Array<{ text: string; glue: boolean }> = [];
  clean.split(' ').forEach((word) => {
    const pieces = word.length > limit ? softSplit(word) : [word];
    pieces.forEach((piece, index) => {
      let rest = piece;
      let first = true;
      while (rest.length > limit) {
        tokens.push({ text: rest.slice(0, limit), glue: index > 0 || !first });
        rest = rest.slice(limit);
        first = false;
      }
      if (rest) tokens.push({ text: rest, glue: index > 0 || !first });
    });
  });

  const lines: string[] = [];
  let current = '';
  tokens.forEach((token) => {
    if (!current) {
      current = token.text;
      return;
    }
    const candidate = token.glue ? current + token.text : `${current} ${token.text}`;
    if (candidate.length <= limit) current = candidate;
    else {
      lines.push(current);
      current = token.text;
    }
  });
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = `${last.length > limit - 1 ? last.slice(0, limit - 1) : last}…`;
    return kept;
  }
  return lines;
}

function layout(groups: NormGroup[], width: number) {
  const usable = Math.max(240, width);
  const inner = usable - BAND_PAD_X * 2;
  // Never fall below two per row while two still fit — a one-per-row column is
  // unreadably tall on a phone.
  const minCell = Math.min(NODE_MIN_W, Math.max(NODE_FLOOR_W, (inner - GAP_X) / 2));
  const perRow = Math.max(1, Math.floor((inner + GAP_X) / (minCell + GAP_X)));
  const rawCell = (inner - (perRow - 1) * GAP_X) / perRow;
  const cell = Math.max(NODE_FLOOR_W, Math.min(NODE_MAX_W, rawCell));
  const textChars = Math.max(5, Math.floor((cell - 24) / (LABEL_SIZE * CHAR_RATIO)));
  const metaChars = Math.max(5, Math.floor((cell - 24) / (META_SIZE * CHAR_RATIO)));

  const placed: PlacedNode[] = [];
  const bands: PlacedBand[] = [];
  const byId = new Map<string, PlacedNode>();
  let cursorY = 4;

  groups.forEach((group) => {
    const hasTitle = Boolean(group.label);
    const bandTop = cursorY;
    let rowTop = bandTop + (hasTitle ? BAND_HEAD : 12);

    for (let start = 0; start < group.nodes.length; start += perRow) {
      const row = group.nodes.slice(start, start + perRow);
      const rowWidth = row.length * cell + (row.length - 1) * GAP_X;
      const rowLeft = BAND_PAD_X + Math.max(0, (inner - rowWidth) / 2);

      const prepared = row.map((node) => {
        const lines = wrapText(node.label, textChars, 3);
        const metaLines = node.meta ? wrapText(node.meta, metaChars, 1) : [];
        const height =
          NODE_PAD_Y * 2 + Math.max(1, lines.length) * LINE_H + (metaLines.length ? 12 : 0);
        return { node, lines, metaLines, height };
      });
      const rowHeight = prepared.reduce((top, item) => Math.max(top, item.height), 40);

      prepared.forEach((item, index) => {
        const entry: PlacedNode = {
          node: item.node,
          lines: item.metaLines.length ? item.lines.concat([META_MARKER + item.metaLines[0]]) : item.lines,
          rect: {
            x: rowLeft + index * (cell + GAP_X),
            y: rowTop,
            w: cell,
            h: rowHeight,
          },
        };
        placed.push(entry);
        byId.set(item.node.id, entry);
      });

      rowTop += rowHeight + GAP_Y;
    }

    const bandBottom = rowTop - GAP_Y + BAND_PAD_BOTTOM;
    bands.push({
      group,
      rect: { x: 3, y: bandTop, w: usable - 6, h: Math.max(46, bandBottom - bandTop) },
    });
    cursorY = bandTop + Math.max(46, bandBottom - bandTop) + BAND_GAP;
  });

  const height = Math.max(120, cursorY - BAND_GAP + 6);
  return { placed, bands, byId, width: usable, height };
}

type Direction = 'down' | 'up' | 'right' | 'left';

function routeEdge(
  a: Rect,
  b: Rect,
  offset = 0
): { d: string; tip: { x: number; y: number }; dir: Direction } {
  const nudge = Math.max(-Math.min(a.w, b.w) / 3, Math.min(Math.min(a.w, b.w) / 3, offset));
  const ac = { x: a.x + a.w / 2 + nudge, y: a.y + a.h / 2 + offset };
  const bc = { x: b.x + b.w / 2 + nudge, y: b.y + b.h / 2 + offset };

  if (b.y >= a.y + a.h - 2) {
    const s = { x: ac.x, y: a.y + a.h };
    const t = { x: bc.x, y: b.y };
    const bend = Math.max(16, (t.y - s.y) / 2);
    return {
      d: `M ${s.x} ${s.y} C ${s.x} ${s.y + bend}, ${t.x} ${t.y - bend}, ${t.x} ${t.y}`,
      tip: t,
      dir: 'down',
    };
  }

  if (b.y + b.h <= a.y + 2) {
    const s = { x: ac.x, y: a.y };
    const t = { x: bc.x, y: b.y + b.h };
    const bend = Math.max(16, (s.y - t.y) / 2);
    return {
      d: `M ${s.x} ${s.y} C ${s.x} ${s.y - bend}, ${t.x} ${t.y + bend}, ${t.x} ${t.y}`,
      tip: t,
      dir: 'up',
    };
  }

  if (bc.x >= ac.x) {
    const s = { x: a.x + a.w, y: ac.y };
    const t = { x: b.x, y: bc.y };
    const bend = Math.max(14, (t.x - s.x) / 2);
    return {
      d: `M ${s.x} ${s.y} C ${s.x + bend} ${s.y}, ${t.x - bend} ${t.y}, ${t.x} ${t.y}`,
      tip: t,
      dir: 'right',
    };
  }

  const s = { x: a.x, y: ac.y };
  const t = { x: b.x + b.w, y: bc.y };
  const bend = Math.max(14, (s.x - t.x) / 2);
  return {
    d: `M ${s.x} ${s.y} C ${s.x - bend} ${s.y}, ${t.x + bend} ${t.y}, ${t.x} ${t.y}`,
    tip: t,
    dir: 'left',
  };
}

function arrowPath(tip: { x: number; y: number }, dir: Direction): string {
  const long = 7;
  const wide = 3.6;
  if (dir === 'down') return `M ${tip.x - wide} ${tip.y - long} L ${tip.x} ${tip.y} L ${tip.x + wide} ${tip.y - long} Z`;
  if (dir === 'up') return `M ${tip.x - wide} ${tip.y + long} L ${tip.x} ${tip.y} L ${tip.x + wide} ${tip.y + long} Z`;
  if (dir === 'right') return `M ${tip.x - long} ${tip.y - wide} L ${tip.x} ${tip.y} L ${tip.x - long} ${tip.y + wide} Z`;
  return `M ${tip.x + long} ${tip.y - wide} L ${tip.x} ${tip.y} L ${tip.x + long} ${tip.y + wide} Z`;
}

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

function palette(mode: MdxThemeCategory) {
  if (mode === 'dark') {
    return {
      bandFill: '#0b1220',
      bandStroke: '#1e293b',
      bandLabel: '#94a3b8',
      nodeFill: '#111c2e',
      nodeStroke: '#334155',
      nodeText: '#e2e8f0',
      nodeMeta: '#94a3b8',
      edge: '#64748b',
      edgeLabel: '#94a3b8',
      edgeLabelBg: '#0b1220',
      accentFallback: '#64748b',
    };
  }
  return {
    bandFill: '#f8fafc',
    bandStroke: '#e2e8f0',
    bandLabel: '#64748b',
    nodeFill: '#ffffff',
    nodeStroke: '#cbd5e1',
    nodeText: '#0f172a',
    nodeMeta: '#64748b',
    edge: '#94a3b8',
    edgeLabel: '#64748b',
    edgeLabelBg: '#ffffff',
    accentFallback: '#94a3b8',
  };
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

/**
 * The app has no `dark` class on the document, so every Tailwind `dark:` variant
 * in this file resolves against `prefers-color-scheme`. The SVG palette has to
 * follow the very same signal or the drawing and its chrome disagree.
 */
function useDarkChrome(enabled: boolean): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setDark(false);
      return;
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [enabled]);
  return dark;
}

export function FlowGraph(props: FlowGraphProps) {
  const context = useContext(MdxRenderContext);
  const isPdf = context.renderMode === 'pdf';
  const darkChrome = useDarkChrome(!isPdf);
  const colors = palette(darkChrome ? 'dark' : 'light');

  const model = useMemo(
    () => normalise(props),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.data, props.nodes, props.edges, props.groups, props.flows]
  );

  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [shellWidth, setShellWidth] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(0);

  useEffect(() => {
    const targets: Array<[HTMLElement | null, React.Dispatch<React.SetStateAction<number>>]> = [
      [shellRef.current, setShellWidth],
      [canvasRef.current, setCanvasWidth],
    ];
    const observers: ResizeObserver[] = [];
    targets.forEach(([element, setter]) => {
      if (!element) return;
      const read = () => {
        const next = Math.round(element.clientWidth);
        setter((current) => (Math.abs(current - next) > 1 ? next : current));
      };
      read();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(read);
      observer.observe(element);
      observers.push(observer);
    });
    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  const initialFlow = useMemo(() => {
    const wanted = asText(props.defaultFlow).trim();
    if (!wanted) return null;
    const match = model.flows.find((flow) => flow.id === wanted || flow.label === wanted);
    return match ? match.id : null;
  }, [props.defaultFlow, model.flows]);

  const [selectedId, setSelectedId] = useState<string | null>(initialFlow);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [pinnedNode, setPinnedNode] = useState<string | null>(null);

  const selected = isPdf ? null : model.flows.find((flow) => flow.id === selectedId) || null;
  const activeNode = isPdf ? null : pinnedNode || hoveredNode;

  const effectiveWidth = canvasWidth || shellWidth || (isPdf ? 690 : 720);
  const board = useMemo(
    () => layout(model.groups, Math.max(260, effectiveWidth - 2)),
    [model.groups, effectiveWidth]
  );

  const stacked = (shellWidth || (isPdf ? 690 : 720)) < SIDE_BY_SIDE_AT;
  const hasFlows = model.flows.length > 0;

  const shellClass = isPdf
    ? 'my-6 rounded-2xl border border-slate-200 bg-white text-slate-900'
    : 'my-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md shadow-sm transition-colors';

  if (model.nodes.length === 0) {
    return (
      <div ref={shellRef} className={`${shellClass} ${props.className || ''}`}>
        <div className="flex items-center gap-2 px-4 py-4 text-xs font-mono text-slate-500 dark:text-slate-400">
          <Icons.Network className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>FlowGraph: no nodes to draw. Pass nodes, edges and flows to render the map.</span>
        </div>
      </div>
    );
  }

  const activePlaced = activeNode ? board.byId.get(activeNode) : undefined;

  const nodeOpacity = (id: string) => {
    if (!selected) return 1;
    return selected.nodeIds.has(id) ? 1 : 0.22;
  };

  return (
    <div
      ref={shellRef}
      data-pdf-keep-together="true"
      className={`${shellClass} ${props.className || ''}`}
    >
      {/* Header */}
      <div
        className={
          isPdf
            ? 'flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50 rounded-t-2xl'
            : 'flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-t-2xl'
        }
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icons.Network className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
            {props.title || 'Architecture map'}
          </span>
        </span>
        {props.subtitle && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full">
            {props.subtitle}
          </span>
        )}
      </div>

      <div className={stacked ? 'flex flex-col' : 'flex flex-row items-stretch'}>
        {/* Diagram */}
        <div className="min-w-0 flex-1 relative">
          <div ref={canvasRef} className="relative px-2 py-3 overflow-hidden">
            <svg
              viewBox={`0 0 ${board.width} ${board.height}`}
              width="100%"
              height={board.height}
              preserveAspectRatio="xMinYMin meet"
              role="img"
              aria-label={props.title || 'Architecture map'}
              style={{ display: 'block', fontFamily: SVG_FONT, overflow: 'visible' }}
            >
              {/* Bands */}
              {board.bands.map((band) => (
                <g key={`band-${band.group.id}`}>
                  {/* An unlabelled band is a computed layer, not a real grouping,
                      so it gets no box of its own. */}
                  {band.group.label && (
                    <rect
                      x={band.rect.x}
                      y={band.rect.y}
                      width={band.rect.w}
                      height={band.rect.h}
                      rx={14}
                      fill={colors.bandFill}
                      stroke={colors.bandStroke}
                      strokeWidth={1}
                    />
                  )}
                  {band.group.label && (
                    <text
                      x={band.rect.x + 14}
                      y={band.rect.y + 19}
                      fontSize={10.5}
                      fontWeight={600}
                      letterSpacing="0.06em"
                      fill={colors.bandLabel}
                    >
                      {band.group.label.toUpperCase()}
                    </text>
                  )}
                </g>
              ))}

              {/* Edges */}
              {model.edges.map((edge) => {
                const from = board.byId.get(edge.from);
                const to = board.byId.get(edge.to);
                if (!from || !to) return null;
                const onFlow = selected ? selected.edgeKeys.has(edge.key) : false;
                const stroke = selected && onFlow ? selected.hex : colors.edge;
                const opacity = selected ? (onFlow ? 1 : 0.12) : 0.7;
                const paired = model.bidirectional.has(undirectedKey(edge.from, edge.to));
                const geometry = routeEdge(
                  from.rect,
                  to.rect,
                  paired ? (edge.from < edge.to ? 7 : -7) : 0
                );
                return (
                  <g key={edge.key} opacity={opacity}>
                    <path
                      d={geometry.d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={selected && onFlow ? 2.2 : 1.3}
                      strokeDasharray={edge.dashed ? '5 4' : undefined}
                      strokeLinecap="round"
                    />
                    <path d={arrowPath(geometry.tip, geometry.dir)} fill={stroke} />
                    {edge.label && board.width >= 480 && (!selected || onFlow) && (
                      <text
                        x={(from.rect.x + from.rect.w / 2 + to.rect.x + to.rect.w / 2) / 2}
                        y={(from.rect.y + from.rect.h / 2 + to.rect.y + to.rect.h / 2) / 2}
                        fontSize={9}
                        textAnchor="middle"
                        fill={selected && onFlow ? selected.hex : colors.edgeLabel}
                        stroke={colors.edgeLabelBg}
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {board.placed.map((item) => {
                const { node, rect } = item;
                const onFlow = selected ? selected.nodeIds.has(node.id) : true;
                const accent = KIND_ACCENT[node.kind] || colors.accentFallback;
                const highlight = Boolean(selected && onFlow);
                const isActive = activeNode === node.id;
                const stepIndex = selected ? selected.path.indexOf(node.id) : -1;

                return (
                  <g
                    key={`node-${node.id}`}
                    opacity={nodeOpacity(node.id)}
                    tabIndex={isPdf ? undefined : 0}
                    role={isPdf ? undefined : 'button'}
                    aria-label={node.description ? `${node.label}. ${node.description}` : node.label}
                    style={isPdf ? undefined : { cursor: 'pointer', outline: 'none' }}
                    onMouseEnter={isPdf ? undefined : () => setHoveredNode(node.id)}
                    onMouseLeave={isPdf ? undefined : () => setHoveredNode((c) => (c === node.id ? null : c))}
                    onFocus={isPdf ? undefined : () => setHoveredNode(node.id)}
                    onBlur={isPdf ? undefined : () => setHoveredNode((c) => (c === node.id ? null : c))}
                    onClick={
                      isPdf ? undefined : () => setPinnedNode((c) => (c === node.id ? null : node.id))
                    }
                    onKeyDown={
                      isPdf
                        ? undefined
                        : (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setPinnedNode((c) => (c === node.id ? null : node.id));
                            }
                            if (event.key === 'Escape') setPinnedNode(null);
                          }
                    }
                  >
                    <title>{node.description || node.label}</title>
                    {isActive && (
                      <rect
                        x={rect.x - 3}
                        y={rect.y - 3}
                        width={rect.w + 6}
                        height={rect.h + 6}
                        rx={13}
                        fill="none"
                        stroke={selected ? selected.hex : '#6366f1'}
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        opacity={0.8}
                      />
                    )}
                    <rect
                      x={rect.x}
                      y={rect.y}
                      width={rect.w}
                      height={rect.h}
                      rx={10}
                      fill={colors.nodeFill}
                      stroke={highlight ? (selected as NormFlow).hex : colors.nodeStroke}
                      strokeWidth={highlight ? 1.8 : 1}
                      strokeDasharray={DASHED_KINDS.has(node.kind) ? '4 3' : undefined}
                    />
                    {highlight && (
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.w}
                        height={rect.h}
                        rx={10}
                        fill={(selected as NormFlow).hex}
                        fillOpacity={0.13}
                        stroke="none"
                      />
                    )}
                    <rect
                      x={rect.x + 5}
                      y={rect.y + 8}
                      width={3}
                      height={Math.max(8, rect.h - 16)}
                      rx={1.5}
                      fill={highlight ? (selected as NormFlow).hex : accent}
                    />
                    {highlight && stepIndex >= 0 && (
                      <>
                        <circle
                          cx={rect.x + rect.w - 11}
                          cy={rect.y + 11}
                          r={7.5}
                          fill={(selected as NormFlow).hex}
                        />
                        <text
                          x={rect.x + rect.w - 11}
                          y={rect.y + 14.5}
                          fontSize={8.5}
                          fontWeight={700}
                          textAnchor="middle"
                          fill="#ffffff"
                        >
                          {stepIndex + 1}
                        </text>
                      </>
                    )}
                    {item.lines.map((line, index) => {
                      const isMeta = line.startsWith(META_MARKER);
                      const text = isMeta ? line.slice(META_MARKER.length) : line;
                      const blockTop = rect.y + Math.max(4, (rect.h - item.lines.length * LINE_H) / 2);
                      return (
                        <text
                          key={`${node.id}-line-${index}`}
                          x={rect.x + 14}
                          y={blockTop + 9.5 + index * LINE_H + (isMeta ? 1 : 0)}
                          fontSize={isMeta ? META_SIZE : LABEL_SIZE}
                          fontWeight={isMeta ? 400 : 600}
                          fill={isMeta ? colors.nodeMeta : colors.nodeText}
                        >
                          {text}
                        </text>
                      );
                    })}
                  </g>
                );
              })}
            </svg>

            {/* Tooltip overlay (live only) */}
            {!isPdf && activePlaced && (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-20"
                style={{
                  left: `${((activePlaced.rect.x + activePlaced.rect.w / 2) / board.width) * 100}%`,
                  top: `${((activePlaced.rect.y - 6) / board.height) * 100}%`,
                  transform: 'translate(-50%, -100%)',
                  maxWidth: 'min(260px, 88%)',
                }}
              >
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-3 py-2 w-max max-w-[260px]">
                  <div className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {activePlaced.node.label}
                  </div>
                  {activePlaced.node.meta && (
                    <div className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {activePlaced.node.meta}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-normal">
                    {activePlaced.node.description || 'No description supplied for this node.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Flows panel */}
        {hasFlows && (
          <div
            className={
              stacked
                ? `border-t ${isPdf ? 'border-slate-200' : 'border-slate-200 dark:border-slate-800'} p-3`
                : `w-[244px] shrink-0 border-l ${isPdf ? 'border-slate-200' : 'border-slate-200 dark:border-slate-800'} p-3`
            }
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Flows
              </span>
              {isPdf ? (
                <span className="text-[10px] text-slate-500">{model.flows.length} paths</span>
              ) : selected ? (
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <Icons.RotateCcw className="w-3 h-3" />
                  Show all
                </button>
              ) : (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {model.flows.length} paths
                </span>
              )}
            </div>

            <div className={stacked ? 'grid grid-cols-1 sm:grid-cols-2 gap-1.5' : 'flex flex-col gap-1.5'}>
              {model.flows.map((flow) => {
                const isOn = selected ? selected.id === flow.id : false;
                const body = (
                  <>
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        data-pdf-swatch={flow.hex}
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: flow.hex }}
                      />
                      <span className="text-[11.5px] font-medium truncate">{flow.label}</span>
                    </span>
                    {(isOn || isPdf) && flow.summary && (
                      <span className="block text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 leading-snug whitespace-normal">
                        {flow.summary}
                      </span>
                    )}
                    {(isOn || isPdf) && flow.path.length > 0 && (
                      <span className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1 leading-snug whitespace-normal break-words">
                        {flow.path
                          .map((id) => model.nodeById.get(id)?.label || id)
                          .join(' → ')}
                      </span>
                    )}
                  </>
                );

                if (isPdf) {
                  return (
                    <div
                      key={flow.id}
                      className="text-left px-2.5 py-2 rounded-lg border border-slate-200 text-slate-800"
                    >
                      {body}
                    </div>
                  );
                }

                return (
                  <button
                    key={flow.id}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => setSelectedId(isOn ? null : flow.id)}
                    className={`text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                      isOn
                        ? 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                    style={isOn ? { borderColor: flow.hex } : undefined}
                  >
                    {body}
                  </button>
                );
              })}
            </div>

            {!isPdf && (
              <p className="mt-2.5 text-[10px] text-slate-400 dark:text-slate-500 leading-snug">
                Pick a flow to light up its path. Hover or focus a node for its description.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FlowGraph;
