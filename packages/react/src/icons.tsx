/**
 * Icons, without shipping the whole lucide set.
 *
 * `<Card icon="Eye">`, `<Stat icon="Users">`, `<Badge icon="Check">` and the
 * `icon` field of a `<Timeline>` item all name a lucide icon at *runtime*, from
 * the document. The obvious way to serve that - `import * as Icons from
 * 'lucide-react'` and index it - defeats tree shaking completely: a computed
 * member access on a namespace forces a bundler to keep every export, which is
 * all 1868 icons, about 583 kB minified.
 *
 * So the lookup happens in two steps instead:
 *
 * 1. {@link BUILTIN_ICONS} - a static map, built from real named imports, of the
 *    icons the built-in components draw themselves plus the ones the shipped
 *    samples and documentation use. A hit renders synchronously, exactly as
 *    before, and only these icons are in the first-load bundle.
 * 2. Anything else falls back to a single lazy `import('lucide-react')`. The
 *    authoring contract is unchanged - `icon` still takes *any* lucide name, and
 *    an unrecognised one still renders the question-mark icon rather than
 *    failing - but the cost of the full set is now paid only by a document that
 *    actually asks for an icon outside the list, once, off the critical path.
 *
 * The one visible difference is timing: an off-list icon appears a moment after
 * the rest of the document, once its chunk has loaded.
 */
import React from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  Code,
  Code2,
  Copy,
  DollarSign,
  Eye,
  HelpCircle,
  Info,
  ListOrdered,
  Minus,
  OctagonAlert,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Table,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  Zap,
} from 'lucide-react';

/** The shape every lucide icon component has. */
export type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * Icons resolved synchronously by name.
 *
 * Everything the built-in components render is here, so the components
 * themselves never reach for the lazy path; the rest are the names used by the
 * documents this project ships (`docs/`, the editor's snippets, the samples),
 * which keeps the common authoring vocabulary instant too.
 */
export const BUILTIN_ICONS: Record<string, IconComponent> = {
  Activity,
  AlertTriangle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  Code,
  Code2,
  Copy,
  DollarSign,
  Eye,
  HelpCircle,
  Info,
  ListOrdered,
  Minus,
  OctagonAlert,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Table,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  Zap,
};

/**
 * The full lucide set, once, on demand.
 *
 * The promise is kept so a document with twenty off-list icons loads the set a
 * single time, and `loadedIconSet` is set on resolution so a second render of
 * the same icon is synchronous rather than flashing again.
 */
let iconSetPromise: Promise<Record<string, unknown>> | null = null;
let loadedIconSet: Record<string, unknown> | null = null;

function loadIconSet(): Promise<Record<string, unknown>> {
  if (!iconSetPromise) {
    iconSetPromise = import('lucide-react').then((module) => {
      loadedIconSet = module as unknown as Record<string, unknown>;
      return loadedIconSet;
    });
  }
  return iconSetPromise;
}

function lookup(set: Record<string, unknown> | null, name: string): IconComponent | null {
  const candidate = set?.[name];
  // lucide's namespace also carries non-component exports (`icons`, `createLucideIcon`);
  // only a component is safe to render.
  return typeof candidate === 'function' || (candidate !== null && typeof candidate === 'object')
    ? (candidate as IconComponent)
    : null;
}

/**
 * Renders the lucide icon called `name`.
 *
 * An unknown name renders {@link HelpCircle}, and a missing one renders
 * nothing - a bad `icon` never takes the document down with it.
 */
export function DynamicIcon({
  name,
  className = 'mdxstudio-icon-20',
}: {
  name?: string;
  className?: string;
}) {
  const builtin = name ? BUILTIN_ICONS[name] : undefined;

  // Only ever true for a name outside the static map, so the common path does no
  // state work at all.
  const needsIconSet = Boolean(name) && !builtin;
  const [lazyIcon, setLazyIcon] = React.useState<IconComponent | null>(() =>
    needsIconSet ? lookup(loadedIconSet, name!) : null
  );

  React.useEffect(() => {
    if (!needsIconSet) return;

    let cancelled = false;
    loadIconSet().then((set) => {
      // An unknown name is an authoring mistake, not a failure: the
      // question-mark icon is what the documentation promises for it.
      if (!cancelled) setLazyIcon(() => lookup(set, name!) ?? HelpCircle);
    });

    return () => {
      cancelled = true;
    };
  }, [needsIconSet, name]);

  if (!name) return null;

  const Icon = builtin ?? lazyIcon;
  // Still loading. Nothing is drawn rather than a placeholder, so the icon does
  // not visibly change shape once its chunk arrives.
  if (!Icon) return null;

  return <Icon className={className} />;
}
