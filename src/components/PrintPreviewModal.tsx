import React, { useState } from 'react';
import { ReceivingFormModel } from '../types';
import { generatePrintableHtml, SheetData } from '../utils/printHelper';
import { 
  Printer, 
  ExternalLink, 
  Download, 
  X, 
  Scissors, 
  Copy, 
  FileText, 
  ZoomIn, 
  ZoomOut, 
  Maximize2
} from 'lucide-react';

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: ReceivingFormModel;
  allSheets: SheetData[];
  initialLayout?: 'overflow' | 'duplicate' | 'single';
  signaturesOnlyOnLastPage: boolean;
  rowsPerPage: number;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  form,
  allSheets,
  initialLayout = 'overflow',
  signaturesOnlyOnLastPage,
  rowsPerPage
}) => {
  const [layout, setLayout] = useState<'overflow' | 'duplicate' | 'single'>(initialLayout);
  const [scale, setScale] = useState<number>(0.85);

  if (!isOpen) return null;

  const handleOpenStandalonePrint = () => {
    const html = generatePrintableHtml(
      form,
      allSheets,
      layout,
      signaturesOnlyOnLastPage,
      rowsPerPage
    );
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const printWindow = window.open(blobUrl, '_blank');
    if (!printWindow) {
      alert('Popup was blocked by your browser. Please allow popups or use the Direct Print button.');
    }
  };

  const handleDirectBrowserPrint = () => {
    // Open print window directly and invoke print
    handleOpenStandalonePrint();
  };

  const handleDownloadHtml = () => {
    const html = generatePrintableHtml(
      form,
      allSheets,
      layout,
      signaturesOnlyOnLastPage,
      rowsPerPage
    );
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.sghcNo || 'Stock_Receiving_Form'}_${layout}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const htmlContent = generatePrintableHtml(
    form,
    allSheets,
    layout,
    signaturesOnlyOnLastPage,
    rowsPerPage
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Top Header Controls */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-white">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold flex items-center space-x-2">
              <span>Print & PDF Dispatcher</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                Sunlight Hotel Standard
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              {form.sghcNo || 'Form'} • {allSheets.length} receiving {allSheets.length === 1 ? 'sheet' : 'sheets'}
            </p>
          </div>
        </div>

        {/* Layout Selectors */}
        <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
          <button
            onClick={() => setLayout('overflow')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
              layout === 'overflow' 
                ? 'bg-amber-500 text-slate-950 shadow-xs' 
                : 'text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>2-Up (2 per Bond Paper)</span>
          </button>

          <button
            onClick={() => setLayout('duplicate')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
              layout === 'duplicate' 
                ? 'bg-amber-500 text-slate-950 shadow-xs' 
                : 'text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicates Side-by-Side</span>
          </button>

          <button
            onClick={() => setLayout('single')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
              layout === 'single' 
                ? 'bg-amber-500 text-slate-950 shadow-xs' 
                : 'text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Single 1-Up</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-slate-300 mr-2">
            <button 
              onClick={() => setScale(s => Math.max(0.4, s - 0.1))} 
              className="p-1.5 hover:bg-slate-700 rounded transition"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs px-2 font-mono font-bold text-slate-300">{Math.round(scale * 100)}%</span>
            <button 
              onClick={() => setScale(s => Math.min(1.5, s + 0.1))} 
              className="p-1.5 hover:bg-slate-700 rounded transition"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => setScale(0.85)} 
              className="p-1.5 hover:bg-slate-700 rounded transition"
              title="Reset scale"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleDownloadHtml}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-semibold text-slate-200 transition flex items-center space-x-1.5"
            title="Download full standalone HTML with embedded fonts"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Download HTML</span>
          </button>

          <button
            onClick={handleOpenStandalonePrint}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs sm:text-sm shadow-md transition flex items-center space-x-2"
            title="Open unrestricted print window in a new tab"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open in New Tab & Print</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 overflow-auto p-6 bg-slate-950/60 flex items-start justify-center">
        <div 
          style={{ 
            transform: `scale(${scale})`, 
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out'
          }}
          className="shadow-2xl rounded-lg overflow-hidden border border-slate-700 bg-white"
        >
          <iframe
            title="Print Preview Frame"
            srcDoc={htmlContent}
            className="w-[11in] h-[8.5in] border-0 pointer-events-auto bg-white"
            style={{ width: layout === 'single' ? '5.5in' : '11in', height: '8.5in' }}
          />
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="bg-slate-900/90 border-t border-slate-800 px-6 py-2 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Tip: Click <strong>"Open in New Tab & Print"</strong> to print directly or choose <strong>"Save as PDF"</strong> in your browser's print dialog.</span>
        </div>
        <div>
          Paper size: {layout === 'single' ? '5.5" × 8.5" (Half Bond)' : '11" × 8.5" Landscape (Short Bond Paper with Center Cut Line)'}
        </div>
      </div>
    </div>
  );
};
