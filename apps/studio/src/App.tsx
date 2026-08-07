import { useState, useMemo, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { ViewMode, ThemeId } from './types';
import { extractHeadings, calculateDocumentStats } from '@mdxkit/core';
import { MdxRenderer, THEMES } from '@mdxkit/react';
import { studioMdxRegistry } from './mdxRegistry';
import {
  loadAllDocuments,
  loadAllRecords,
  saveDocument,
  getActiveDocumentId,
  setActiveDocumentId,
  deleteDocument,
  createNewDocument,
  mergeDocuments,
  StoredDocument,
} from './utils/storage';
import { initAuth, getAccessToken } from './utils/auth';
import { saveFileToDrive, trashDriveFile } from './utils/driveService';
import {
  subscribeToUserDocuments,
  saveDocumentToFirestore,
  deleteDocumentFromFirestore,
  migrateLegacyDocuments,
} from './utils/firestoreService';
import { showToast } from './utils/toast';

import { Navbar } from './components/Navbar';
import { FileSidebar } from './components/FileSidebar';
import { MdxEditor } from './components/MdxEditor';
import { TableOfContents } from './components/TableOfContents';
import { FileUploadModal } from './components/FileUploadModal';
import { ExportModal } from './components/ExportModal';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { ToastContainer } from './components/ToastContainer';

/**
 * Identity of the editor state that was last written to storage. Auto-save compares
 * against it so that opening a document or signing in cannot masquerade as an edit.
 */
function docSignature(
  id: string,
  title: string,
  content: string,
  driveFileId?: string | null
): string {
  return JSON.stringify([id, title, content, driveFileId || null]);
}

/** The same identity, computed from a stored record instead of from editor state. */
function recordSignature(doc: StoredDocument): string {
  return docSignature(doc.id, doc.title, doc.content, doc.driveFileId);
}

export default function App() {
  const exportRootRef = useRef<HTMLDivElement | null>(null);

  // Sidebar visibility state (minimized by default)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Persistence State
  const [documents, setDocuments] = useState<StoredDocument[]>(() => loadAllDocuments());
  const [activeDocId, setActiveDocId] = useState<string>(() => getActiveDocumentId());

  // Firebase User state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Current active document data
  const currentDoc = useMemo(() => {
    return (
      documents.find((d) => d.id === activeDocId) ||
      documents[0] || {
        id: 'default-1',
        title: 'MDX Showcase',
        content: '# Welcome to MDX Studio\n\nStart typing...',
        updatedAt: new Date().toISOString(),
      }
    );
  }, [documents, activeDocId]);

  const [mdxContent, setMdxContent] = useState<string>(currentDoc.content);
  const [documentTitle, setDocumentTitle] = useState<string>(currentDoc.title);
  const [currentDriveFileId, setCurrentDriveFileId] = useState<string | null>(
    currentDoc.driveFileId || null
  );

  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>('frosted-glass');
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  // Modal States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);

  // Google Auth Connection Status
  const [isDriveConnected, setIsDriveConnected] = useState(false);

  // State already persisted, so a no-op save never bumps updatedAt (see docSignature)
  const lastSavedRef = useRef<string>(recordSignature(currentDoc));

  // Which document the editor buffer currently holds. Separates "the user opened another
  // document" from "the open document was replaced underneath us by a sync merge".
  const loadedDocIdRef = useRef<string>(currentDoc.id);

  // Incoming version already reported as not applied, so one remote edit warns once
  // instead of once per snapshot for as long as the user keeps typing.
  const remoteConflictRef = useRef<string | null>(null);

  // Documents deleted from this device: their disappearance is expected and must not be
  // reported as a deletion made somewhere else.
  const locallyDeletedRef = useRef<Set<string>>(new Set());

  const applyRecordToEditor = (doc: StoredDocument) => {
    setMdxContent(doc.content);
    setDocumentTitle(doc.title);
    setCurrentDriveFileId(doc.driveFileId || null);

    // The buffer now mirrors a record that is already in storage. Anything else would let
    // the auto-save below stamp a fresh updatedAt on it and beat the copy it just took.
    lastSavedRef.current = recordSignature(doc);
    loadedDocIdRef.current = doc.id;
  };

  // Keep the editor in step with the active record. This runs both when the user switches
  // documents and when a Firestore snapshot merges a newer version of the document that is
  // already open, so the guards below decide which of the two happened.
  useEffect(() => {
    // Keep the selection pointing at a document that actually exists, otherwise the
    // dirty check below compares against the wrong record.
    if (currentDoc.id !== activeDocId) setActiveDocId(currentDoc.id);
    setActiveDocumentId(currentDoc.id);

    const previousDocId = loadedDocIdRef.current;

    if (previousDocId !== currentDoc.id) {
      // A different document is in play. Either the user picked it, or the one they had
      // open stopped being visible, which only a tombstone from another device can do
      // once local deletions are excluded.
      const previousTitle = documentTitle;
      const previousWasDirty =
        docSignature(previousDocId, documentTitle, mdxContent, currentDriveFileId) !==
        lastSavedRef.current;
      const vanishedRemotely =
        previousDocId === activeDocId &&
        !locallyDeletedRef.current.has(previousDocId) &&
        !documents.some((d) => d.id === previousDocId);

      applyRecordToEditor(currentDoc);
      remoteConflictRef.current = null;

      if (vanishedRemotely) {
        showToast(
          'Document deleted on another device',
          previousWasDirty
            ? `"${previousTitle}" was deleted elsewhere, so its unsaved changes could not be kept. Opened "${currentDoc.title}".`
            : `"${previousTitle}" was deleted elsewhere. Opened "${currentDoc.title}".`,
          'info'
        );
      }
      return;
    }

    // Same document, but its stored record changed. Compare against the buffer using the
    // record's own id: activeDocId can still be catching up on the very first render.
    const bufferSignature = docSignature(
      currentDoc.id,
      documentTitle,
      mdxContent,
      currentDriveFileId
    );
    const incomingSignature = recordSignature(currentDoc);

    if (bufferSignature === incomingSignature) {
      // This device's own save echoing back through Firestore, or a snapshot that only
      // touched other documents. Nothing is written to the buffer, so the textarea never
      // re-renders and the caret and scroll position are left exactly where they were.
      lastSavedRef.current = incomingSignature;
      remoteConflictRef.current = null;
      return;
    }

    if (bufferSignature === lastSavedRef.current) {
      // The buffer holds exactly what was last persisted, so there is no work in progress
      // to destroy: adopt the newer version the merge accepted.
      applyRecordToEditor(currentDoc);
      remoteConflictRef.current = null;
      return;
    }

    // Unsaved edits are sitting in the buffer. Overwriting them would delete text the user
    // is still typing, which is worse than the stale view this fix set out to close, so the
    // local copy is kept and the pending auto-save will stamp a newer updatedAt and win the
    // next merge. Say so once per incoming version rather than once per snapshot.
    const conflictKey = `${currentDoc.id}@${currentDoc.updatedAt}`;
    if (remoteConflictRef.current !== conflictKey) {
      remoteConflictRef.current = conflictKey;
      showToast(
        'Newer version arrived while you were editing',
        `"${currentDoc.title}" was also changed on another device. Your unsaved changes were kept and will replace it on the next save.`,
        'info'
      );
    }
  }, [
    currentDoc.id,
    currentDoc.updatedAt,
    currentDoc.title,
    currentDoc.content,
    currentDoc.driveFileId,
  ]);

  // Firebase Auth & Firestore Subscription Listener
  useEffect(() => {
    const unsubscribeAuth = initAuth(
      (user, token) => {
        setCurrentUser(user);
        // Firebase auth can be restored from local persistence without a Drive token;
        // only a usable token means Drive is actually connected.
        setIsDriveConnected(Boolean(token));
      },
      () => {
        setCurrentUser(null);
        setIsDriveConnected(false);
      }
    );

    return () => unsubscribeAuth();
  }, []);

  /**
   * Folds an incoming Firestore snapshot into local state. The merge decides per document
   * whether the cloud copy wins on updatedAt; the effect above then decides whether the
   * winning copy is safe to push into the editor.
   */
  const handleCloudSnapshot = (cloudDocs: StoredDocument[], meta: { fromCache: boolean }) => {
    const merged = mergeDocuments(loadAllRecords(), cloudDocs);
    setDocuments(merged);

    // Never upload from a cache-only snapshot: an empty local cache looks exactly
    // like an empty account and would re-push documents deleted on another device.
    if (meta.fromCache || !currentUser) return;

    const cloudIds = new Set(cloudDocs.map((d) => d.id));
    merged
      .filter((d) => !d.isSample && !cloudIds.has(d.id))
      .forEach((d) => saveDocumentToFirestore(currentUser.uid, d));
  };

  // Listen to Firestore documents when logged in
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    let unsubscribeFirestore = () => {};

    // Migrate before subscribing so the merge below sees the user's existing cloud data
    // instead of treating the account as empty.
    migrateLegacyDocuments(currentUser.uid).finally(() => {
      if (cancelled) return;
      unsubscribeFirestore = subscribeToUserDocuments(currentUser.uid, handleCloudSnapshot);
    });

    return () => {
      cancelled = true;
      unsubscribeFirestore();
    };
  }, [currentUser]);

  // Debounced Auto-save to LocalStorage, Firestore & Google Drive
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const driveErrorRef = useRef<string | null>(null);

  const executeSave = async () => {
    const updatedDoc: StoredDocument = {
      id: activeDocId,
      title: documentTitle,
      content: mdxContent,
      updatedAt: new Date().toISOString(),
      driveFileId: currentDriveFileId,
    };

    // 1. Save to localStorage
    const updatedDocs = saveDocument(updatedDoc);
    setDocuments(updatedDocs);
    lastSavedRef.current = docSignature(activeDocId, documentTitle, mdxContent, currentDriveFileId);

    // saveDocument() keeps the previous updatedAt when nothing really changed, so mirror
    // the stored record to the cloud rather than the optimistic object built above.
    const storedDoc = updatedDocs.find((d) => d.id === activeDocId) || updatedDoc;

    // 2. Save to Cloud Firestore if logged in. Untouched seed samples stay local.
    if (currentUser && !storedDoc.isSample) {
      saveDocumentToFirestore(currentUser.uid, storedDoc);
    }

    // 3. Auto-save to Google Drive if linked and token exists
    const token = getAccessToken();
    if (currentDriveFileId && token) {
      try {
        await saveFileToDrive(token, documentTitle, mdxContent, currentDriveFileId);
        driveErrorRef.current = null;
      } catch (err: any) {
        const message: string = err?.message || String(err);
        const isExpired = message.includes('TOKEN_EXPIRED');

        // Auto-save repeats every few keystrokes; report each distinct failure once.
        if (driveErrorRef.current !== message) {
          driveErrorRef.current = message;
          showToast(
            isExpired ? 'Google Drive session expired' : 'Google Drive sync failed',
            isExpired
              ? 'This document is saved locally. Reconnect Google Drive to resume syncing it.'
              : `This document is saved locally. ${message}`,
            'error'
          );
        }

        if (isExpired) setIsDriveConnected(false);
      }
    }

    setIsSaving(false);
  };

  useEffect(() => {
    const signature = docSignature(activeDocId, documentTitle, mdxContent, currentDriveFileId);
    const isStored = documents.some((d) => d.id === activeDocId);

    // Document switches and sign-ins re-run this effect; saving then would advance
    // updatedAt and let a stale copy win the next sync merge.
    if (signature === lastSavedRef.current && isStored) {
      setIsSaving(false);
      return;
    }

    setIsSaving(true);
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    autoSaveTimeoutRef.current = setTimeout(() => {
      executeSave();
    }, 400);

    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [mdxContent, documentTitle, activeDocId, currentDriveFileId, currentUser, documents]);

  // Active theme configuration
  const themeConfig = THEMES[currentThemeId] || THEMES['github-dark'];

  // Extract document headings for TOC
  const headings = useMemo(() => extractHeadings(mdxContent), [mdxContent]);

  // Calculate live document statistics
  const stats = useMemo(() => calculateDocumentStats(mdxContent), [mdxContent]);

  // Handle header jump click
  const handleSelectHeader = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Handle switching to a sample or uploaded document
  const handleSelectSampleDoc = (content: string, title?: string) => {
    const newDoc = createNewDocument(title || 'Sample MDX', content);
    setDocuments(loadAllDocuments());
    setActiveDocId(newDoc.id);

    if (currentUser) {
      saveDocumentToFirestore(currentUser.uid, newDoc);
    }
  };

  // Select document from Sidebar
  const handleSelectDocument = (doc: StoredDocument) => {
    setActiveDocId(doc.id);
  };

  // Create new document
  const handleCreateNewDocument = () => {
    const newDoc = createNewDocument('Untitled MDX Document', '# New MDX Document\n\nStart writing here...');
    setDocuments(loadAllDocuments());
    setActiveDocId(newDoc.id);

    if (currentUser) {
      saveDocumentToFirestore(currentUser.uid, newDoc);
    }
  };

  // Delete document
  const handleDeleteDocument = (id: string) => {
    const target = documents.find((d) => d.id === id);

    // Remember it so the sync effect does not mistake this for a deletion that arrived
    // from another device and warn the user about their own click.
    locallyDeletedRef.current.add(id);

    const updatedDocs = deleteDocument(id);
    setDocuments(updatedDocs);

    if (currentUser) {
      deleteDocumentFromFirestore(currentUser.uid, id).catch((err: any) => {
        showToast(
          'Delete did not reach the cloud',
          `"${target?.title || 'Document'}" may come back on your next sync. ${err?.message || ''}`.trim(),
          'error'
        );
      });
    }

    // The Drive file belongs to the user, not to this app, so removing it is opt-in.
    const token = getAccessToken();
    if (target?.driveFileId && token) {
      const shouldTrashDriveFile = window.confirm(
        `Also move the linked Google Drive file for "${target.title}" to the trash?\n\nCancel keeps the file in your Google Drive.`
      );
      if (shouldTrashDriveFile) {
        trashDriveFile(token, target.driveFileId)
          .then(() => showToast('Moved to Google Drive trash', target.title, 'success'))
          .catch((err: any) =>
            showToast('Could not trash the Google Drive file', err?.message || String(err), 'error')
          );
      }
    }

    if (activeDocId === id && updatedDocs.length > 0) {
      setActiveDocId(updatedDocs[0].id);
    }
  };

  // Rename document
  const handleRenameDocument = (id: string, newTitle: string) => {
    if (id === activeDocId) {
      setDocumentTitle(newTitle);
    } else {
      const targetDoc = documents.find((d) => d.id === id);
      if (targetDoc) {
        const updatedDoc = { ...targetDoc, title: newTitle, updatedAt: new Date().toISOString() };
        const updatedDocs = saveDocument(updatedDoc);
        setDocuments(updatedDocs);

        if (currentUser) {
          saveDocumentToFirestore(currentUser.uid, updatedDocs.find((d) => d.id === id) || updatedDoc);
        }
      }
    }
  };

  // Handle document loaded from Google Drive
  const handleLoadFromDrive = (content: string, title: string, driveFileId: string) => {
    // Check if doc already exists for this driveFileId
    const existing = documents.find((d) => d.driveFileId === driveFileId);
    if (existing) {
      const updated = {
        ...existing,
        title,
        content,
        updatedAt: new Date().toISOString(),
      };
      const updatedDocs = saveDocument(updated);
      setDocuments(updatedDocs);
      setActiveDocId(existing.id);
      setCurrentDriveFileId(driveFileId);
      if (currentUser) saveDocumentToFirestore(currentUser.uid, updated);
    } else {
      const newDoc = createNewDocument(title, content);
      newDoc.driveFileId = driveFileId;
      const updatedDocs = saveDocument(newDoc);
      setDocuments(updatedDocs);
      setActiveDocId(newDoc.id);
      setCurrentDriveFileId(driveFileId);
      if (currentUser) saveDocumentToFirestore(currentUser.uid, newDoc);
    }
  };

  // Handle document saved to Google Drive
  const handleSavedToDrive = (driveFileId: string, title: string) => {
    setCurrentDriveFileId(driveFileId);
    setDocumentTitle(title);
    const updatedDoc: StoredDocument = {
      id: activeDocId,
      title,
      content: mdxContent,
      updatedAt: new Date().toISOString(),
      driveFileId,
    };
    const updatedDocs = saveDocument(updatedDoc);
    setDocuments(updatedDocs);

    if (currentUser) {
      saveDocumentToFirestore(currentUser.uid, updatedDoc);
    }
  };

  return (
    <>
    <div className="app-shell flex min-h-0 min-w-0 flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Application Navbar */}
      <Navbar
        sidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        currentDocumentTitle={documentTitle}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentThemeId={currentThemeId}
        onThemeChange={setCurrentThemeId}
        stats={stats}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenMobileToc={() => setIsMobileTocOpen(true)}
      />

      {/* Main Container Area */}
      <main className="flex-1 min-h-0 min-w-0 flex overflow-hidden relative">
        {/* Left File Explorer Sidebar */}
        <FileSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(false)}
          documents={documents}
          activeDocumentId={activeDocId}
          onSelectDocument={handleSelectDocument}
          onCreateNewDocument={handleCreateNewDocument}
          onDeleteDocument={handleDeleteDocument}
          onRenameDocument={handleRenameDocument}
          onSelectSampleDoc={handleSelectSampleDoc}
          onOpenDriveModal={() => setIsDriveModalOpen(true)}
          isDriveConnected={isDriveConnected}
          currentUser={currentUser}
        />

        {/* Editor View */}
        {(viewMode === 'editor' || viewMode === 'split') && (
          <div
            className={`h-full min-h-0 min-w-0 ${
              viewMode === 'split' ? 'w-full md:w-1/2 lg:w-[45%]' : 'w-full'
            }`}
          >
            <MdxEditor
              value={mdxContent}
              onChange={setMdxContent}
              isSaving={isSaving}
              onManualSave={executeSave}
            />
          </div>
        )}

        {/* Live Preview & TOC Canvas Area */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            className={`h-full min-h-0 min-w-0 flex flex-1 overflow-hidden ${
              viewMode === 'split' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Scrollable Preview Container */}
            <div className="flex-1 min-h-0 min-w-0 h-full overflow-y-auto custom-scrollbar preview-container">
              <MdxRenderer
                content={mdxContent}
                themeConfig={themeConfig}
                showFrontmatterHeader={true}
                containerId="mdx-live-preview"
                registry={studioMdxRegistry}
              />
            </div>

            {/* Desktop Table of Contents Sidebar */}
            <TableOfContents
              headings={headings}
              onSelectHeader={handleSelectHeader}
            />
          </div>
        )}
      </main>

      {/* Mobile Slide-over Drawer for Table of Contents */}
      <TableOfContents
        headings={headings}
        onSelectHeader={handleSelectHeader}
        variant="drawer"
        isOpenMobile={isMobileTocOpen}
        onCloseMobile={() => setIsMobileTocOpen(false)}
      />

      {/* Google Drive Persistence Modal */}
      <GoogleDriveModal
        isOpen={isDriveModalOpen}
        onClose={() => {
          setIsDriveModalOpen(false);
          // Sign-in and sign-out happen inside this modal, so re-read the token it left behind.
          setIsDriveConnected(Boolean(getAccessToken()));
        }}
        currentDocumentTitle={documentTitle}
        currentMdxContent={mdxContent}
        currentDriveFileId={currentDriveFileId}
        onLoadFromDrive={handleLoadFromDrive}
        onSavedToDrive={handleSavedToDrive}
      />

      {/* File Upload Modal */}
      <FileUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSelectDoc={(content, title) => handleSelectSampleDoc(content, title)}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        mdxContent={mdxContent}
        documentTitle={documentTitle}
        exportRootRef={exportRootRef}
      />

      {/* Global Floating Toast Notifications */}
      <ToastContainer />
    </div>
    {isExportOpen && (
      <div ref={exportRootRef} className="pdf-export-root" aria-hidden="true">
        <MdxRenderer
          content={mdxContent}
          themeConfig={themeConfig}
          showFrontmatterHeader={true}
          containerId="mdx-export-preview"
          renderMode="pdf"
          registry={studioMdxRegistry}
        />
      </div>
    )}
    </>
  );
}
