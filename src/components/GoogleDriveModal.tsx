import { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { User } from 'firebase/auth';
import { googleSignIn, logoutGoogle, initAuth, getAccessToken } from '../utils/auth';
import { listDriveFiles, downloadDriveFile, saveFileToDrive, DriveFile } from '../utils/driveService';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDocumentTitle: string;
  currentMdxContent: string;
  currentDriveFileId?: string | null;
  onLoadFromDrive: (content: string, title: string, driveFileId: string) => void;
  onSavedToDrive: (driveFileId: string, title: string) => void;
}

export function GoogleDriveModal({
  isOpen,
  onClose,
  currentDocumentTitle,
  currentMdxContent,
  currentDriveFileId,
  onLoadFromDrive,
  onSavedToDrive,
}: GoogleDriveModalProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [activeTab, setActiveTab] = useState<'save' | 'load'>('save');
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);

  const [customFileName, setCustomFileName] = useState(currentDocumentTitle);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setCustomFileName(currentDocumentTitle);
  }, [currentDocumentTitle]);

  useEffect(() => {
    if (!isOpen) return;

    setIsAuthLoading(true);
    const unsubscribe = initAuth(
      (authUser, authToken) => {
        setUser(authUser);
        setToken(authToken);
        setIsAuthLoading(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setIsAuthLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen]);

  // Fetch Drive Files when tab switches to 'load' or when user connects
  useEffect(() => {
    if (isOpen && token && activeTab === 'load') {
      fetchDriveFiles();
    }
  }, [isOpen, token, activeTab]);

  const fetchDriveFiles = async () => {
    if (!token) return;
    setIsLoadingFiles(true);
    setStatusMessage(null);
    try {
      const files = await listDriveFiles(token);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Error fetching Drive files:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to list Google Drive files' });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setStatusMessage(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setStatusMessage({ type: 'success', text: `Connected as ${result.user.email}` });
      }
    } catch (err: any) {
      console.error('Sign-In failure:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Google authentication failed' });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await logoutGoogle();
    setUser(null);
    setToken(null);
    setDriveFiles([]);
    setStatusMessage({ type: 'success', text: 'Disconnected from Google Drive' });
  };

  const handleSaveToDrive = async () => {
    const currentToken = token || getAccessToken();
    if (!currentToken) {
      setStatusMessage({ type: 'error', text: 'Please sign in with Google Drive first.' });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const savedFile = await saveFileToDrive(
        currentToken,
        customFileName,
        currentMdxContent,
        currentDriveFileId
      );

      onSavedToDrive(savedFile.id, customFileName);
      setStatusMessage({
        type: 'success',
        text: `Successfully saved "${savedFile.name}" to Google Drive!`,
      });
    } catch (err: any) {
      console.error('Save to Drive error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save document to Google Drive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadFile = async (file: DriveFile) => {
    const currentToken = token || getAccessToken();
    if (!currentToken) return;

    setLoadingFileId(file.id);
    setStatusMessage(null);

    try {
      const content = await downloadDriveFile(currentToken, file.id);
      const title = file.name.replace(/\.(mdx|md|txt)$/i, '');
      onLoadFromDrive(content, title, file.id);
      setStatusMessage({ type: 'success', text: `Loaded "${file.name}" into MDX Studio` });
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      console.error('Load file error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to read file content' });
    } finally {
      setLoadingFileId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Icons.HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight flex items-center gap-2">
                <span>Google Drive Cloud Persistence</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Cloud
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Sync and backup your MDX documents directly to Google Drive
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Account Status Bar */}
        <div className="px-5 py-3 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between">
          {isAuthLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Icons.Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              <span>Checking Google account status...</span>
            </div>
          ) : user ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5 text-xs text-slate-200">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-6 h-6 rounded-full border border-slate-700" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center font-bold text-[10px] text-white">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <span className="font-semibold">{user.displayName || user.email}</span>
                  <span className="text-slate-400 text-[11px] block">{user.email}</span>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
                title="Disconnect Google Drive"
              >
                <Icons.LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-slate-400">Not connected to Google Drive</span>
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="gsi-material-button flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md transition-colors cursor-pointer"
              >
                {isSigningIn ? (
                  <Icons.Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Icons.LogIn className="w-3.5 h-3.5" />
                )}
                <span>Sign in with Google</span>
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        {user && (
          <div className="flex border-b border-slate-800 bg-slate-900/50 text-xs">
            <button
              onClick={() => setActiveTab('save')}
              className={`flex-1 py-2.5 font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'save'
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icons.CloudUpload className="w-4 h-4" />
              <span>Save Current Document</span>
            </button>
            <button
              onClick={() => setActiveTab('load')}
              className={`flex-1 py-2.5 font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'load'
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icons.CloudDownload className="w-4 h-4" />
              <span>Browse Drive Files</span>
            </button>
          </div>
        )}

        {/* Status Message Banner */}
        {statusMessage && (
          <div
            className={`px-5 py-2.5 text-xs font-medium flex items-center justify-between ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-b border-rose-500/20 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <Icons.CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Icons.AlertCircle className="w-4 h-4 text-rose-400" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button onClick={() => setStatusMessage(null)}>
              <Icons.X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {!user ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Icons.Cloud className="w-7 h-7" />
              </div>
              <div className="max-w-sm mx-auto">
                <h4 className="text-sm font-semibold text-white">Connect Google Drive</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Authorize Google Drive to automatically persist and sync your MDX documents to your personal cloud storage.
                </p>
              </div>
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg transition-colors cursor-pointer"
              >
                {isSigningIn ? (
                  <>
                    <Icons.Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Icons.LogIn className="w-4 h-4" />
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>
            </div>
          ) : activeTab === 'save' ? (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Document Title / File Name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    placeholder="Enter document title..."
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-slate-400 font-mono font-medium bg-slate-950 px-2.5 py-2 rounded-xl border border-slate-800">
                    .mdx
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 space-y-2">
                <div className="flex items-center justify-between text-slate-400 font-mono">
                  <span>Drive Location:</span>
                  <span className="text-blue-400 font-semibold flex items-center gap-1">
                    <Icons.Folder className="w-3.5 h-3.5" />
                    <span>MDX Studio Documents</span>
                  </span>
                </div>
                {currentDriveFileId && (
                  <div className="flex items-center justify-between text-slate-400 font-mono">
                    <span>Google Drive File ID:</span>
                    <span className="text-slate-200 text-[11px] truncate max-w-[200px]">
                      {currentDriveFileId}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handleSaveToDrive}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-lg transition-colors cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Icons.Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving to Google Drive...</span>
                  </>
                ) : (
                  <>
                    <Icons.CloudUpload className="w-4 h-4" />
                    <span>
                      {currentDriveFileId ? 'Update File in Google Drive' : 'Save New File to Google Drive'}
                    </span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Your Google Drive MDX Files</span>
                <button
                  onClick={fetchDriveFiles}
                  disabled={isLoadingFiles}
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px]"
                >
                  <Icons.RefreshCw className={`w-3 h-3 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {isLoadingFiles ? (
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <Icons.Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                  <span>Fetching documents from Google Drive...</span>
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 space-y-1">
                  <Icons.FileText className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                  <p className="font-medium text-slate-300">No MDX documents found in Google Drive</p>
                  <p className="text-slate-500 text-[11px]">
                    Save your current document to Drive first using the "Save Current Document" tab.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                  {driveFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-blue-500/50 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                          <Icons.FileCode className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-xs text-white truncate">{file.name}</div>
                          <div className="text-[10px] text-slate-400">
                            Modified: {new Date(file.modifiedTime).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleLoadFile(file)}
                        disabled={loadingFileId === file.id}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        {loadingFileId === file.id ? (
                          <Icons.Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Icons.ArrowDownToLine className="w-3.5 h-3.5" />
                        )}
                        <span>Open</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
