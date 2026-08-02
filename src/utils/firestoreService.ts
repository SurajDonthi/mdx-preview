import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from './auth';
import { StoredDocument } from './storage';

/**
 * Saves or updates a document in Cloud Firestore for the logged-in user
 */
export async function saveDocumentToFirestore(userId: string, document: StoredDocument): Promise<void> {
  if (!userId || !document.id) return;

  try {
    const docRef = doc(db, 'documents', document.id);
    await setDoc(
      docRef,
      {
        id: document.id,
        userId: userId,
        title: document.title,
        content: document.content,
        updatedAt: document.updatedAt || new Date().toISOString(),
        driveFileId: document.driveFileId || null,
      },
      { merge: true }
    );
  } catch (err) {
    console.error('Error saving document to Firestore:', err);
  }
}

/**
 * Deletes a document from Firestore
 */
export async function deleteDocumentFromFirestore(userId: string, documentId: string): Promise<void> {
  if (!userId || !documentId) return;

  try {
    const docRef = doc(db, 'documents', documentId);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Error deleting document from Firestore:', err);
  }
}

/**
 * Sets up a real-time snapshot listener for a user's cloud documents in Firestore.
 * Triggers callback with array of StoredDocument whenever Firestore changes.
 */
export function subscribeToUserDocuments(
  userId: string,
  onDocsUpdated: (docs: StoredDocument[]) => void
) {
  if (!userId) return () => {};

  const q = query(collection(db, 'documents'), where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const docs: StoredDocument[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          title: data.title || 'Untitled',
          content: data.content || '',
          updatedAt: data.updatedAt || new Date().toISOString(),
          driveFileId: data.driveFileId || null,
        };
      });

      // Sort by updatedAt descending
      docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      onDocsUpdated(docs);
    },
    (error) => {
      console.warn('Firestore subscription warning:', error);
    }
  );
}
