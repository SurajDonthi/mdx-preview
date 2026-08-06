import { SAMPLE_DOCUMENTS } from '../data/sampleMDX';

export interface StoredDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  driveFileId?: string | null;
  /** Seeded on first run and never pushed to the cloud until the user actually edits it. */
  isSample?: boolean;
  /** Tombstone marker. The record is kept so the deletion can win a sync merge. */
  deletedAt?: string | null;
}

const STORAGE_KEY = 'mdx_studio_documents_v1';
const ACTIVE_DOC_KEY = 'mdx_studio_active_doc_id';
const INSTALL_ID_KEY = 'mdx_studio_install_id';

// A tombstone only has to outlive the sync window of a device that was offline when the
// deletion happened; keeping them forever would grow localStorage without bound.
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isLive(doc: StoredDocument): boolean {
  return !doc.deletedAt;
}

function isRetainedRecord(doc: StoredDocument): boolean {
  if (!doc || !doc.id) return false;
  if (!doc.deletedAt) return true;
  const deletedTime = new Date(doc.deletedAt).getTime();
  return Number.isNaN(deletedTime) || Date.now() - deletedTime < TOMBSTONE_TTL_MS;
}

/**
 * Stable random id for this browser profile. Sample document ids are hard-coded, so
 * without this every install would generate the same ids and two accounts would collide
 * in shared cloud storage.
 */
function getInstallId(): string {
  let installId = localStorage.getItem(INSTALL_ID_KEY);
  if (!installId) {
    installId = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    localStorage.setItem(INSTALL_ID_KEY, installId);
  }
  return installId;
}

/**
 * Loads every stored record, tombstones included, or populates defaults.
 * Callers that render documents should use loadAllDocuments() instead.
 */
export function loadAllRecords(): StoredDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Initialize with sample documents
      const installId = getInstallId();
      const initialDocs: StoredDocument[] = SAMPLE_DOCUMENTS.map((sample) => ({
        id: `${sample.id}-${installId}`,
        title: sample.title,
        content: sample.content,
        updatedAt: new Date().toISOString(),
        isSample: true,
      }));
      saveAllDocuments(initialDocs);
      return initialDocs;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRetainedRecord) : [];
  } catch (e) {
    console.error('Failed to parse stored documents from localStorage:', e);
    return [];
  }
}

/**
 * Loads all visible saved documents from localStorage or populates defaults
 */
export function loadAllDocuments(): StoredDocument[] {
  return loadAllRecords().filter(isLive);
}

/**
 * Saves all documents to localStorage
 */
export function saveAllDocuments(docs: StoredDocument[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  } catch (e) {
    console.error('Failed to save documents to localStorage:', e);
  }
}

/**
 * Gets active document ID or defaults to first document
 */
export function getActiveDocumentId(): string {
  const storedId = localStorage.getItem(ACTIVE_DOC_KEY);
  if (storedId) return storedId;
  const firstDoc = loadAllDocuments()[0];
  return firstDoc ? firstDoc.id : '';
}

/**
 * Sets active document ID
 */
export function setActiveDocumentId(id: string): void {
  localStorage.setItem(ACTIVE_DOC_KEY, id);
}

/**
 * Intelligently merges local documents and cloud documents.
 * Returns the visible documents sorted by updatedAt descending.
 * Prevents newly created local documents from disappearing when Firestore snapshot updates.
 * Pass loadAllRecords() as localDocs so local tombstones survive the merge.
 */
export function mergeDocuments(localDocs: StoredDocument[], cloudDocs: StoredDocument[]): StoredDocument[] {
  const map = new Map<string, StoredDocument>();

  // Add all local documents first
  localDocs.forEach((doc) => {
    map.set(doc.id, doc);
  });

  // Merge cloud documents: if cloud version has newer timestamp or isn't in local, replace/add it
  cloudDocs.forEach((cloudDoc) => {
    const existing = map.get(cloudDoc.id);
    if (!existing) {
      map.set(cloudDoc.id, cloudDoc);
    } else {
      const localTime = new Date(existing.updatedAt).getTime();
      const cloudTime = new Date(cloudDoc.updatedAt).getTime();
      if (cloudTime >= localTime) {
        map.set(cloudDoc.id, cloudDoc);
      }
    }
  });

  const merged = Array.from(map.values()).filter(isRetainedRecord);
  merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  saveAllDocuments(merged);
  return merged.filter(isLive);
}

/**
 * Save or update a single document by ID
 */
export function saveDocument(doc: StoredDocument): StoredDocument[] {
  const docs = loadAllRecords();
  const index = docs.findIndex((d) => d.id === doc.id);

  if (index >= 0) {
    const existing = docs[index];
    const merged: StoredDocument = { ...existing, ...doc };
    const hasRealChange = merged.title !== existing.title || merged.content !== existing.content;

    // mergeDocuments() resolves cross-device conflicts by comparing updatedAt, so a save
    // that changed nothing (opening a document, signing in) must not bump the timestamp
    // and beat a newer edit made elsewhere.
    merged.updatedAt = hasRealChange ? new Date().toISOString() : existing.updatedAt;

    // Once the user edits a seeded sample it stops being sample data and starts syncing.
    if (hasRealChange && merged.isSample) delete merged.isSample;

    docs[index] = merged;
  } else {
    docs.unshift({ ...doc, updatedAt: doc.updatedAt || new Date().toISOString() });
  }

  saveAllDocuments(docs);
  return docs.filter(isLive);
}

/**
 * Delete a document by ID, leaving a tombstone behind so the deletion survives sync
 */
export function deleteDocument(id: string): StoredDocument[] {
  const docs = loadAllRecords();
  const now = new Date().toISOString();
  const tombstone: StoredDocument = {
    id,
    title: '',
    content: '',
    updatedAt: now,
    deletedAt: now,
  };

  const index = docs.findIndex((d) => d.id === id);
  if (index >= 0) {
    docs[index] = tombstone;
  } else {
    docs.push(tombstone);
  }

  saveAllDocuments(docs);
  return docs.filter(isLive);
}

/**
 * Create a brand new document
 */
export function createNewDocument(title: string = 'Untitled Document', content: string = '# New MDX Document\n\nStart typing here...'): StoredDocument {
  const newDoc: StoredDocument = {
    id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title,
    content,
    updatedAt: new Date().toISOString(),
  };

  const docs = loadAllRecords();
  docs.unshift(newDoc);
  saveAllDocuments(docs);
  setActiveDocumentId(newDoc.id);

  return newDoc;
}
