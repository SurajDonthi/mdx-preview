import { useState, useMemo, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { ViewMode, ThemeId } from './types';
import { THEMES } from './data/themes';
import { extractHeadings, calculateDocumentStats } from './utils/mdxParser';
import {
  loadAllDocuments,
  saveDocument,
  getActiveDocumentId,
  setActiveDocumentId,
  deleteDocument,
  createNewDocument,
  mergeDocuments,
  StoredDocument,
} from './utils/storage';
import { initAuth, getAccessToken } from './utils/auth';
import { saveFileToDrive } from './utils/driveService';
import {
  subscribeToUserDocuments,
  saveDocumentToFirestore,
  deleteDocumentFromFirestore,
} from './utils/firestoreService';

import { Navbar } from './components/Navbar';
import { FileSidebar } from './components/FileSidebar';
import { MdxEditor } from './components/MdxEditor';
import { MdxRenderer } from './components/MdxRenderer';
import { TableOfContents } from './components/TableOfContents';
import { FileUploadModal } from './components/FileUploadModal';
import { ExportModal } from './components/ExportModal';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { ToastContainer } from './components/ToastContainer';

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

  // Sync local state when active document changes
  useEffect(() => {
    setMdxContent(currentDoc.content);
    setDocumentTitle(currentDoc.title);
    setCurrentDriveFileId(currentDoc.driveFileId || null);
    setActiveDocumentId(currentDoc.id);
  }, [currentDoc.id]);

  // Firebase Auth & Firestore Subscription Listener
  useEffect(() => {
    const unsubscribeAuth = initAuth(
      (user) => {
        setCurrentUser(user);
        setIsDriveConnected(true);
      },
      () => {
        setCurrentUser(null);
        setIsDriveConnected(false);
      }
    );

    return () => unsubscribeAuth();
  }, []);

  // Listen to Firestore documents when logged in
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribeFirestore = subscribeToUserDocuments(currentUser.uid, (cloudDocs) => {
      const localDocs = loadAllDocuments();
      const merged = mergeDocuments(localDocs, cloudDocs);
      setDocuments(merged);

      if (cloudDocs.length === 0 && localDocs.length > 0) {
        localDocs.forEach((d) => saveDocumentToFirestore(currentUser.uid, d));
      }
    });

    return () => unsubscribeFirestore();
  }, [currentUser]);

  // Debounced Auto-save to LocalStorage, Firestore & Google Drive
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    // 2. Save to Cloud Firestore if logged in
    if (currentUser) {
      saveDocumentToFirestore(currentUser.uid, updatedDoc);
    }

    // 3. Auto-save to Google Drive if linked and token exists
    const token = getAccessToken();
    if (currentDriveFileId && token) {
      try {
        await saveFileToDrive(token, documentTitle, mdxContent, currentDriveFileId);
      } catch (err: any) {
        console.warn('Auto-save to Google Drive failed:', err?.message || err);
      }
    }

    setIsSaving(false);
  };

  useEffect(() => {
    setIsSaving(true);
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    autoSaveTimeoutRef.current = setTimeout(() => {
      executeSave();
    }, 400);

    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [mdxContent, documentTitle, activeDocId, currentDriveFileId, currentUser]);

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
    const updatedDocs = deleteDocument(id);
    setDocuments(updatedDocs);

    if (currentUser) {
      deleteDocumentFromFirestore(currentUser.uid, id);
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
          saveDocumentToFirestore(currentUser.uid, updatedDoc);
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
        onClose={() => setIsDriveModalOpen(false)}
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
        />
      </div>
    )}
    </>
  );
}
