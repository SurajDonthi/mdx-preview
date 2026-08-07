/**
 * localStorage persistence and the sync merge.
 *
 * This is where document loss lives. Three rules carry it, and each one has a
 * silent failure mode:
 *
 * - `updatedAt` is the *only* thing that resolves a cross-device conflict, so a
 *   save that changed nothing must not bump it. If it does, merely opening a
 *   stale copy beats a real edit made elsewhere and the edit disappears.
 * - Deletion writes a tombstone instead of dropping the row. Without one, a
 *   device still holding the document re-uploads it and the subscription hands
 *   it straight back.
 * - Seeded sample ids carry a per-install suffix. Without it the fixed sample
 *   ids collide across accounts in shared cloud storage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNewDocument,
  deleteDocument,
  getActiveDocumentId,
  loadAllDocuments,
  loadAllRecords,
  mergeDocuments,
  saveAllDocuments,
  saveDocument,
  setActiveDocumentId,
} from '../src/utils/storage';
import type { StoredDocument } from '../src/utils/storage';
import { SAMPLE_DOCUMENTS } from '../src/data/sampleMDX';

const STORAGE_KEY = 'mdx_studio_documents_v1';
const INSTALL_ID_KEY = 'mdx_studio_install_id';
const DAY_MS = 24 * 60 * 60 * 1000;

const AT = (iso: string) => new Date(iso).toISOString();

function doc(overrides: Partial<StoredDocument> & { id: string }): StoredDocument {
  return {
    title: 'Title',
    content: 'content',
    updatedAt: AT('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** Every record on disk, tombstones included. */
function rawRecords(): StoredDocument[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('seeding', () => {
  it('suffixes every seeded sample id with a per-install id', () => {
    const seeded = loadAllRecords();
    const installId = localStorage.getItem(INSTALL_ID_KEY);

    expect(installId).toBeTruthy();
    expect(seeded).toHaveLength(SAMPLE_DOCUMENTS.length);
    for (const [index, record] of seeded.entries()) {
      expect(record.id).toBe(`${SAMPLE_DOCUMENTS[index].id}-${installId}`);
      expect(record.isSample).toBe(true);
    }
  });

  it('gives two installs different ids for the same sample', () => {
    const first = loadAllRecords()[0].id;

    localStorage.clear();
    const second = loadAllRecords()[0].id;

    expect(second).not.toBe(first);
    expect(second.startsWith(`${SAMPLE_DOCUMENTS[0].id}-`)).toBe(true);
  });

  it('reuses the install id once it exists', () => {
    loadAllRecords();
    const installId = localStorage.getItem(INSTALL_ID_KEY);

    localStorage.removeItem(STORAGE_KEY);
    loadAllRecords();

    expect(localStorage.getItem(INSTALL_ID_KEY)).toBe(installId);
  });

  it('returns nothing rather than reseeding when the store is corrupt', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, '{not json');

    expect(loadAllRecords()).toEqual([]);
    expect(error).toHaveBeenCalled();
  });
});

describe('saveDocument', () => {
  const existing = doc({ id: 'a', title: 'Original', content: 'body' });

  beforeEach(() => {
    saveAllDocuments([existing]);
  });

  it('does not advance updatedAt when nothing changed', () => {
    vi.setSystemTime(new Date('2026-06-02T00:00:00.000Z'));
    saveDocument({ ...existing });

    expect(rawRecords()[0].updatedAt).toBe(existing.updatedAt);
  });

  it('does not advance updatedAt when only unrelated fields changed', () => {
    // Opening a document or signing in writes driveFileId; neither is an edit.
    vi.setSystemTime(new Date('2026-06-02T00:00:00.000Z'));
    saveDocument({ ...existing, driveFileId: 'drive-1' });

    const [record] = rawRecords();
    expect(record.updatedAt).toBe(existing.updatedAt);
    expect(record.driveFileId).toBe('drive-1');
  });

  it('advances updatedAt when the content changed', () => {
    vi.setSystemTime(new Date('2026-06-02T00:00:00.000Z'));
    saveDocument({ ...existing, content: 'edited' });

    expect(rawRecords()[0].updatedAt).toBe(AT('2026-06-02T00:00:00.000Z'));
  });

  it('advances updatedAt when the title changed', () => {
    vi.setSystemTime(new Date('2026-06-02T00:00:00.000Z'));
    saveDocument({ ...existing, title: 'Renamed' });

    expect(rawRecords()[0].updatedAt).toBe(AT('2026-06-02T00:00:00.000Z'));
  });

  it('keeps fields the caller did not send', () => {
    saveAllDocuments([{ ...existing, driveFileId: 'drive-1', isSample: true }]);
    saveDocument({ id: 'a', title: 'Original', content: 'body', updatedAt: existing.updatedAt });

    expect(rawRecords()[0].driveFileId).toBe('drive-1');
  });

  it('stops treating a seeded sample as sample data once it is really edited', () => {
    saveAllDocuments([{ ...existing, isSample: true }]);

    saveDocument({ ...existing, isSample: true });
    expect(rawRecords()[0].isSample).toBe(true);

    saveDocument({ ...existing, content: 'edited', isSample: true });
    expect(rawRecords()[0].isSample).toBeUndefined();
  });

  it('inserts an unknown document at the front, keeping the timestamp it came with', () => {
    const returned = saveDocument(doc({ id: 'b', updatedAt: AT('2025-01-01T00:00:00.000Z') }));

    expect(returned.map((d) => d.id)).toEqual(['b', 'a']);
    expect(rawRecords()[0].updatedAt).toBe(AT('2025-01-01T00:00:00.000Z'));
  });

  it('returns only live documents', () => {
    saveAllDocuments([existing, doc({ id: 'gone', deletedAt: AT('2026-05-31T00:00:00.000Z') })]);

    expect(saveDocument({ ...existing }).map((d) => d.id)).toEqual(['a']);
  });
});

describe('deleteDocument', () => {
  it('leaves a tombstone rather than dropping the row', () => {
    saveAllDocuments([doc({ id: 'a' }), doc({ id: 'b' })]);

    const live = deleteDocument('a');

    expect(live.map((d) => d.id)).toEqual(['b']);
    const records = rawRecords();
    expect(records).toHaveLength(2);
    const tombstone = records.find((record) => record.id === 'a')!;
    expect(tombstone.deletedAt).toBe(AT('2026-06-01T12:00:00.000Z'));
    expect(tombstone.updatedAt).toBe(AT('2026-06-01T12:00:00.000Z'));
    expect(tombstone.content).toBe('');
  });

  it('records a tombstone for a document this device never had', () => {
    saveAllDocuments([doc({ id: 'a' })]);

    deleteDocument('never-seen');

    expect(rawRecords().map((r) => r.id)).toEqual(['a', 'never-seen']);
    expect(loadAllDocuments().map((d) => d.id)).toEqual(['a']);
  });
});

describe('mergeDocuments', () => {
  it('takes the cloud copy when it is newer', () => {
    const local = [doc({ id: 'a', content: 'local', updatedAt: AT('2026-05-01T00:00:00.000Z') })];
    const cloud = [doc({ id: 'a', content: 'cloud', updatedAt: AT('2026-05-02T00:00:00.000Z') })];

    expect(mergeDocuments(local, cloud)[0].content).toBe('cloud');
  });

  it('keeps the local copy when it is newer', () => {
    const local = [doc({ id: 'a', content: 'local', updatedAt: AT('2026-05-03T00:00:00.000Z') })];
    const cloud = [doc({ id: 'a', content: 'cloud', updatedAt: AT('2026-05-02T00:00:00.000Z') })];

    expect(mergeDocuments(local, cloud)[0].content).toBe('local');
  });

  it('keeps a local document the cloud has never seen', () => {
    const local = [doc({ id: 'fresh', updatedAt: AT('2026-05-03T00:00:00.000Z') })];

    expect(mergeDocuments(local, []).map((d) => d.id)).toEqual(['fresh']);
  });

  it('adds a cloud document this device has never seen', () => {
    expect(mergeDocuments([], [doc({ id: 'remote' })]).map((d) => d.id)).toEqual(['remote']);
  });

  it('sorts the live list newest first', () => {
    const merged = mergeDocuments(
      [
        doc({ id: 'old', updatedAt: AT('2026-01-01T00:00:00.000Z') }),
        doc({ id: 'new', updatedAt: AT('2026-05-01T00:00:00.000Z') }),
      ],
      [doc({ id: 'middle', updatedAt: AT('2026-03-01T00:00:00.000Z') })]
    );

    expect(merged.map((d) => d.id)).toEqual(['new', 'middle', 'old']);
  });

  it('survives a merge with a local tombstone and keeps it off the live list', () => {
    const tombstone = doc({
      id: 'deleted-here',
      updatedAt: AT('2026-05-10T00:00:00.000Z'),
      deletedAt: AT('2026-05-10T00:00:00.000Z'),
    });
    // The other device still has the document and re-uploads it, older.
    const cloud = [doc({ id: 'deleted-here', updatedAt: AT('2026-05-09T00:00:00.000Z') })];

    const live = mergeDocuments([tombstone], cloud);

    expect(live).toEqual([]);
    expect(rawRecords().map((r) => r.id)).toEqual(['deleted-here']);
    expect(rawRecords()[0].deletedAt).toBe(AT('2026-05-10T00:00:00.000Z'));
  });

  it('lets a cloud tombstone delete a document this device still has', () => {
    const local = [doc({ id: 'a', updatedAt: AT('2026-05-19T00:00:00.000Z') })];
    const cloud = [
      doc({
        id: 'a',
        updatedAt: AT('2026-05-20T00:00:00.000Z'),
        deletedAt: AT('2026-05-20T00:00:00.000Z'),
      }),
    ];

    expect(mergeDocuments(local, cloud)).toEqual([]);
    expect(rawRecords()[0].deletedAt).toBe(AT('2026-05-20T00:00:00.000Z'));
  });

  it('prunes a tombstone older than the 30-day TTL', () => {
    const now = Date.now();
    const stale = doc({
      id: 'stale',
      updatedAt: new Date(now - 31 * DAY_MS).toISOString(),
      deletedAt: new Date(now - 31 * DAY_MS).toISOString(),
    });
    const recent = doc({
      id: 'recent',
      updatedAt: new Date(now - 29 * DAY_MS).toISOString(),
      deletedAt: new Date(now - 29 * DAY_MS).toISOString(),
    });

    mergeDocuments([stale, recent], []);

    expect(rawRecords().map((r) => r.id)).toEqual(['recent']);
  });

  it('drops records with no id', () => {
    mergeDocuments([doc({ id: 'a' }), { id: '' } as StoredDocument], []);

    expect(rawRecords().map((r) => r.id)).toEqual(['a']);
  });

  it('writes the merged set back, tombstones included', () => {
    const tombstone = doc({
      id: 'gone',
      updatedAt: AT('2026-05-10T00:00:00.000Z'),
      deletedAt: AT('2026-05-10T00:00:00.000Z'),
    });

    mergeDocuments([doc({ id: 'a', updatedAt: AT('2026-05-11T00:00:00.000Z') }), tombstone], []);

    expect(rawRecords().map((r) => r.id)).toEqual(['a', 'gone']);
    expect(loadAllDocuments().map((d) => d.id)).toEqual(['a']);
  });
});

describe('active document', () => {
  it('falls back to the first live document when none is set', () => {
    saveAllDocuments([doc({ id: 'gone', deletedAt: AT('2026-05-01T00:00:00.000Z') }), doc({ id: 'a' })]);

    expect(getActiveDocumentId()).toBe('a');
  });

  it('returns an empty id when there is nothing live', () => {
    saveAllDocuments([]);
    expect(getActiveDocumentId()).toBe('');
  });

  it('returns whatever was set', () => {
    setActiveDocumentId('chosen');
    expect(getActiveDocumentId()).toBe('chosen');
  });
});

describe('createNewDocument', () => {
  it('unshifts a uniquely-identified document and makes it active', () => {
    saveAllDocuments([doc({ id: 'a' })]);

    const created = createNewDocument('Notes', '# Notes');

    expect(rawRecords().map((r) => r.id)).toEqual([created.id, 'a']);
    expect(getActiveDocumentId()).toBe(created.id);
    expect(created.title).toBe('Notes');
    expect(created.updatedAt).toBe(AT('2026-06-01T12:00:00.000Z'));
    expect(created.isSample).toBeUndefined();
  });
});
