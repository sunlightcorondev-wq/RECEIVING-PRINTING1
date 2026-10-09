import React, { useState, useEffect } from 'react';
import { ReceivingFormModel, SAMPLE_RECEIPTS } from './types';
import { ReceivingForm } from './components/ReceivingForm';
import { UploadModal } from './components/UploadModal';
import { SavedReceiptsModal } from './components/SavedReceiptsModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { generateSerializedSghcCode, recordSghcCodeUsed } from './utils/sghcSerializer';
import { Building2, Sparkles, FolderOpen, ShieldCheck, Printer, Plus, FileSpreadsheet } from 'lucide-react';

export default function App() {
  const [form, setForm] = useState<ReceivingFormModel>(() => {
    const savedCurrent = localStorage.getItem('sunlight_current_receiving');
    if (savedCurrent) {
      try {
        return JSON.parse(savedCurrent);
      } catch (e) {
        console.error(e);
      }
    }
    return SAMPLE_RECEIPTS[0];
  });

  const [savedReceipts, setSavedReceipts] = useState<ReceivingFormModel[]>(() => {
    const stored = localStorage.getItem('sunlight_saved_receipts');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error(e);
      }
    }
    return SAMPLE_RECEIPTS;
  });

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSavedOpen, setIsSavedOpen] = useState(false);
  const [isGoogleSheetsOpen, setIsGoogleSheetsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('sunlight_current_receiving', JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    localStorage.setItem('sunlight_saved_receipts', JSON.stringify(savedReceipts));
  }, [savedReceipts]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveRecord = () => {
    const recordToSave: ReceivingFormModel = {
      ...form,
      id: form.id || 'rec-' + Date.now(),
      createdAt: new Date().toISOString()
    };

    recordSghcCodeUsed(recordToSave.sghcNo);

    const existingIndex = savedReceipts.findIndex(r => r.id === recordToSave.id);
    let updatedList: ReceivingFormModel[];
    if (existingIndex >= 0) {
      updatedList = [...savedReceipts];
      updatedList[existingIndex] = recordToSave;
    } else {
      updatedList = [recordToSave, ...savedReceipts];
    }

    setSavedReceipts(updatedList);
    setForm(recordToSave);
    showToast(`Receiving copy ${recordToSave.sghcNo} saved successfully!`);
  };

  const handleDeleteRecord = (id: string) => {
    setSavedReceipts(savedReceipts.filter(r => r.id !== id));
    showToast("Receiving record deleted.");
  };

  const handleResetForm = () => {
    const newSghcNo = generateSerializedSghcCode(savedReceipts);
    setForm({
      id: 'rec-' + Date.now(),
      title: 'Stock Receiving Form',
      from: 'SGHC-WAREHOUSE PAR STOCK',
      mahraNo: '',
      to: 'SGHC-KITCHEN',
      sghcNo: newSghcNo,
      date: new Date().toISOString().split('T')[0],
      location: 'SETIR',
      purpose: '',
      items: [
        {
          id: 'item-1',
          itemBrand: '',
          qty: '' as any,
          uom: 'PCS',
          remarks: '',
          department: 'KITCHEN'
        }
      ],
      preparedBy: 'JEFFERSON SALOM',
      approvedBy: 'ANGELO LIZARES',
      notedBy: '',
      receivedBy: '',
      createdAt: new Date().toISOString()
    });
    showToast(`New blank form created with Serial Code: ${newSghcNo}`);
  };

  return (
    <div className="min-h-screen bg-amber-50/40 text-gray-900 flex flex-col font-sans">
      
      {/* Top Navigation Header (no-print) */}
      <header className="no-print bg-white border-b border-amber-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-md">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-base sm:text-lg flex items-center space-x-2">
                <span>Sunlight Stock Receiving Creator</span>
                <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                  Hotel Coron
                </span>
              </h1>
              <p className="text-xs text-gray-500 hidden sm:block">
                Automated document extraction, manual edits & PDF export for accurate inventory tracking.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={handleResetForm}
              className="px-3 sm:px-4 py-2 bg-white border border-gray-300 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-400 text-gray-700 rounded-lg text-xs sm:text-sm font-medium transition flex items-center space-x-1.5 shadow-xs"
              title="Start a fresh blank Stock Receiving Form"
            >
              <Plus className="w-4 h-4 text-amber-600" />
              <span>New Blank Form</span>
            </button>
            <button
              onClick={() => setIsGoogleSheetsOpen(true)}
              className="px-3 sm:px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 shadow-xs"
              title="Connect, import, or export with Google Sheets"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Google Sheets</span>
            </button>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-3 sm:px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs sm:text-sm font-medium transition flex items-center space-x-1.5 shadow-xs"
              title="Upload Excel spreadsheet (.xlsx, .xls, .csv), PDF, or document image"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span className="hidden xs:inline">AI Parse Excel / Invoice</span>
            </button>
            <button
              onClick={() => setIsSavedOpen(true)}
              className="px-3 sm:px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs sm:text-sm font-medium transition flex items-center space-x-1.5"
            >
              <FolderOpen className="w-4 h-4 text-gray-500" />
              <span>Saved ({savedReceipts.length})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="no-print fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ReceivingForm
          form={form}
          onChange={setForm}
          onSave={handleSaveRecord}
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenSaved={() => setIsSavedOpen(true)}
          onOpenGoogleSheets={() => setIsGoogleSheetsOpen(true)}
          onReset={handleResetForm}
        />
      </main>

      {/* Footer */}
      <footer className="no-print bg-white border-t border-gray-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Sunlight Hotel Coron • Stock Receiving & Inventory Management System
          </div>
          <div className="flex items-center space-x-4">
            <span>Prepared by: {form.preparedBy}</span>
            <span>Approved by: {form.approvedBy}</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <GoogleSheetsModal
        isOpen={isGoogleSheetsOpen}
        onClose={() => setIsGoogleSheetsOpen(false)}
        currentForm={form}
        onFormLoaded={(loadedData) => {
          setForm(loadedData);
          showToast("Data imported successfully from Google Sheets!");
        }}
      />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onDataLoaded={(loadedData) => {
          setForm(loadedData);
          showToast("Document parsed and populated successfully!");
        }}
        onOpenGoogleSheets={() => setIsGoogleSheetsOpen(true)}
      />

      <SavedReceiptsModal
        isOpen={isSavedOpen}
        onClose={() => setIsSavedOpen(false)}
        savedReceipts={savedReceipts}
        onSelect={(receipt) => {
          setForm(receipt);
          showToast("Loaded receiving copy: " + receipt.sghcNo);
        }}
        onDelete={handleDeleteRecord}
      />

    </div>
  );
}
