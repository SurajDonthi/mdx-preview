import { useState } from 'react';
import * as Icons from 'lucide-react';
import { User } from 'firebase/auth';
import { StoredDocument } from '../utils/storage';
import { SAMPLE_DOCUMENTS } from '../data/sampleMDX';

interface FileSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  documents: StoredDocument[];
  activeDocumentId: string;
  onSelectDocument: (doc: StoredDocument) => void;
  onCreateNewDocument: () => void;
  onDeleteDocument: (id: string) => void;
  onRenameDocument: (id: string, newTitle: string) => void;
  onSelectSampleDoc: (content: string, title?: string) => void;
  onOpenDriveModal: () => void;
  isDriveConnected: boolean;
  currentUser: User | null;
}

export function FileSidebar({
  isOpen,
  onToggle,
  documents,
  activeDocumentId,
  onSelectDocument,
  onCreateNewDocument,
  onDeleteDocument,
  onRenameDocument,
  onSelectSampleDoc,
  onOpenDriveModal,
  isDriveConnected,
  currentUser,
}: FileSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showPresets, setShowPresets] = useState(false);

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startRename = (doc: StoredDocument, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(doc.id);
    setEditingTitle(doc.title);
  };

  const saveRename = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingTitle.trim()) {
      onRenameDocument(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  if (!isOpen) return null;

  return (
    <aside className="w-72 h-full bg-slate-900 border-r border-slate-800 flex flex-col z-30 shrink-0 select-none animate-fade-in">
      {/* Top Header inside Sidebar */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-400">
          <Icons.FolderKanban className="w-4 h-4 text-indigo-400" />
          <span>Explorer ({documents.length})</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onCreateNewDocument}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1 text-xs font-semibold px-2 cursor-pointer"
            title="New Document"
          >
            <Icons.Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close Sidebar"
          >
            <Icons.PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter / Search Input */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-950/40">
        <div className="relative flex items-center">
          <Icons.Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter files..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {filteredDocs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No matching documents
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isActive = doc.id === activeDocumentId;
            const isEditing = editingId === doc.id;

            return (
              <div
                key={doc.id}
                onClick={() => onSelectDocument(doc)}
                className={`group relative flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/40 shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Icons.FileText
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-400'
                    }`}
                  />

                  {isEditing ? (
                    <form onSubmit={(e) => saveRename(doc.id, e)} className="flex-1 flex items-center gap-1">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="w-full px-1.5 py-0.5 bg-slate-950 border border-indigo-500 rounded text-xs text-white focus:outline-none"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        type="submit"
                        className="p-1 text-emerald-400 hover:text-emerald-300"
                      >
                        <Icons.Check className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{doc.title}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                        {doc.driveFileId && (
                          <span className="text-blue-400 font-mono flex items-center gap-0.5">
                            • Drive
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* File Action Controls */}
                {!isEditing && (
                  <div className="hidden group-hover:flex items-center gap-1 ml-1">
                    <button
                      onClick={(e) => startRename(doc, e)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/80"
                      title="Rename"
                    >
                      <Icons.Edit2 className="w-3 h-3" />
                    </button>
                    {documents.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDocument(doc.id);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/20"
                        title="Delete"
                      >
                        <Icons.Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Accordion for Presets / Templates */}
        <div className="pt-3 border-t border-slate-800/80 mt-2">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="w-full px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between hover:text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Icons.BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>Sample Presets</span>
            </span>
            <Icons.ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showPresets ? 'rotate-180' : ''}`}
            />
          </button>

          {showPresets && (
            <div className="mt-1 space-y-1 pl-1">
              {SAMPLE_DOCUMENTS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => onSelectSampleDoc(preset.content, preset.title)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center gap-2 truncate"
                >
                  <Icons.FileCode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{preset.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cloud Integration Footer Banner inside Sidebar */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
            <Icons.Cloud className="w-3.5 h-3.5 text-blue-400" />
            <span>Cloud Sync</span>
          </span>
          {currentUser && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Firestore Sync
            </span>
          )}
        </div>

        <button
          onClick={onOpenDriveModal}
          className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-medium transition-colors ${
            isDriveConnected
              ? 'bg-blue-950/40 border-blue-500/40 text-blue-300 hover:bg-blue-900/40'
              : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Icons.HardDrive className={`w-3.5 h-3.5 ${isDriveConnected ? 'text-blue-400' : 'text-slate-400'}`} />
            <span className="truncate">
              {currentUser ? currentUser.email : isDriveConnected ? 'Drive Active' : 'Connect Google Drive'}
            </span>
          </div>
          <Icons.ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        </button>
      </div>
    </aside>
  );
}
