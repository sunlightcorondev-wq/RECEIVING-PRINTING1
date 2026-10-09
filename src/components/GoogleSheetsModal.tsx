import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  LogOut, 
  RefreshCw,
  FolderOpen,
  Plus
} from 'lucide-react';
import { User } from 'firebase/auth';
import { ReceivingFormModel } from '../types';
import { 
  signInWithGoogle, 
  signOutGoogle, 
  subscribeAuth, 
  getAccessToken 
} from '../services/googleAuth';
import { 
  extractSpreadsheetId, 
  fetchSpreadsheetMetadata, 
  readSpreadsheetValues, 
  parseSheetRowsToReceivingForm, 
  exportFormToGoogleSheet,
  SheetTabInfo
} from '../services/googleSheets';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentForm: ReceivingFormModel;
  onFormLoaded: (form: ReceivingFormModel) => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  currentForm,
  onFormLoaded,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');

  // Import states
  const [importUrl, setImportUrl] = useState('');
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [sheetTabs, setSheetTabs] = useState<SheetTabInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>('');
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Export states
  const [exportMode, setExportMode] = useState<'new' | 'existing'>('new');
  const [existingUrl, setExistingUrl] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ url: string; title: string } | null>(null);

  // Status / error
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAuth((currentUser, currentToken) => {
      setUser(currentUser);
      setToken(currentToken);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setErrorMessage(null);
    try {
      const res = await signInWithGoogle();
      setUser(res.user);
      setToken(res.token);
      setStatusMessage(`Connected as ${res.user.displayName || res.user.email}`);
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      setErrorMessage(err.message || 'Failed to sign in with Google.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutGoogle();
      setUser(null);
      setToken(null);
      setSheetTabs([]);
      setExportResult(null);
      setStatusMessage('Signed out from Google.');
    } catch (err: any) {
      console.error('Google Sign-Out failed:', err);
    }
  };

  const handleFetchTabs = async () => {
    const sheetId = extractSpreadsheetId(importUrl);
    if (!sheetId) {
      setErrorMessage('Please enter a valid Google Sheets URL or Spreadsheet ID.');
      return;
    }

    let currentToken = token;
    if (!currentToken) {
      currentToken = await getAccessToken();
    }
    if (!currentToken) {
      setErrorMessage('Please sign in with Google to access this spreadsheet.');
      return;
    }

    setIsLoadingMeta(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const meta = await fetchSpreadsheetMetadata(currentToken, sheetId);
      setSpreadsheetTitle(meta.title);
      setSheetTabs(meta.sheets);
      if (meta.sheets.length > 0) {
        setSelectedTab(meta.sheets[0].title);
      }
      setStatusMessage(`Found spreadsheet: "${meta.title}" with ${meta.sheets.length} tab(s).`);
    } catch (err: any) {
      console.error('Fetch metadata error:', err);
      setErrorMessage(err.message || 'Could not load spreadsheet details. Please ensure the link is correct and you have view permissions.');
    } finally {
      setIsLoadingMeta(false);
    }
  };

  const handleImportSheet = async () => {
    const sheetId = extractSpreadsheetId(importUrl);
    if (!sheetId || !selectedTab) {
      setErrorMessage('Please select a sheet tab to import.');
      return;
    }

    let currentToken = token;
    if (!currentToken) {
      currentToken = await getAccessToken();
    }
    if (!currentToken) {
      setErrorMessage('Please sign in with Google to import this spreadsheet.');
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const rows = await readSpreadsheetValues(currentToken, sheetId, selectedTab);
      const parsedForm = parseSheetRowsToReceivingForm(rows, spreadsheetTitle, selectedTab);
      onFormLoaded(parsedForm);
      onClose();
    } catch (err: any) {
      console.error('Import error:', err);
      setErrorMessage(err.message || 'Failed to read rows from the selected sheet tab.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportSheet = async () => {
    let currentToken = token;
    if (!currentToken) {
      currentToken = await getAccessToken();
    }
    if (!currentToken) {
      setErrorMessage('Please sign in with Google before exporting.');
      return;
    }

    let targetId: string | undefined = undefined;
    if (exportMode === 'existing') {
      const cleanId = extractSpreadsheetId(existingUrl);
      if (!cleanId) {
        setErrorMessage('Please enter a valid destination Google Sheet URL or ID.');
        return;
      }
      targetId = cleanId;
    }

    setIsExporting(true);
    setErrorMessage(null);
    setExportResult(null);

    try {
      const res = await exportFormToGoogleSheet(currentToken, currentForm, targetId);
      setExportResult({
        url: res.spreadsheetUrl,
        title: res.sheetTitle,
      });
      setStatusMessage(`Successfully exported to Google Sheets: "${res.sheetTitle}"`);
    } catch (err: any) {
      console.error('Export error:', err);
      setErrorMessage(err.message || 'Failed to export form to Google Sheets.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-emerald-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <FileSpreadsheet className="w-6 h-6 text-emerald-100" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Google Sheets Integration</h2>
              <p className="text-xs text-emerald-100">
                Sync Stock Receiving forms directly with your Google Spreadsheets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth status bar */}
        <div className="bg-emerald-50/70 border-b border-emerald-100 px-6 py-3 flex items-center justify-between flex-wrap gap-2 text-xs">
          {user ? (
            <div className="flex items-center space-x-2.5">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full border border-emerald-300" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[10px]">
                  {user.displayName?.[0] || 'U'}
                </div>
              )}
              <span className="font-semibold text-emerald-900">
                {user.displayName || user.email}
              </span>
              <span className="text-emerald-600 font-medium hidden sm:inline">
                ({user.email})
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-gray-600">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>Sign in with Google to enable importing and syncing with Google Sheets.</span>
            </div>
          )}

          {user ? (
            <button
              onClick={handleSignOut}
              className="px-2.5 py-1 text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-md transition flex items-center space-x-1 font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={isAuthenticating}
              className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 font-medium rounded-lg shadow-2xs transition flex items-center space-x-2 disabled:opacity-50"
            >
              {isAuthenticating ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <span>Sign in with Google</span>
            </button>
          )}
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-gray-200 bg-gray-50/50 px-6 pt-2">
          <button
            onClick={() => { setActiveTab('import'); setErrorMessage(null); setStatusMessage(null); }}
            className={`py-2.5 px-4 font-semibold text-sm border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'import'
                ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Import from Google Sheets</span>
          </button>
          <button
            onClick={() => { setActiveTab('export'); setErrorMessage(null); setStatusMessage(null); }}
            className={`py-2.5 px-4 font-semibold text-sm border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'export'
                ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Upload className="w-4 h-4 text-emerald-600" />
            <span>Export to Google Sheets</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">

          {/* Feedback banners */}
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Error: </span>
                {errorMessage}
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex-1 font-medium">{statusMessage}</div>
            </div>
          )}

          {/* TAB 1: IMPORT FROM GOOGLE SHEETS */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Google Sheet URL or Spreadsheet ID
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFM.../edit"
                    className="flex-1 px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-hidden font-mono"
                  />
                  <button
                    onClick={handleFetchTabs}
                    disabled={isLoadingMeta || !importUrl.trim()}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center space-x-1.5 disabled:opacity-50 shrink-0"
                  >
                    {isLoadingMeta ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>Load Tabs</span>
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Paste the full URL from your browser address bar or the Google Sheets document ID.
                </p>
              </div>

              {sheetTabs.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800">
                      Spreadsheet: <span className="text-emerald-700">{spreadsheetTitle}</span>
                    </span>
                    <span className="text-[11px] text-gray-500 font-medium">
                      {sheetTabs.length} sheet tab(s) available
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Select Sheet Tab to Import:
                    </label>
                    <select
                      value={selectedTab}
                      onChange={(e) => setSelectedTab(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-hidden font-medium"
                    >
                      {sheetTabs.map((tab) => (
                        <option key={tab.sheetId} value={tab.title}>
                          {tab.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleImportSheet}
                    disabled={isImporting || !selectedTab}
                    className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Reading Spreadsheet Rows...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>Import &quot;{selectedTab}&quot; into Stock Receiving Form</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXPORT TO GOOGLE SHEETS */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                <span className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Target Destination
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportMode('new')}
                    className={`p-3 rounded-xl border text-left flex items-start space-x-2.5 transition ${
                      exportMode === 'new'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-semibold'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Plus className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">Create New Google Sheet</div>
                      <div className="text-[11px] text-gray-500 font-normal">
                        Creates a fresh spreadsheet titled with this document number
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportMode('existing')}
                    className={`p-3 rounded-xl border text-left flex items-start space-x-2.5 transition ${
                      exportMode === 'existing'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-semibold'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">Append to Existing Sheet</div>
                      <div className="text-[11px] text-gray-500 font-normal">
                        Appends a new tab to an existing Google Spreadsheet
                      </div>
                    </div>
                  </button>
                </div>

                {exportMode === 'existing' && (
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Existing Google Sheet URL or ID:
                    </label>
                    <input
                      type="text"
                      value={existingUrl}
                      onChange={(e) => setExistingUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFM.../edit"
                      className="w-full px-3.5 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-hidden font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Form summary preview */}
              <div className="p-3.5 bg-gray-50/70 rounded-xl border border-gray-200 text-xs space-y-1">
                <div className="flex justify-between font-medium text-gray-700">
                  <span>Document Title:</span>
                  <span className="font-bold text-gray-900">{currentForm.sghcNo || currentForm.title}</span>
                </div>
                <div className="flex justify-between font-medium text-gray-700">
                  <span>Department / Destination:</span>
                  <span className="font-semibold text-emerald-700">{currentForm.to}</span>
                </div>
                <div className="flex justify-between font-medium text-gray-700">
                  <span>Total Items to Export:</span>
                  <span className="font-bold text-gray-900">{currentForm.items.length} items</span>
                </div>
              </div>

              <button
                onClick={handleExportSheet}
                disabled={isExporting}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Syncing with Google Sheets...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Sync Current Form to Google Sheets</span>
                  </>
                )}
              </button>

              {/* Export Success Link */}
              {exportResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-emerald-950 flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Export Completed!</span>
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      Tab: <span className="font-semibold">&quot;{exportResult.title}&quot;</span>
                    </div>
                  </div>
                  <a
                    href={exportResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center space-x-1.5"
                  >
                    <span>Open in Google Sheets</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
