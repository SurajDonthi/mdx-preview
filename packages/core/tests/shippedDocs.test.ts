import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parseFrontmatter, parseMdxDocument } from '@mdxstudio/core';

const docs = path.resolve(__dirname, '../../../docs');

describe('the documents this repository ships', () => {
  for (const name of readdirSync(docs).filter((file) => file.endsWith('.mdx'))) {
    it(`${name} parses`, () => {
      const { body } = parseFrontmatter(readFileSync(path.join(docs, name), 'utf8'));
      const { error, diagnostics } = parseMdxDocument(body);

      expect(error).toBeNull();
      expect(diagnostics).toEqual([]);
    });
  }
});
