import { useState } from 'react';
import * as Icons from 'lucide-react';
import { StoredDocument } from '../utils/storage';

interface DocumentManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: StoredDocument[];
  activeDocumentId: string;
  onSelectDocument: (doc: StoredDocument) => void;
  onCreateNewDocument: () => void;
  onDeleteDocument: (id: string) => void;
  onRenameDocument: (id: string, newTitle: string) => void;
}

export function DocumentManagerModal({
  isOpen,
  onClose,
  documents,
  activeDocumentId,
  onSelectDocument,
  onCreateNewDocument,
  onDeleteDocument,
  onRenameDocument,
}: DocumentManagerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  if (!isOpen) return null;

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startRename = (doc: StoredDocument) => {
    setEditingId(doc.id);
    setEditingTitle(doc.title);
  };

  const saveRename = (id: string) => {
    if (editingTitle.trim()) {
      onRenameDocument(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Icons.FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight flex items-center gap-2">
                <span>Persistent Document Manager</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {documents.length} Saved
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                All created and imported MDX documents are saved persistently
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onCreateNewDocument();
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              <Icons.Plus className="w-3.5 h-3.5" />
              <span>New Doc</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <Icons.X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-5 py-3 bg-slate-950/40 border-b border-slate-800">
          <div className="relative flex items-center">
            <Icons.Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved documents by title or keyword..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Document List */}
        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-2.5">
          {filteredDocuments.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-2">
              <Icons.FileQuestion className="w-8 h-8 mx-auto text-slate-600" />
              <p>No documents found matching your search.</p>
            </div>
          ) : (
            filteredDocuments.map((doc) => {
              const isActive = doc.id === activeDocumentId;
              const isEditing = editingId === doc.id;

              return (
                <div
                  key={doc.id}
                  className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    isActive
                      ? 'bg-indigo-950/40 border-indigo-500/60 shadow-lg'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`p-2 rounded-lg ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Icons.FileText className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveRename(doc.id)}
                            className="px-2 py-1 rounded bg-slate-900 border border-indigo-500 text-xs text-white font-medium focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => saveRename(doc.id)}
                            className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                          >
                            <Icons.Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h4
                            onClick={() => {
                              onSelectDocument(doc);
                              onClose();
                            }}
                            className="font-semibold text-xs text-slate-100 hover:text-indigo-400 cursor-pointer truncate"
                          >
                            {doc.title}
                          </h4>
                          {isActive && (
                            <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                              Active
                            </span>
                          )}
                          {doc.driveFileId && (
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center gap-1"
                              title="Synced to Google Drive"
                            >
                              <Icons.Cloud className="w-3 h-3 text-blue-400" />
                              <span>Drive</span>
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                        <span>Updated: {new Date(doc.updatedAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{doc.content.length} chars</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {!isEditing && (
                      <button
                        onClick={() => startRename(doc)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        title="Rename document"
                      >
                        <Icons.Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {!isActive && (
                      <button
                        onClick={() => {
                          onSelectDocument(doc);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        Open
                      </button>
                    )}

                    {documents.length > 1 && (
                      <button
                        onClick={() => onDeleteDocument(doc.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete document"
                      >
                        <Icons.Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
