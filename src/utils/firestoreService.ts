import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from './auth';
import { StoredDocument } from './storage';

const USERS_COLLECTION = 'users';
const DOCUMENTS_COLLECTION = 'documents';

// Documents used to live in a single flat top-level `documents` collection keyed by the
// document id. Sample documents ship with hard-coded ids, so two accounts resolved to the
// very same record. Everything now lives under users/{uid}/documents/{docId}.
const LEGACY_COLLECTION = 'documents';
const LEGACY_MIGRATION_KEY_PREFIX = 'mdx_studio_firestore_migrated_';

function userDocuments(userId: string) {
  return collection(db, USERS_COLLECTION, userId, DOCUMENTS_COLLECTION);
}

function toStoredDocument(data: Record<string, any>, fallbackId: string): StoredDocument {
  return {
    id: data.id || fallbackId,
    title: data.title || 'Untitled',
    content: data.content || '',
    updatedAt: data.updatedAt || new Date().toISOString(),
    driveFileId: data.driveFileId || null,
    deletedAt: data.deletedAt || null,
  };
}

/**
 * Saves or updates a document in Cloud Firestore for the logged-in user
 */
export async function saveDocumentToFirestore(userId: string, document: StoredDocument): Promise<void> {
  if (!userId || !document.id) return;

  try {
    const docRef = doc(userDocuments(userId), document.id);
    await setDoc(
      docRef,
      {
        id: document.id,
        userId: userId,
        title: document.title,
        content: document.content,
        updatedAt: document.updatedAt || new Date().toISOString(),
        driveFileId: document.driveFileId || null,
        deletedAt: document.deletedAt || null,
      },
      { merge: true }
    );
  } catch (err) {
    console.error('Error saving document to Firestore:', err);
  }
}

/**
 * Marks a document deleted in Firestore. Rejects so the caller can report the failure.
 */
export async function deleteDocumentFromFirestore(userId: string, documentId: string): Promise<void> {
  if (!userId || !documentId) return;

  // Write a tombstone rather than removing the record: another device that still holds
  // the document would otherwise re-upload it on its next auto-save, and the snapshot
  // would hand it straight back.
  const now = new Date().toISOString();
  await setDoc(doc(userDocuments(userId), documentId), {
    id: documentId,
    userId: userId,
    title: '',
    content: '',
    updatedAt: now,
    deletedAt: now,
    driveFileId: null,
  });
}

/**
 * Sets up a real-time snapshot listener for a user's cloud documents in Firestore.
 * Triggers callback with array of StoredDocument whenever Firestore changes.
 * `meta.fromCache` marks snapshots the server has not confirmed yet.
 */
export function subscribeToUserDocuments(
  userId: string,
  onDocsUpdated: (docs: StoredDocument[], meta: { fromCache: boolean }) => void
) {
  if (!userId) return () => {};

  return onSnapshot(
    userDocuments(userId),
    (snapshot) => {
      const docs: StoredDocument[] = snapshot.docs.map((d) => toStoredDocument(d.data(), d.id));

      // Sort by updatedAt descending
      docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      onDocsUpdated(docs, { fromCache: snapshot.metadata.fromCache });
    },
    (error) => {
      console.warn('Firestore subscription warning:', error);
    }
  );
}

/**
 * Copies documents this user still owns in the legacy flat collection into their own
 * subcollection. Runs once per account per browser and never clobbers a document that
 * already exists under the new path, so a half-finished run is safe to repeat.
 * The legacy records are intentionally left in place: another device may not have
 * migrated yet, and deleting them would be unrecoverable if this copy went wrong.
 */
export async function migrateLegacyDocuments(userId: string): Promise<void> {
  if (!userId) return;

  const flagKey = `${LEGACY_MIGRATION_KEY_PREFIX}${userId}`;
  if (localStorage.getItem(flagKey)) return;

  try {
    const legacyQuery = query(collection(db, LEGACY_COLLECTION), where('userId', '==', userId));
    const snapshot = await getDocs(legacyQuery);

    await Promise.all(
      snapshot.docs.map(async (legacyDoc) => {
        const legacy = toStoredDocument(legacyDoc.data(), legacyDoc.id);
        const targetRef = doc(userDocuments(userId), legacy.id);
        const existing = await getDoc(targetRef);
        if (existing.exists()) return;

        await setDoc(targetRef, {
          id: legacy.id,
          userId: userId,
          title: legacy.title,
          content: legacy.content,
          updatedAt: legacy.updatedAt,
          driveFileId: legacy.driveFileId,
          deletedAt: legacy.deletedAt,
        });
      })
    );

    localStorage.setItem(flagKey, new Date().toISOString());
  } catch (err) {
    // Not fatal: the app still works against the new path, migration retries next launch.
    console.warn('Legacy Firestore document migration skipped:', err);
  }
}
