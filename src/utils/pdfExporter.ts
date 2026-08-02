import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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

/**
 * Captures the rendered HTML preview element using html2canvas & jsPDF,
 * preserving all custom components, tables, charts, dark/light theme, and layout,
 * and saves it directly as a sharp, multi-page PDF document.
 */
export async function exportHtmlToPdf(elementId: string, documentTitle: string = 'document'): Promise<void> {
  const targetElement = document.getElementById(elementId);
  if (!targetElement) {
    throw new Error('Preview element not found');
  }

  const sanitizedTitle = (documentTitle || 'document')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const fileName = `${sanitizedTitle || 'document'}.pdf`;

  const colorCache = new Map<string, string>();
  const safeColorReplace = (colorStr: string): string => {
    if (colorCache.has(colorStr)) {
      return colorCache.get(colorStr)!;
    }
    let converted = 'rgba(0,0,0,0)';
    try {
      const temp = document.createElement('div');
      temp.style.color = colorStr;
      document.body.appendChild(temp);
      const comp = window.getComputedStyle(temp).color;
      document.body.removeChild(temp);
      if (comp && (comp.startsWith('rgb') || comp.startsWith('#'))) {
        converted = comp;
      }
    } catch {
      // fallback
    }
    colorCache.set(colorStr, converted);
    return converted;
  };

  let canvas: HTMLCanvasElement | null = null;

  try {
    canvas = await html2canvas(targetElement, {
      scale: 2, // High DPI rendering
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: window.getComputedStyle(targetElement).backgroundColor || '#ffffff',
      windowWidth: targetElement.scrollWidth || 1024,
      onclone: (clonedDoc) => {
        // 1. Sanitize all <style> elements in clonedDoc to eliminate color-mix/oklab/oklch rules that crash html2canvas
        const styleTags = clonedDoc.querySelectorAll('style');
        styleTags.forEach((styleTag) => {
          if (styleTag.textContent) {
            styleTag.textContent = styleTag.textContent.replace(
              /(color-mix|oklab|oklch|light-dark)\b[^;}]*/gi,
              'rgba(0, 0, 0, 0)'
            );
          }
        });

        const clonedEl = clonedDoc.getElementById(elementId);
        if (clonedEl) {
          // Reset position, visibility, display, and opacity on clonedEl AND all parent wrappers in cloned doc
          let pNode: HTMLElement | null = clonedEl;
          while (pNode && pNode !== clonedDoc.body) {
            pNode.style.position = 'static';
            pNode.style.left = '0';
            pNode.style.top = '0';
            pNode.style.opacity = '1';
            pNode.style.visibility = 'visible';
            pNode.style.display = 'block';
            pNode.style.overflow = 'visible';
            pNode = pNode.parentElement;
          }

          clonedEl.style.width = '800px';
          clonedEl.style.height = 'auto';
          clonedEl.style.maxHeight = 'none';
          clonedEl.style.overflow = 'visible';

          // 2. Transfer computed styles from original DOM to cloned DOM elements
          const origNodes = [targetElement, ...Array.from(targetElement.querySelectorAll('*'))];
          const clonedNodes = [clonedEl, ...Array.from(clonedEl.querySelectorAll('*'))];

          for (let i = 0; i < origNodes.length; i++) {
            const orig = origNodes[i] as HTMLElement;
            const clone = clonedNodes[i] as HTMLElement;
            if (orig && clone && clone.style) {
              try {
                const cs = window.getComputedStyle(orig);

                if (cs.color && cs.color.startsWith('rgb')) {
                  clone.style.color = cs.color;
                }
                if (
                  cs.backgroundColor &&
                  cs.backgroundColor.startsWith('rgb') &&
                  cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
                ) {
                  clone.style.backgroundColor = cs.backgroundColor;
                }
                if (cs.borderColor && cs.borderColor.startsWith('rgb')) {
                  clone.style.borderColor = cs.borderColor;
                }
                if (cs.fill && cs.fill.startsWith('rgb')) {
                  clone.style.fill = cs.fill;
                }
                if (cs.stroke && cs.stroke.startsWith('rgb')) {
                  clone.style.stroke = cs.stroke;
                }
              } catch {
                // ignore computed style errors
              }

              // Strip backdrop blur filters that cause html2canvas context freezes
              clone.style.backdropFilter = 'none';
              (clone.style as any).webkitBackdropFilter = 'none';

              // Clean inline style attributes on cloned element
              if (clone.getAttribute('style')) {
                const rawStyle = clone.getAttribute('style')!;
                if (/color-mix|oklab|oklch|light-dark/i.test(rawStyle)) {
                  clone.setAttribute(
                    'style',
                    rawStyle.replace(/(color-mix|oklab|oklch|light-dark)\b[^;}]*/gi, 'rgba(0, 0, 0, 0)')
                  );
                }
              }
            }
          }

          // 3. Set explicit dimensions on SVGs so html2canvas doesn't freeze
          const svgs = clonedEl.querySelectorAll('svg');
          svgs.forEach((svg) => {
            const rect = svg.getBoundingClientRect();
            if (rect.width > 0) svg.setAttribute('width', `${rect.width}px`);
            if (rect.height > 0) svg.setAttribute('height', `${rect.height}px`);
          });
        }
      },
    });
  } catch (renderError) {
    console.warn('html2canvas rendering encountered error, proceeding with text layout PDF generator:', renderError);
  }

  const pdf = new jsPDF('p', 'mm', 'a4');

  if (canvas && canvas.width > 0 && canvas.height > 0) {
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 8; // 8mm page margin
    const printWidth = pdfWidth - margin * 2;
    const printHeight = (canvas.height * printWidth) / canvas.width;

    let heightLeft = printHeight;
    let position = margin;

    // Add first page
    pdf.addImage(imgData, 'JPEG', margin, position, printWidth, Math.min(printHeight, pdfHeight - margin * 2));
    heightLeft -= (pdfHeight - margin * 2);

    // Add extra pages if content spans multiple pages
    while (heightLeft > 0) {
      position = margin - (printHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, position, printWidth, printHeight);
      heightLeft -= (pdfHeight - margin * 2);
    }
  } else {
    // Fallback formatted text PDF if canvas generation was unavailable
    const title = documentTitle || 'Document';
    pdf.setFontSize(18);
    pdf.text(title, 12, 18);
    pdf.setFontSize(10);

    const lines = pdf.splitTextToSize(targetElement.innerText || '', 180);
    let y = 28;
    for (let i = 0; i < lines.length; i++) {
      if (y > 280) {
        pdf.addPage();
        y = 15;
      }
      pdf.text(lines[i], 12, y);
      y += 5;
    }
  }

  // Trigger PDF file download via Blob URL + hidden <a> click (matches downloadMdxFile behavior)
  try {
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
  } catch (blobErr) {
    console.warn('Blob URL PDF download failed, executing pdf.save():', blobErr);
    pdf.save(fileName);
  }
}
