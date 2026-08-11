export type PdfExportEngine = 'html2pdf' | 'canvas';

export function downloadMdxFile(content: string, documentTitle: string = 'document'): void {
  const title = (documentTitle || 'document')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const fileName = `${title || 'document'}.mdx`;

  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, fileName, 1000);
  } catch (error) {
    console.warn('Blob URL download failed, trying Data URI fallback:', error);
    const link = document.createElement('a');
    link.href = `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`;
    link.download = fileName;
    link.target = '_blank';
    link.style.display = 'none';
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      window.setTimeout(() => link.remove(), 1000);
    }
  }
}

const PAPER_WIDTH_PX = 794;
const MERMAID_TIMEOUT_MS = 10_000;
const MODERN_COLOR = /(?:oklab|oklch|color-mix|light-dark|color)\s*\(/i;

/** Compatibility helper. PDF rendering does not rely on application color conversion. */
export function parseCssColorToRgb(value: string): string {
  if (!MODERN_COLOR.test(value)) return value;
  const match = value.match(/okl(?:ch|ab)\(\s*([\d.]+)(%)?/i);
  if (!match) return 'rgba(255, 255, 255, 0)';
  const lightness = Number(match[1]) / (match[2] ? 100 : 1);
  const channel = Math.round(Math.max(0, Math.min(1, lightness)) * 255);
  return `rgb(${channel}, ${channel}, ${channel})`;
}

function setStyles(element: HTMLElement, styles: Record<string, string>): void {
  Object.entries(styles).forEach(([name, value]) => {
    element.style.setProperty(name, value, 'important');
  });
}

function applyLightExportStyles(root: HTMLElement): void {
  root.querySelectorAll('button, [data-pdf-interactive="true"]').forEach((element) => element.remove());

  [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].forEach((element) => {
    setStyles(element, {
      color: '#0f172a',
      'background-color': 'transparent',
      'background-image': 'none',
      'border-color': '#cbd5e1',
      'outline-color': '#64748b',
      'text-decoration-color': '#64748b',
      'box-shadow': 'none',
      'text-shadow': 'none',
      filter: 'none',
      'backdrop-filter': 'none',
      '-webkit-backdrop-filter': 'none',
      animation: 'none',
      transition: 'none',
      'color-scheme': 'light',
    });
  });

  setStyles(root, {
    width: `${PAPER_WIDTH_PX}px`,
    padding: '32px',
    'box-sizing': 'border-box',
    'background-color': '#ffffff',
    color: '#0f172a',
    'font-size': '14px',
    'line-height': '1.6',
    'font-family': 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  });

  const contentRoot = root.firstElementChild as HTMLElement | null;
  if (contentRoot) {
    setStyles(contentRoot, {
      width: '100%',
      'max-width': '100%',
      padding: '0',
      margin: '0',
      'background-color': '#ffffff',
      color: '#0f172a',
    });
  }

  root.querySelectorAll<HTMLElement>('a').forEach((element) => {
    setStyles(element, { color: '#1d4ed8', 'text-decoration-color': '#93c5fd' });
  });
  root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((element) => {
    setStyles(element, { color: '#0f172a', 'break-inside': 'avoid', 'page-break-inside': 'avoid' });
  });
  root.querySelectorAll<HTMLElement>('pre').forEach((element) => {
    setStyles(element, {
      'background-color': '#f8fafc',
      color: '#0f172a',
      border: '1px solid #cbd5e1',
      'border-radius': '8px',
      padding: '12px 14px',
      'white-space': 'pre-wrap',
      'overflow-wrap': 'anywhere',
      'break-inside': 'avoid',
      'page-break-inside': 'avoid',
    });
  });
  root.querySelectorAll<HTMLElement>('pre .token, pre span').forEach((element) => {
    const className = element.className || '';
    let color = '#0f172a';
    if (/keyword|tag/.test(className)) color = '#0369a1';
    else if (/string|attr-value/.test(className)) color = '#15803d';
    else if (/comment|prolog|doctype/.test(className)) color = '#64748b';
    else if (/function|class-name|title/.test(className)) color = '#6d28d9';
    else if (/number|boolean|constant/.test(className)) color = '#c2410c';
    else if (/builtin|attr-name/.test(className)) color = '#0f766e';
    setStyles(element, { color });
  });
  // Shared inline tokens already carry export-safe geometry. Only plain <code>
  // needs the fallback box, otherwise this padding would break their centring.
  root.querySelectorAll<HTMLElement>('code:not(pre code):not([data-inline-token])').forEach((element) => {
    setStyles(element, {
      'background-color': '#f1f5f9',
      color: '#0f172a',
      border: '1px solid #cbd5e1',
      'border-radius': '4px',
      padding: '1px 5px',
    });
  });
  root.querySelectorAll<HTMLElement>('[data-inline-token]').forEach((element) => {
    setStyles(element, {
      'background-color': '#f1f5f9',
      color: element.dataset.inlineToken === 'code' ? '#3730a3' : '#334155',
      'border-color': '#cbd5e1',
    });
  });

  root.querySelectorAll<HTMLElement>('table').forEach((element) => {
    setStyles(element, {
      width: '100%',
      'border-collapse': 'collapse',
      'background-color': '#ffffff',
      color: '#0f172a',
      border: '1px solid #cbd5e1',
      'break-inside': 'avoid',
      'page-break-inside': 'avoid',
    });
  });
  root.querySelectorAll<HTMLElement>('th').forEach((element) => {
    setStyles(element, {
      'background-color': '#f1f5f9',
      border: '1px solid #cbd5e1',
      padding: '8px 12px',
    });
  });
  root.querySelectorAll<HTMLElement>('td').forEach((element) => {
    setStyles(element, {
      'background-color': '#ffffff',
      border: '1px solid #e2e8f0',
      padding: '8px 12px',
    });
  });
  root.querySelectorAll<HTMLElement>('blockquote, figure').forEach((element) => {
    setStyles(element, {
      'background-color': '#f8fafc',
      'border-color': '#cbd5e1',
      'break-inside': 'avoid',
      'page-break-inside': 'avoid',
    });
  });

  root.querySelectorAll<HTMLElement>('[data-pdf-frontmatter]').forEach((frontmatter) => {
    setStyles(frontmatter, {
      'background-color': '#ffffff',
      color: '#0f172a',
      'border-color': '#e2e8f0',
      'border-radius': '12px',
      'break-inside': 'avoid',
      'page-break-inside': 'avoid',
    });
    frontmatter
      .querySelectorAll<HTMLElement>('[data-pdf-frontmatter-field], .grid > div')
      .forEach((element) => {
        setStyles(element, {
          'background-color': '#f8fafc',
          color: '#0f172a',
          'border-color': '#e2e8f0',
        });
      });
    // The pills used to be found by their utility classes. They now say what
    // they are, so the selector no longer depends on how they are styled - the
    // legacy class selectors stay for markup this exporter did not produce.
    frontmatter
      .querySelectorAll<HTMLElement>(
        '[data-pdf-frontmatter-pill], [data-inline-token], span.rounded-full, span.rounded-md'
      )
      .forEach((element) => {
        setStyles(element, {
          'background-color': '#eef2ff',
          color: '#3730a3',
          'border-color': '#c7d2fe',
        });
      });
  });

  // The blanket pass above clears every background. Small solid swatches (the
  // status dot, for example) declare the colour they need to keep.
  root.querySelectorAll<HTMLElement>('[data-pdf-swatch]').forEach((element) => {
    const color = element.dataset.pdfSwatch;
    if (color) setStyles(element, { 'background-color': color, 'border-color': color });
  });

  root.querySelectorAll<HTMLElement>('[data-pdf-mermaid]').forEach((card) => {
    setStyles(card, {
      'background-color': '#ffffff',
      color: '#0f172a',
      'border-color': '#e2e8f0',
      'border-radius': '12px',
      overflow: 'hidden',
      'break-inside': 'avoid',
      'page-break-inside': 'avoid',
    });
    const header = (card.querySelector('[data-pdf-mermaid-header]') || card.firstElementChild) as HTMLElement | null;
    if (header) {
      setStyles(header, {
        'background-color': '#f8fafc',
        color: '#334155',
        'border-color': '#e2e8f0',
      });
    }
    card.querySelectorAll<HTMLElement>('.mermaid-svg-container, [data-pdf-mermaid-canvas]').forEach((element) => {
      setStyles(element, { 'background-color': '#ffffff', color: '#0f172a' });
    });
  });

  root.querySelectorAll<HTMLElement>('img').forEach((element) => {
    setStyles(element, {
      'max-width': '100%',
      'background-color': '#ffffff',
      'break-inside': 'avoid',
      'page-break-inside': 'avoid',
    });
  });
}

/** Applies only scoped export styles. It never reads or rewrites document style tags. */
export function sanitizeClonedDocumentForHtml2Canvas(clonedDocument: Document): void {
  clonedDocument
    .querySelectorAll<HTMLElement>('.pdf-export-paper-sheet')
    .forEach(applyLightExportStyles);
}

function mermaidName(card: HTMLElement): string {
  return card.dataset.mermaidId || card.getAttribute('aria-label') || 'unknown';
}

async function waitForMermaidReady(root: HTMLElement, timeoutMs = MERMAID_TIMEOUT_MS): Promise<void> {
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-mermaid]'));
  if (cards.length === 0) return;

  const inspect = (): boolean => {
    const failed = cards.filter((card) => card.dataset.renderState === 'error');
    if (failed.length > 0) {
      const details = failed.map((card) => {
        const message = card.dataset.errorMessage || card.dataset.renderError || 'render failed';
        return `${mermaidName(card)}: ${message}`;
      });
      throw new Error(`Cannot export PDF. Mermaid diagram error: ${details.join('; ')}`);
    }
    return cards.every((card) => card.dataset.renderState === 'ready');
  };

  if (inspect()) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let observer: MutationObserver;
    let timer: number;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    observer = new MutationObserver(() => {
      try {
        if (inspect()) finish();
      } catch (error) {
        finish(error as Error);
      }
    });
    timer = window.setTimeout(() => {
      const pending = cards
        .filter((card) => card.dataset.renderState !== 'ready')
        .map((card) => `${mermaidName(card)} (${card.dataset.renderState || 'pending'})`);
      finish(new Error(`Cannot export PDF. Timed out waiting for Mermaid diagrams: ${pending.join(', ')}`));
    }, timeoutMs);
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-render-state', 'data-render-error', 'data-error-message'],
    });
  });
}

function prepareMermaidIds(root: HTMLElement): {
  pairs: Array<{ id: string; source: HTMLElement }>;
  restore: () => void;
} {
  const changed: HTMLElement[] = [];
  const seen = new Set<string>();
  try {
    const pairs = Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-mermaid]')).map(
      (source, index) => {
        let id = source.dataset.mermaidId?.trim();
        if (!id) {
          id = `pdf-mermaid-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
          source.dataset.mermaidId = id;
          changed.push(source);
        }
        if (seen.has(id)) throw new Error(`Cannot export PDF. Duplicate Mermaid id: ${id}`);
        seen.add(id);
        return { id, source };
      }
    );
    return {
      pairs,
      restore: () => changed.forEach((card) => card.removeAttribute('data-mermaid-id')),
    };
  } catch (error) {
    changed.forEach((card) => card.removeAttribute('data-mermaid-id'));
    throw error;
  }
}

function parseViewBox(svg: SVGSVGElement): [number, number, number, number] | null {
  const values = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  return values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0
    ? (values as [number, number, number, number])
    : null;
}

async function rasterizeMermaidSvg(
  sourceSvg: SVGSVGElement,
  diagramId: string,
  maxWidth = 680
): Promise<HTMLElement> {
  const svg = sourceSvg.cloneNode(true) as SVGSVGElement;
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const viewBox = parseViewBox(sourceSvg) || parseViewBox(svg);
  const rect = sourceSvg.getBoundingClientRect();
  const intrinsicWidth = viewBox?.[2] || rect.width || 600;
  const intrinsicHeight = viewBox?.[3] || rect.height || 400;
  const width = Math.max(1, Math.min(maxWidth, rect.width || intrinsicWidth));
  const height = Math.max(1, (width * intrinsicHeight) / intrinsicWidth);

  // The original four-part viewBox, including minX/minY, remains unchanged.
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const serialized = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => {
        reject(new Error(`Cannot export PDF. Mermaid diagram ${diagramId} could not be rasterized.`));
      };
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * 3));
    canvas.height = Math.max(1, Math.ceil(height * 3));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(`Cannot export PDF. Canvas is unavailable for Mermaid diagram ${diagramId}.`);
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const wrapper = document.createElement('div');
    wrapper.dataset.pdfMermaidRaster = 'true';
    setStyles(wrapper, {
      display: 'flex',
      'justify-content': 'center',
      'align-items': 'center',
      width: '100%',
      'background-color': '#ffffff',
      'break-inside': 'avoid',
      'page-break-inside': 'avoid',
    });
    const png = document.createElement('img');
    png.src = canvas.toDataURL('image/png');
    png.alt = `Mermaid diagram ${diagramId}`;
    setStyles(png, {
      display: 'block',
      width: `${width}px`,
      height: 'auto',
      'max-width': '100%',
      margin: '0 auto',
      'background-color': '#ffffff',
    });
    wrapper.appendChild(png);
    return wrapper;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Creates an isolated, explicitly light A4 export subtree. */
export async function createWhitePaperContainer(source: HTMLElement): Promise<HTMLElement> {
  await waitForMermaidReady(source);
  const prepared = prepareMermaidIds(source);
  let clone: HTMLElement;
  try {
    clone = source.cloneNode(true) as HTMLElement;
  } finally {
    prepared.restore();
  }
  // The source export root is parked off-screen. Its class must not survive
  // inside the capture sheet or the cloned content is shifted off the canvas.
  clone.classList.remove('pdf-export-root');
  clone.removeAttribute('aria-hidden');
  setStyles(clone, {
    position: 'static',
    left: 'auto',
    top: 'auto',
    width: '100%',
    'min-width': '0',
    'max-width': '100%',
    overflow: 'visible',
    visibility: 'visible',
    opacity: '1',
  });

  const cloneCards = new Map<string, HTMLElement>();
  clone.querySelectorAll<HTMLElement>('[data-pdf-mermaid]').forEach((card) => {
    const id = card.dataset.mermaidId;
    if (!id) throw new Error('Cannot export PDF. A cloned Mermaid diagram is missing its stable id.');
    if (cloneCards.has(id)) throw new Error(`Cannot export PDF. Duplicate cloned Mermaid id: ${id}`);
    cloneCards.set(id, card);
  });

  for (const { id, source: sourceCard } of prepared.pairs) {
    const cloneCard = cloneCards.get(id);
    const sourceSvg = sourceCard.querySelector<SVGSVGElement>('.mermaid-svg-container > svg');
    const cloneSvg = cloneCard?.querySelector<SVGSVGElement>('.mermaid-svg-container > svg');
    if (!cloneCard || !sourceSvg || !cloneSvg) {
      throw new Error(`Cannot export PDF. Mermaid diagram ${id} is marked ready but has no SVG.`);
    }
    cloneSvg.replaceWith(await rasterizeMermaidSvg(sourceSvg, id));
  }

  const paper = document.createElement('div');
  paper.className = 'pdf-export-paper-sheet';
  Object.assign(paper.style, {
    position: 'absolute',
    left: '-10000px',
    top: '0',
    zIndex: '-1',
    pointerEvents: 'none',
  });
  paper.appendChild(clone);
  applyLightExportStyles(paper);
  document.body.appendChild(paper);
  return paper;
}

/**
 * Rasterisation.
 *
 * The capture runs through an SVG <foreignObject>, so the browser's own layout
 * engine draws the sheet. A JS reimplementation of CSS (html2canvas) placed
 * every bordered inline token's box and its text by different rules, which left
 * pill labels sitting below their borders and icons floating above their
 * labels. This path is plain DOM plus canvas, so it behaves the same on mobile
 * Chrome as on desktop and never needs the print dialog.
 */

/**
 * Copying resolved styles onto the clone is not portable: each engine
 * enumerates a different property set, and whatever it omits silently
 * disappears from the capture. Shipping the real stylesheets instead lets every
 * engine run its own cascade over the original markup, exactly as on screen.
 */
function collectDocumentCss(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      // A cross-origin sheet cannot be read; the export styles do not rely on one.
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) css += `${rule.cssText}\n`;
  }
  return css;
}

/**
 * An <img> whose height is `auto` has nothing to resolve against inside a
 * detached SVG, so WebKit collapses it to zero. Pinning the measured size keeps
 * every picture the same shape it had on screen.
 */
function pinImageSizes(source: HTMLElement, clone: HTMLElement): void {
  const sourceImages = Array.from(source.querySelectorAll('img'));
  const cloneImages = Array.from(clone.querySelectorAll('img'));
  sourceImages.forEach((image, index) => {
    const target = cloneImages[index];
    if (!target) return;
    const rect = image.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    setStyles(target, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      'max-width': 'none',
      'min-width': '0',
    });
  });
}

/**
 * An SVG rendered inside <img> may not fetch anything, so every picture has to
 * be embedded first. Anything unreachable is dropped rather than left to fail
 * the whole export.
 */
async function inlineImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    images.map(async (image) => {
      const source = image.getAttribute('src') || '';
      if (!source || source.startsWith('data:')) return;
      try {
        const response = await fetch(source, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('image could not be read'));
          reader.readAsDataURL(blob);
        });
        image.setAttribute('src', dataUrl);
      } catch (error) {
        console.warn('PDF export: dropping image that could not be embedded', source, error);
        image.remove();
      }
    })
  );
}

async function rasterize(element: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  await inlineImages(element);

  const bounds = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(bounds.width));
  const height = Math.max(1, Math.ceil(bounds.height));

  const clone = element.cloneNode(true) as HTMLElement;
  pinImageSizes(element, clone);
  setStyles(clone, {
    position: 'static',
    left: '0',
    top: '0',
    margin: '0',
    width: `${width}px`,
  });

  const xhtmlHost = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  xhtmlHost.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const style = document.createElement('style');
  style.textContent = collectDocumentCss();
  xhtmlHost.appendChild(style);
  xhtmlHost.appendChild(clone);

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('xmlns', svgNamespace);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const foreignObject = document.createElementNS(svgNamespace, 'foreignObject');
  foreignObject.setAttribute('x', '0');
  foreignObject.setAttribute('y', '0');
  foreignObject.setAttribute('width', String(width));
  foreignObject.setAttribute('height', String(height));
  foreignObject.appendChild(xhtmlHost);
  svg.appendChild(foreignObject);

  const markup = new XMLSerializer().serializeToString(svg);
  // Chrome treats an SVG served from a blob: URL as cross-origin, which taints
  // the canvas and blocks toDataURL. A data: URL stays same-origin.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Cannot export PDF. The page snapshot could not be rendered.'));
    image.src = url;
  });
  if (typeof image.decode === 'function') {
    await image.decode().catch(() => undefined);
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot export PDF. Canvas is unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Samples a grid of pixels to catch an engine that produced an empty capture. */
function canvasHasContent(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext('2d');
  if (!context) return false;
  const steps = 24;
  const stepX = Math.max(1, Math.floor(canvas.width / steps));
  const stepY = Math.max(1, Math.floor(canvas.height / steps));
  for (let y = 0; y < canvas.height; y += stepY) {
    for (let x = 0; x < canvas.width; x += stepX) {
      const [r, g, b] = context.getImageData(x, y, 1, 1).data;
      if (r < 245 || g < 245 || b < 245) return true;
    }
  }
  return false;
}

/**
 * Every engine tested draws the sheet correctly through <foreignObject>. If an
 * untested one refuses, html2canvas still produces a readable document, so the
 * export never fails outright. It loads only on that path, so the happy path
 * does not pay for it.
 */
async function rasterizeWithFallback(paper: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  try {
    const canvas = await rasterize(paper, scale);
    if (canvasHasContent(canvas)) return canvas;
    console.warn('PDF export: native capture came back empty, falling back.');
  } catch (error) {
    console.warn('PDF export: native capture failed, falling back.', error);
  }

  const { default: html2canvas } = await import('html2canvas');
  return html2canvas(paper, {
    scale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: PAPER_WIDTH_PX,
    onclone: sanitizeClonedDocumentForHtml2Canvas,
  });
}

function resolveSource(value: HTMLElement | string): HTMLElement {
  if (typeof value !== 'string') return value;
  const element = document.getElementById(value);
  if (!element) throw new Error(`Preview element not found: ${value}`);
  return element;
}

async function waitForImages(root: HTMLElement, timeoutMs = 3000): Promise<void> {
  const pending = Array.from(root.querySelectorAll('img')).filter((image) => !image.complete);
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(
      pending.map(
        (image) =>
          new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          })
      )
    ),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

interface VerticalRange {
  top: number;
  bottom: number;
}

function measureAvoidRanges(root: HTMLElement): VerticalRange[] {
  const rootTop = root.getBoundingClientRect().top;
  const selector = [
    '[data-pdf-frontmatter]',
    '[data-pdf-mermaid]',
    '[data-pdf-keep-together]',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'pre',
    'table',
    'figure',
    'blockquote',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top - rootTop, bottom: rect.bottom - rootTop };
    })
    .filter((range) => range.bottom - range.top > 1)
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);
}

function calculateSafeBreaks(
  totalHeight: number,
  pageHeight: number,
  ranges: VerticalRange[]
): number[] {
  const result = [0];
  const minimumFill = Math.min(96, pageHeight * 0.15);
  let pageStart = 0;
  while (pageStart + pageHeight < totalHeight - 1) {
    const desired = pageStart + pageHeight;
    const protectedTop = ranges
      .filter((range) => {
        const height = range.bottom - range.top;
        return height <= pageHeight && range.top < desired && range.bottom > desired;
      })
      .reduce((top, range) => Math.min(top, range.top), desired);
    const next = protectedTop - pageStart >= minimumFill ? protectedTop : desired;
    pageStart = Math.max(pageStart + 1, Math.min(totalHeight, next));
    result.push(pageStart);
  }
  if (result[result.length - 1] < totalHeight) result.push(totalHeight);
  return result;
}

function downloadBlob(blob: Blob, fileName: string, cleanupDelay = 1500): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, cleanupDelay);
  }
}

/**
 * jsPDF is the largest thing this package depends on, and nothing before the
 * final assembly step needs it: a document that is opened, edited and never
 * exported should not pay for it. Loading it on first export keeps it out of a
 * consumer's first-load graph, the same way html2canvas already stays out of it
 * on the fallback path above.
 *
 * The failure is translated rather than propagated, because a rejected chunk
 * load surfaces as a bare network or syntax error that names a hashed file and
 * gives the user nothing to act on.
 */
async function loadJsPdf(): Promise<typeof import('jspdf').jsPDF> {
  try {
    const { jsPDF } = await import('jspdf');
    return jsPDF;
  } catch (cause) {
    throw new Error('Cannot export PDF. The jsPDF library could not be loaded.', { cause });
  }
}

/** Canvas-backed A4 exporter with measured, block-aware page boundaries. */
export async function exportHtmlToPdfCanvas(
  source: HTMLElement | string,
  documentTitle = 'document'
): Promise<void> {
  const target = resolveSource(source);
  const name =
    (documentTitle || 'document')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'document';
  let paper: HTMLElement | null = null;

  try {
    paper = await createWhitePaperContainer(target);
    await waitForImages(paper);
    const canvas = await rasterizeWithFallback(paper, 2);
    if (!canvas.width || !canvas.height) {
      throw new Error('Cannot export PDF. The rendered page is empty.');
    }

    const JsPdf = await loadJsPdf();
    const pdf = new JsPdf('p', 'mm', 'a4');
    const margin = 10;
    const printWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const printHeight = pdf.internal.pageSize.getHeight() - margin * 2;
    const maxCanvasPageHeight = (canvas.width * printHeight) / printWidth;
    const measuredHeight = Math.max(1, paper.getBoundingClientRect().height);
    const canvasPerCssPixel = canvas.height / measuredHeight;
    const cssBreaks = calculateSafeBreaks(
      measuredHeight,
      maxCanvasPageHeight / canvasPerCssPixel,
      measureAvoidRanges(paper)
    );
    const canvasBreaks = cssBreaks.map((value, index) =>
      index === cssBreaks.length - 1
        ? canvas.height
        : Math.max(0, Math.min(canvas.height, Math.round(value * canvasPerCssPixel)))
    );

    let addedPages = 0;
    for (let index = 0; index < canvasBreaks.length - 1; index += 1) {
      const sliceTop = canvasBreaks[index];
      const sliceHeight = canvasBreaks[index + 1] - sliceTop;
      if (sliceHeight <= 0) continue;
      if (addedPages > 0) pdf.addPage();
      addedPages += 1;
      const page = document.createElement('canvas');
      page.width = canvas.width;
      page.height = sliceHeight;
      const context = page.getContext('2d');
      if (!context) throw new Error('Cannot export PDF. A page canvas could not be created.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, page.width, page.height);
      context.drawImage(
        canvas,
        0,
        sliceTop,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );
      const renderedHeight = (sliceHeight * printWidth) / canvas.width;
      pdf.addImage(
        page.toDataURL('image/jpeg', 0.95),
        'JPEG',
        margin,
        margin,
        printWidth,
        renderedHeight
      );
    }
    downloadBlob(pdf.output('blob'), `${name}.pdf`);
  } finally {
    paper?.remove();
  }
}

/** Legacy engine values are retained for caller compatibility. */
export async function exportToPdf(
  source: HTMLElement | string,
  documentTitle = 'document',
  _engine?: PdfExportEngine
): Promise<void> {
  return exportHtmlToPdfCanvas(source, documentTitle);
}

export const exportHtmlToPdfVector = exportHtmlToPdfCanvas;
export const exportHtmlToPdf = exportHtmlToPdfCanvas;
