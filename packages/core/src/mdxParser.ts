import { load as parseYaml } from 'js-yaml';
import { Frontmatter, HeaderItem, DocumentStats } from './types';

/**
 * Extracts YAML frontmatter and markdown body from MDX content string
 */
export function parseFrontmatter(content: string): {
  frontmatter: Frontmatter | null;
  body: string;
  rawYaml: string | null;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: null,
      body: content,
      rawYaml: null,
    };
  }

  const rawYaml = match[1];
  const body = content.slice(match[0].length);

  try {
    const parsed = parseYaml(rawYaml);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        frontmatter: parsed as Frontmatter,
        body,
        rawYaml,
      };
    }
  } catch (e) {
    console.warn('Failed to parse YAML frontmatter:', e);
  }

  return {
    frontmatter: null,
    body,
    rawYaml,
  };
}

/**
 * Generates URL-friendly slug for header IDs
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extracts all markdown/MDX headings (# H1, ## H2, etc.) for Table of Contents
 */
export function extractHeadings(content: string): HeaderItem[] {
  const headings: HeaderItem[] = [];
  
  // Clean frontmatter first so headers in frontmatter aren't included
  const { body } = parseFrontmatter(content);

  // Regex to match ATX headings like `# Heading`, `## Heading`, etc.
  const headingRegex = /^(#{1,4})\s+(.+)$/gm;
  let match;

  const slugCounts = new Map<string, number>();

  while ((match = headingRegex.exec(body)) !== null) {
    const level = match[1].length;
    // Strip markdown formatting like bold, italic, inline code from header text
    const rawText = match[2].trim();
    const cleanText = rawText
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // link
      .replace(/[*_`]/g, '') // bold/italic/code
      .replace(/<[^>]+>/g, ''); // html tags

    let id = slugify(cleanText) || `heading-${headings.length + 1}`;
    
    // Ensure unique IDs if duplicate headers exist
    const count = slugCounts.get(id) || 0;
    if (count > 0) {
      slugCounts.set(id, count + 1);
      id = `${id}-${count}`;
    } else {
      slugCounts.set(id, 1);
    }

    headings.push({
      id,
      text: cleanText,
      level,
    });
  }

  return headings;
}

/**
 * Calculates document stats (word count, reading time, character count)
 */
export function calculateDocumentStats(content: string): DocumentStats {
  const { body } = parseFrontmatter(content);
  
  // Strip code blocks and HTML/JSX tags for accurate word count
  const cleanBody = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  const words = cleanBody ? cleanBody.split(/\s+/).filter(Boolean).length : 0;
  const characters = body.length;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));
  const headingsCount = extractHeadings(content).length;

  return {
    words,
    characters,
    readingTimeMinutes,
    headingsCount,
  };
}
