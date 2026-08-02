import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export type PdfExportEngine = 'html2pdf' | 'canvas';

/**
 * Downloads a raw text string (such as MDX content) as a file.
 * Handles appendChild & Blob URL cleanup to work reliably in sandboxed iframe environments.
 */
export function downloadMdxFile(content: string, documentTitle: string = 'document'): void {
  const sanitizedTitle = (documentTitle || 'document')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const fileName = `${sanitizedTitle || 'document'}.mdx`;

  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (err) {
    console.warn('Blob URL download failed, trying Data URI fallback:', err);
    const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(content);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    link.target = '_blank';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 1000);
  }
}

// Global cached canvas 2D context for fast color resolution
let sharedCanvasCtx: CanvasRenderingContext2D | null = null;
function getSharedCanvasCtx(): CanvasRenderingContext2D | null {
  if (!sharedCanvasCtx && typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      sharedCanvasCtx = canvas.getContext('2d');
    } catch {
      sharedCanvasCtx = null;
    }
  }
  return sharedCanvasCtx;
}

/**
 * Safely converts any oklab, oklch, or modern CSS color function string
 * into standard hex (#rrggbb) or rgb(...) format that html2canvas can parse without errors.
 */
export function parseCssColorToRgb(colorStr: string): string {
  if (!colorStr || colorStr === 'transparent' || colorStr === 'inherit' || colorStr === 'initial' || colorStr === 'none') {
    return colorStr;
  }
  if (!colorStr.includes('oklab') && !colorStr.includes('oklch') && !colorStr.includes('light-dark') && !colorStr.includes('color(') && !colorStr.includes('color-mix')) {
    return colorStr;
  }

  const ctx = getSharedCanvasCtx();
  if (ctx) {
    try {
      ctx.fillStyle = '#0f172a'; // Default fallback
      ctx.fillStyle = colorStr;
      const resolved = ctx.fillStyle;
      if (resolved && !resolved.includes('oklab') && !resolved.includes('oklch') && !resolved.includes('color(')) {
        return resolved;
      }
    } catch {
      // Fall through
    }
  }

  if (colorStr.includes('255, 255, 255') || colorStr.includes('fff')) {
    return '#ffffff';
  }
  return '#0f172a';
}

/**
 * Sanitizes a CLONED document object ONLY inside html2canvas onclone callback.
 * NEVER mutates the main document or live DOM elements!
 */
export function sanitizeClonedDocumentForHtml2Canvas(clonedDoc: Document): void {
  try {
    const styleTags = Array.from(clonedDoc.querySelectorAll('style'));
    styleTags.forEach((style) => {
      if (style.textContent) {
        style.textContent = style.textContent
          .replace(/oklab\([^)]+\)/gi, '#0f172a')
          .replace(/oklch\([^)]+\)/gi, '#0f172a')
          .replace(/color-mix\([^)]+\)/gi, '#0f172a')
          .replace(/light-dark\([^)]+\)/gi, '#0f172a');
      }
    });

    const containerEl = clonedDoc.body;
    if (!containerEl) return;

    const allElements = Array.from(containerEl.querySelectorAll('*')) as HTMLElement[];
    const defaultView = clonedDoc.defaultView || window;

    allElements.forEach((el) => {
      try {
        if (el.style && el.style.cssText) {
          if (el.style.cssText.includes('oklab') || el.style.cssText.includes('oklch') || el.style.cssText.includes('color(') || el.style.cssText.includes('color-mix')) {
            el.style.cssText = el.style.cssText
              .replace(/oklab\([^)]+\)/gi, '#0f172a')
              .replace(/oklch\([^)]+\)/gi, '#0f172a')
              .replace(/color-mix\([^)]+\)/gi, '#0f172a')
              .replace(/light-dark\([^)]+\)/gi, '#0f172a');
          }
        }

        const computed = defaultView.getComputedStyle(el);
        if (computed) {
          const color = computed.color;
          const bg = computed.backgroundColor;
          const border = computed.borderColor;

          if (color && (color.includes('oklab') || color.includes('oklch') || color.includes('color'))) {
            el.style.color = parseCssColorToRgb(color);
          }
          if (bg && (bg.includes('oklab') || bg.includes('oklch') || bg.includes('color'))) {
            el.style.backgroundColor = parseCssColorToRgb(bg);
          }
          if (border && (border.includes('oklab') || border.includes('oklch') || border.includes('color'))) {
            el.style.borderColor = parseCssColorToRgb(border);
          }

          if (computed.boxShadow && (computed.boxShadow.includes('oklab') || computed.boxShadow.includes('oklch') || computed.boxShadow.includes('color-mix'))) {
            el.style.boxShadow = 'none';
          }
        }
      } catch {
        // Ignore individual element access errors
      }
    });
  } catch (err) {
    console.warn('Cloned doc sanitization warning:', err);
  }
}

/**
 * Renders an SVG diagram element to a high-resolution 3x PNG image wrapper via Canvas.
 * Extracts foreignObject text labels into crisp native SVG text elements and applies light paper styling.
 */
async function rasterizeSvgToPngElement(
  origSvg: SVGElement,
  targetWidth: number = 680
): Promise<HTMLElement> {
  try {
    const svgClone = origSvg.cloneNode(true) as SVGElement;

    // 1. Convert foreignObject elements into standard SVG text elements for universal canvas rendering
    const foreignObjects = Array.from(svgClone.querySelectorAll('foreignObject'));
    foreignObjects.forEach((fo) => {
      const labels = Array.from(fo.querySelectorAll('*'))
        .map((el) => (el.textContent || '').trim())
        .filter((txt) => txt.length > 0);

      const labelText = labels.length > 0 ? labels[labels.length - 1] : fo.textContent || '';

      const x = parseFloat(fo.getAttribute('x') || '0');
      const y = parseFloat(fo.getAttribute('y') || '0');
      const w = parseFloat(fo.getAttribute('width') || '100');
      const h = parseFloat(fo.getAttribute('height') || '40');

      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', String(x + w / 2));
      textEl.setAttribute('y', String(y + h / 2));
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'central');
      textEl.setAttribute('fill', '#0f172a');
      textEl.setAttribute('font-size', '13px');
      textEl.setAttribute('font-weight', '600');
      textEl.setAttribute('font-family', 'ui-sans-serif, system-ui, -apple-system, sans-serif');
      textEl.textContent = labelText;

      fo.parentNode?.replaceChild(textEl, fo);
    });

    // 2. Override internal vector colors for crisp light-mode paper contrast
    const allNodes = Array.from(svgClone.querySelectorAll('*'));
    allNodes.forEach((node) => {
      const tag = node.tagName.toLowerCase();
      const cls = (node.getAttribute('class') || '').toLowerCase();

      if (tag === 'style') {
        node.textContent = (node.textContent || '')
          .replace(/fill:\s*(#0d1117|#161b22|#0f172a|#1e293b|#020617|#1f2937|#111827|#000000|#000|black)/gi, 'fill: #e0e7ff')
          .replace(/color:\s*(#ffffff|#f9fafc|#fff|white)/gi, 'color: #0f172a')
          .replace(/fill:\s*(#ffffff|#f9fafc|#fff|white)/gi, 'fill: #0f172a');
      }

      if (tag === 'text' || tag === 'tspan' || cls.includes('nodelabel') || cls.includes('edgelabel')) {
        node.setAttribute('fill', '#0f172a');
        (node as any).style.fill = '#0f172a';
        (node as any).style.color = '#0f172a';
        (node as any).style.fontWeight = '600';
      }

      if (cls.includes('cluster') || cls.includes('subgraph')) {
        const rect = node.querySelector('rect') || (tag === 'rect' ? node : null);
        if (rect) {
          rect.setAttribute('fill', '#f8fafc');
          rect.setAttribute('stroke', '#cbd5e1');
        }
      } else if (tag === 'rect' || tag === 'circle' || tag === 'polygon' || tag === 'path' || tag === 'ellipse') {
        const currentFill = (node.getAttribute('fill') || '').toLowerCase();
        if (!currentFill || currentFill === 'none' || currentFill.includes('0f172a') || currentFill.includes('1e293b') || currentFill.includes('000') || currentFill.includes('161b22')) {
          if (!cls.includes('edge') && !cls.includes('line') && !cls.includes('link') && !cls.includes('arrow')) {
            node.setAttribute('fill', '#e0e7ff');
            (node as any).style.fill = '#e0e7ff';
          }
        }
        if (!cls.includes('edge') && !cls.includes('line') && !cls.includes('link') && !cls.includes('arrow')) {
          node.setAttribute('stroke', '#6366f1');
          (node as any).style.stroke = '#6366f1';
        }
      }

      if (cls.includes('edge') || cls.includes('link') || cls.includes('flowchart-link')) {
        node.setAttribute('stroke', '#4f46e5');
        (node as any).style.stroke = '#4f46e5';
      }

      if (tag === 'marker' || cls.includes('arrowhead') || cls.includes('marker')) {
        const paths = node.querySelectorAll('path, polygon');
        paths.forEach((p) => {
          p.setAttribute('fill', '#4f46e5');
          p.setAttribute('stroke', '#4f46e5');
        });
      }
    });

    // 3. Compute dimensions accurately
    const rect = origSvg.getBoundingClientRect();
    let width = rect.width || 600;
    let height = rect.height || 400;

    const viewBoxAttr = origSvg.getAttribute('viewBox') || svgClone.getAttribute('viewBox');
    if (viewBoxAttr) {
      const parts = viewBoxAttr.trim().split(/[\s,]+/);
      if (parts.length === 4) {
        const vbW = parseFloat(parts[2]);
        const vbH = parseFloat(parts[3]);
        if (vbW > 0 && vbH > 0) {
          width = vbW;
          height = vbH;
        }
      }
    }

    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    svgClone.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // 4. Render to Canvas at 3x resolution for high crispness
    const xmlString = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([xmlString], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(svgBlob);

    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve) => {
      img.onload = () => {
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        URL.revokeObjectURL(blobUrl);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve();
      };
      img.src = blobUrl;
    });

    const pngUrl = canvas.toDataURL('image/png', 1.0);

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-mermaid-raster-wrapper';
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems = 'center';
    wrapper.style.width = '100%';
    wrapper.style.margin = '16px 0';
    wrapper.style.backgroundColor = '#ffffff';

    const pngImg = document.createElement('img');
    pngImg.src = pngUrl;
    pngImg.style.maxWidth = '100%';
    pngImg.style.width = `${Math.min(width, targetWidth)}px`;
    pngImg.style.height = 'auto';
    pngImg.style.display = 'block';
    pngImg.style.margin = '0 auto';
    pngImg.style.backgroundColor = '#ffffff';
    pngImg.style.borderRadius = '8px';
    pngImg.style.border = '1px solid #e2e8f0';

    wrapper.appendChild(pngImg);
    return wrapper;
  } catch (err) {
    console.warn('SVG rasterization fallback warning:', err);
    const fallback = document.createElement('div');
    fallback.style.margin = '12px 0';
    fallback.appendChild(origSvg.cloneNode(true));
    return fallback;
  }
}

/**
 * Creates a temporary offscreen A4 white paper container.
 * Completely strips dark backgrounds, removes all copy code buttons/headers,
 * and rasterizes Mermaid diagrams to high-res PNGs for flawless A4 printing.
 */
export async function createWhitePaperContainer(sourceElement: HTMLElement): Promise<HTMLElement> {
  const clone = sourceElement.cloneNode(true) as HTMLElement;

  // Outer container styled as standard A4 sheet (794px width = 210mm at 96 DPI)
  const container = document.createElement('div');
  container.className = 'pdf-export-paper-sheet';
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.padding = '32px';
  container.style.boxSizing = 'border-box';
  container.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  container.style.fontSize = '14px';
  container.style.lineHeight = '1.6';
  container.style.zIndex = '-9999';
  container.style.pointerEvents = 'none';

  // Apply clean white paper styling to root clone
  clone.classList.remove('dark');
  clone.style.backgroundColor = '#ffffff';
  clone.style.color = '#0f172a';
  clone.style.width = '100%';
  clone.style.maxWidth = '100%';
  clone.style.padding = '0';
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';

  // 1. REMOVE ALL INTERACTIVE BUTTONS (Copy, Download, Edit, Toggle)
  const buttonsToHide = Array.from(clone.querySelectorAll('button')) as HTMLElement[];
  buttonsToHide.forEach((btn) => {
    btn.remove();
  });

  // Remove any elements containing copy text/icons
  const allCopyEls = Array.from(clone.querySelectorAll('*')).filter((el) => {
    const text = (el.textContent || '').trim().toLowerCase();
    return text === 'copy' || text === 'copied' || text === 'copy code' || text === 'copy mermaid code';
  }) as HTMLElement[];
  allCopyEls.forEach((el) => el.remove());

  // 2. CONVERT MERMAID DIAGRAM SVGS TO HIGH-DPI PNG IMAGES
  const origSvgs = Array.from(sourceElement.querySelectorAll('svg'));
  const clonedSvgs = Array.from(clone.querySelectorAll('svg'));

  for (let i = 0; i < clonedSvgs.length; i++) {
    const clonedSvg = clonedSvgs[i];
    const origSvg = origSvgs[i] || clonedSvg;

    const rasterWrapper = await rasterizeSvgToPngElement(origSvg, 680);
    const parent = clonedSvg.parentElement;
    if (parent) {
      parent.replaceChild(rasterWrapper, clonedSvg);
    }
  }

  // Also sanitize Mermaid containers
  const mermaidContainers = Array.from(
    clone.querySelectorAll('.mermaid-svg-container, [class*="Mermaid"], [class*="mermaid"]')
  ) as HTMLElement[];
  mermaidContainers.forEach((mc) => {
    mc.style.backgroundColor = '#ffffff';
    mc.style.borderColor = '#e2e8f0';
    mc.style.color = '#0f172a';
    mc.style.boxShadow = 'none';

    // Remove top header bar inside diagram cards if empty or containing title
    const headerBar = mc.querySelector('div') as HTMLElement | null;
    if (headerBar) {
      headerBar.style.backgroundColor = '#ffffff';
      headerBar.style.borderColor = '#e2e8f0';
      headerBar.style.color = '#0f172a';
    }
  });

  // 3. CONVERT CODE BLOCKS & PRISM SYNTAX TO CLEAN LIGHT PAPER THEME
  const preElements = Array.from(clone.querySelectorAll('pre')) as HTMLElement[];
  preElements.forEach((pre) => {
    // Format outer block wrapper
    const parentBlock = pre.closest('.group, [class*="CodeBlock"], .relative, div') as HTMLElement | null;
    if (parentBlock && parentBlock !== clone && parentBlock !== document.body) {
      parentBlock.style.backgroundColor = '#f8fafc';
      parentBlock.style.borderColor = '#cbd5e1';
      parentBlock.style.borderRadius = '8px';
      parentBlock.style.boxShadow = 'none';
      parentBlock.style.overflow = 'hidden';

      // Clean top header bar above code (remove dark background and copy buttons)
      const headerBar = parentBlock.querySelector('div') as HTMLElement | null;
      if (headerBar && headerBar !== pre.parentElement) {
        headerBar.style.backgroundColor = '#f1f5f9';
        headerBar.style.borderBottom = '1px solid #cbd5e1';
        headerBar.style.color = '#334155';
        headerBar.style.padding = '6px 12px';

        const childBtns = Array.from(headerBar.querySelectorAll('button'));
        childBtns.forEach((b) => b.remove());
      }
    }

    if (pre.parentElement && pre.parentElement !== parentBlock) {
      pre.parentElement.style.backgroundColor = '#f8fafc';
      pre.parentElement.style.color = '#0f172a';
    }

    pre.style.backgroundColor = '#f8fafc';
    pre.style.color = '#0f172a';
    pre.style.border = '1px solid #cbd5e1';
    pre.style.borderRadius = '8px';
    pre.style.padding = '12px 14px';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-word';
    pre.style.margin = '0';

    // Format Prism syntax tokens for white paper contrast
    const tokens = Array.from(pre.querySelectorAll('.token, span')) as HTMLElement[];
    tokens.forEach((token) => {
      const cls = token.className || '';
      if (cls.includes('keyword') || cls.includes('tag')) {
        token.style.color = '#0284c7'; // Sky Blue
        token.style.fontWeight = '600';
      } else if (cls.includes('string') || cls.includes('attr-value')) {
        token.style.color = '#15803d'; // Emerald Green
      } else if (cls.includes('comment') || cls.includes('prolog') || cls.includes('doctype')) {
        token.style.color = '#64748b'; // Slate Gray
        token.style.fontStyle = 'italic';
      } else if (cls.includes('function') || cls.includes('class-name') || cls.includes('title')) {
        token.style.color = '#7c3aed'; // Violet
        token.style.fontWeight = '600';
      } else if (cls.includes('number') || cls.includes('boolean') || cls.includes('constant')) {
        token.style.color = '#c2410c'; // Orange
      } else if (cls.includes('operator') || cls.includes('punctuation')) {
        token.style.color = '#334155'; // Dark Slate
      } else if (cls.includes('builtin') || cls.includes('attr-name')) {
        token.style.color = '#0d9488'; // Teal
      } else {
        token.style.color = '#0f172a';
      }
    });
  });

  const inlineCodes = Array.from(clone.querySelectorAll('code:not(pre code)')) as HTMLElement[];
  inlineCodes.forEach((ic) => {
    ic.style.display = 'inline-block';
    ic.style.backgroundColor = '#f1f5f9';
    ic.style.color = '#0f172a';
    ic.style.border = '1px solid #cbd5e1';
    ic.style.borderRadius = '4px';
    ic.style.padding = '1px 5px';
    ic.style.margin = '0 2px';
    ic.style.fontSize = '0.85em';
    ic.style.lineHeight = '1.2';
  });

  // 4. CONVERT FRONTMATTER HEADERS & BADGES
  const frontmatterBlocks = Array.from(
    clone.querySelectorAll('[data-pdf-frontmatter="true"], [class*="frontmatter"]')
  ) as HTMLElement[];
  frontmatterBlocks.forEach((fm) => {
    fm.style.backgroundColor = '#ffffff';
    fm.style.borderColor = '#e2e8f0';
    fm.style.color = '#0f172a';
    fm.style.borderRadius = '12px';
    fm.style.boxShadow = 'none';

    const childTexts = Array.from(fm.querySelectorAll('h1, h2, h3, h4, p, span, div, strong')) as HTMLElement[];
    childTexts.forEach((ct) => {
      ct.style.color = '#0f172a';
    });

    const badges = Array.from(fm.querySelectorAll('span[class*="rounded"]')) as HTMLElement[];
    badges.forEach((bg) => {
      bg.style.backgroundColor = '#e0e7ff';
      bg.style.color = '#3730a3';
      bg.style.borderColor = '#c7d2fe';
    });
  });

  // 5. CONVERT HEADINGS, CALLOUTS, TABLES, CARDS
  const headings = Array.from(clone.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
  headings.forEach((h) => {
    h.style.color = '#0f172a';
    if (h.tagName === 'H1' || h.tagName === 'H2') {
      h.style.borderBottom = '1px solid #e2e8f0';
      h.style.paddingBottom = '6px';
    }
  });

  const tables = Array.from(clone.querySelectorAll('table')) as HTMLElement[];
  tables.forEach((tbl) => {
    tbl.style.backgroundColor = '#ffffff';
    tbl.style.color = '#0f172a';
    tbl.style.border = '1px solid #cbd5e1';
    tbl.style.borderCollapse = 'collapse';
    tbl.style.width = '100%';

    const ths = Array.from(tbl.querySelectorAll('th')) as HTMLElement[];
    ths.forEach((th) => {
      th.style.backgroundColor = '#f1f5f9';
      th.style.color = '#0f172a';
      th.style.border = '1px solid #cbd5e1';
      th.style.padding = '8px 12px';
      th.style.fontWeight = '600';
    });

    const tds = Array.from(tbl.querySelectorAll('td')) as HTMLElement[];
    tds.forEach((td) => {
      td.style.backgroundColor = '#ffffff';
      td.style.color = '#1e293b';
      td.style.border = '1px solid #e2e8f0';
      td.style.padding = '8px 12px';
    });
  });

  // 6. GLOBAL CATCH-ALL FOR REMAINING DARK BACKGROUNDS & TEXT
  const allElements = Array.from(clone.querySelectorAll('*')) as HTMLElement[];
  allElements.forEach((el) => {
    // Remove dark mode Tailwind classes
    el.classList.remove(
      'dark',
      'bg-slate-950',
      'bg-slate-900',
      'bg-slate-800',
      'bg-slate-950/90',
      'bg-slate-900/50',
      'bg-slate-950/50',
      'bg-black',
      'bg-zinc-900',
      'bg-neutral-900'
    );

    const compStyle = window.getComputedStyle(el);
    const compColor = compStyle.color;
    if (compColor && (compColor.includes('255, 255, 255') || compColor.includes('248, 250, 252') || compColor.includes('241, 245, 249') || compColor.includes('226, 232, 240'))) {
      el.style.color = '#0f172a';
    }

    const compBg = compStyle.backgroundColor;
    if (
      compBg &&
      (compBg.includes('15, 23, 42') ||
        compBg.includes('30, 41, 59') ||
        compBg.includes('2, 6, 23') ||
        compBg.includes('17, 24, 39') ||
        compBg.includes('24, 24, 27') ||
        compBg.includes('0, 0, 0'))
    ) {
      el.style.backgroundColor = '#f8fafc';
      el.style.borderColor = '#e2e8f0';
    }

    el.style.backdropFilter = 'none';
    (el.style as any).webkitBackdropFilter = 'none';

    // Page break rules
    if (
      ['H1', 'H2', 'H3', 'H4', 'PRE', 'TABLE', 'IMG', 'FIGURE', 'BLOCKQUOTE'].includes(el.tagName) ||
      el.classList.contains('pdf-mermaid-raster-wrapper')
    ) {
      el.style.pageBreakInside = 'avoid';
      (el.style as any).breakInside = 'avoid';
    }
  });

  container.appendChild(clone);
  document.body.appendChild(container);

  return container;
}

/**
 * Standard, robust A4 PDF exporter built with html2canvas and jsPDF.
 * Clean, zero DOM-mutation, zero-crash paper rendering.
 */
export async function exportHtmlToPdfCanvas(
  elementId: string,
  documentTitle: string = 'document'
): Promise<void> {
  const targetElement = document.getElementById(elementId);
  if (!targetElement) {
    throw new Error('Preview element not found');
  }

  const sanitizedTitle = (documentTitle || 'document')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'document';
  const fileName = `${sanitizedTitle}.pdf`;

  const paperContainer = await createWhitePaperContainer(targetElement);

  // Small delay for DOM layout & images to settle in cloned paper sheet
  await new Promise((r) => setTimeout(r, 250));

  try {
    const canvas = await html2canvas(paperContainer, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 794,
      onclone: (clonedDoc: Document) => {
        sanitizeClonedDocumentForHtml2Canvas(clonedDoc);
      },
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth(); // ~210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // ~297mm
    const margin = 10; // 10mm margins
    const printWidth = pdfWidth - margin * 2; // 190mm
    const pageCanvasHeight = (canvas.width * (pdfHeight - margin * 2)) / printWidth;

    let heightRemaining = canvas.height;
    let canvasY = 0;
    let pageIndex = 0;

    while (heightRemaining > 0) {
      if (pageIndex > 0) {
        pdf.addPage();
      }

      const pageSliceHeight = Math.min(pageCanvasHeight, heightRemaining);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = pageSliceHeight;

      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          canvasY,
          canvas.width,
          pageSliceHeight,
          0,
          0,
          canvas.width,
          pageSliceHeight
        );

        const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
        const printHeight = (pageSliceHeight * printWidth) / canvas.width;

        pdf.addImage(pageImgData, 'JPEG', margin, margin, printWidth, printHeight);
      }

      canvasY += pageSliceHeight;
      heightRemaining -= pageSliceHeight;
      pageIndex++;
    }

    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(blobUrl);
    }, 1500);
  } finally {
    if (document.body.contains(paperContainer)) {
      document.body.removeChild(paperContainer);
    }
  }
}

/**
 * Primary PDF exporter alias using html2canvas + jsPDF.
 */
export async function exportToPdf(
  elementId: string,
  documentTitle: string = 'document',
  _engine?: PdfExportEngine
): Promise<void> {
  return exportHtmlToPdfCanvas(elementId, documentTitle);
}

/**
 * Backward compatibility aliases.
 */
export const exportHtmlToPdfVector = exportHtmlToPdfCanvas;
export const exportHtmlToPdf = exportHtmlToPdfCanvas;
