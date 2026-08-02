import { SAMPLE_DOCUMENTS } from '../data/sampleMDX';

export interface StoredDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  driveFileId?: string | null;
  lastSyncedToDriveAt?: string | null;
}

const STORAGE_KEY = 'mdx_studio_documents_v1';
const ACTIVE_DOC_KEY = 'mdx_studio_active_doc_id';

/**
 * Loads all saved documents from localStorage or populates defaults
 */
export function loadAllDocuments(): StoredDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Initialize with sample documents
      const initialDocs: StoredDocument[] = SAMPLE_DOCUMENTS.map((sample) => ({
        id: sample.id,
        title: sample.title,
        content: sample.content,
        updatedAt: new Date().toISOString(),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialDocs));
      return initialDocs;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [];
  } catch (e) {
    console.error('Failed to parse stored documents from localStorage:', e);
    return [];
  }
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
  return localStorage.getItem(ACTIVE_DOC_KEY) || SAMPLE_DOCUMENTS[0].id;
}

/**
 * Sets active document ID
 */
export function setActiveDocumentId(id: string): void {
  localStorage.setItem(ACTIVE_DOC_KEY, id);
}

/**
 * Save or update a single document by ID
 */
export function saveDocument(doc: StoredDocument): StoredDocument[] {
  const docs = loadAllDocuments();
  const index = docs.findIndex((d) => d.id === doc.id);

  if (index >= 0) {
    docs[index] = { ...docs[index], ...doc, updatedAt: new Date().toISOString() };
  } else {
    docs.unshift({ ...doc, updatedAt: new Date().toISOString() });
  }

  saveAllDocuments(docs);
  return docs;
}

/**
 * Delete a document by ID
 */
export function deleteDocument(id: string): StoredDocument[] {
  const docs = loadAllDocuments().filter((d) => d.id !== id);
  saveAllDocuments(docs);
  return docs;
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

  const docs = loadAllDocuments();
  docs.unshift(newDoc);
  saveAllDocuments(docs);
  setActiveDocumentId(newDoc.id);

  return newDoc;
}
