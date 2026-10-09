import React, { useState } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  Sparkles, 
  X, 
  ArrowRight, 
  Loader2, 
  FileCheck,
  Table,
  FileCode
} from 'lucide-react';
import { ReceivingFormModel, SAMPLE_RECEIPTS } from '../types';
import * as XLSX from 'xlsx';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataLoaded: (data: ReceivingFormModel) => void;
  onOpenGoogleSheets?: () => void;
}

export function UploadModal({ isOpen, onClose, onDataLoaded, onOpenGoogleSheets }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [promptText, setPromptText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const isExcel = Boolean(
    file && (
      /\.(xlsx|xls|csv|tsv|ods)$/i.test(file.name) ||
      (file.type && (
        file.type.includes('spreadsheet') || 
        file.type.includes('excel') || 
        file.type.includes('csv')
      ))
    )
  );

  // Client-side direct Excel / CSV reader with comprehensive department and section support
  const parseExcelClientSide = async (excelFile: File): Promise<ReceivingFormModel | null> => {
    try {
      const arrayBuffer = await excelFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const allItems: any[] = [];
      const cleanFileName = excelFile.name.replace(/\.[^/.]+$/, "").trim();
      let detectedPo = cleanFileName || "SGHC 2026-06-0001";
      let detectedLocation: "MNL" | "SETIR" = "SETIR";
      let detectedMainTo = "SGHC-KITCHEN";

      // Parse each sheet in workbook
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return;

        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        if (!rawRows || rawRows.length === 0) return;

        // Clean sheet department name (e.g. "Kitchen" -> "SGHC-KITCHEN")
        let sheetDept = sheetName.trim().toUpperCase();
        if (!sheetDept.startsWith("SGHC-") && !sheetDept.startsWith("SHEET")) {
          sheetDept = "SGHC-" + sheetDept;
        }

        let currentSectionDept = sheetDept.startsWith("SHEET") ? "SGHC-KITCHEN" : sheetDept;
        let headerRowIdx = -1;
        let descCol = -1;
        let qtyCol = -1;
        let uomCol = -1;
        let poCol = -1;
        let remarksCol = -1;
        let expiryCol = -1;
        let deptCol = -1;

        for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;
          const rowStr = row.map(c => String(c).toLowerCase());
          
          const hasItem = rowStr.some(c => c.includes("item") || c.includes("desc") || c.includes("particular") || c.includes("product"));
          const hasQty = rowStr.some(c => c.includes("qty") || c.includes("quantity") || c.includes("count"));

          if (hasItem || hasQty) {
            headerRowIdx = r;
            rowStr.forEach((col, idx) => {
              if (col.includes("item") || col.includes("desc") || col.includes("particular") || col.includes("product") || col.includes("brand")) {
                if (descCol === -1) descCol = idx;
              } else if (col.includes("qty") || col.includes("quantity")) {
                if (qtyCol === -1) qtyCol = idx;
              } else if (col.includes("uom") || col.includes("unit") || col.includes("pkg") || col.includes("packaging")) {
                if (uomCol === -1) uomCol = idx;
              } else if (col.includes("po") || col.includes("sghc") || col.includes("reference")) {
                if (poCol === -1) poCol = idx;
              } else if (col.includes("exp")) {
                if (expiryCol === -1) expiryCol = idx;
              } else if (col.includes("dept") || col.includes("department") || col.includes("destination") || col.includes("to")) {
                if (deptCol === -1) deptCol = idx;
              } else if (col.includes("remark") || col.includes("note") || col.includes("handler") || col.includes("c/o")) {
                if (remarksCol === -1) remarksCol = idx;
              }
            });
            break;
          }
        }

        if (descCol === -1) {
          // Fallback heuristic: find column with most text as descCol and numbers as qtyCol
          let bestTextCol = 0;
          let maxTextScore = 0;
          let bestNumCol = 1;
          let maxNumScore = 0;

          const sampleRows = rawRows.slice(0, Math.min(rawRows.length, 10));
          const colCount = Math.max(...sampleRows.map(r => Array.isArray(r) ? r.length : 0), 3);

          for (let c = 0; c < colCount; c++) {
            let textLen = 0;
            let numCount = 0;
            sampleRows.forEach(row => {
              const val = row[c];
              if (val !== undefined && val !== null && val !== "") {
                const str = String(val).trim();
                const num = Number(str);
                if (!isNaN(num) && str.length <= 6) {
                  numCount++;
                } else if (str.length > 2) {
                  textLen += str.length;
                }
              }
            });
            if (textLen > maxTextScore) {
              maxTextScore = textLen;
              bestTextCol = c;
            }
            if (numCount > maxNumScore) {
              maxNumScore = numCount;
              bestNumCol = c;
            }
          }
          descCol = bestTextCol;
          qtyCol = bestNumCol;
          uomCol = descCol === 0 && qtyCol === 1 ? 2 : (descCol + 1 === qtyCol ? qtyCol + 1 : descCol + 1);
        }

        const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

        for (let r = startRow; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!Array.isArray(row) || row.length === 0) continue;

          const desc = String(row[descCol] || "").trim();
          if (!desc) continue;

          const upperDesc = desc.toUpperCase();

          // Check if this row is a section header (e.g. SGHC-MAIN KITCHEN PAR STOCK, SGHC-FRONT OFFICE, SGHC-I.T DEPT, SGHC-H.R DEPT, SGHC-TOURS, SGHC-S&R, SGHC-FOR FLEET & GENSET)
          const isSectionHeader = (
            upperDesc.includes("SGHC-") || 
            upperDesc.includes("PAR STOCK") || 
            upperDesc.includes("PACKING LIST") ||
            upperDesc.includes("MAIN KITCHEN") || 
            upperDesc.includes("FRONT OFFICE") ||
            upperDesc.includes("AIRPORT LOUNGE") ||
            upperDesc.includes("KANATEN") ||
            upperDesc.includes("I.T DEPT") ||
            upperDesc.includes("I.T.") ||
            upperDesc.includes("H.R DEPT") ||
            upperDesc.includes("H.R.") ||
            upperDesc.includes("STAFF MEDICINE") ||
            upperDesc.includes("ISLAND HOPPING") ||
            upperDesc.includes("TOURS") ||
            upperDesc.includes("COASTERS") ||
            upperDesc.includes("S&R") ||
            upperDesc.includes("FLEET & GENSET") ||
            upperDesc.includes("HOUSEKEEPING") || 
            upperDesc.includes("WAREHOUSE") || 
            upperDesc.includes("CAFETERIA") || 
            upperDesc.includes("PASTRY") || 
            upperDesc.includes("BAR") ||
            upperDesc.includes("SPA") ||
            upperDesc.includes("STEWARDING")
          );

          if (isSectionHeader) {
            if (upperDesc.includes("KITCHEN") || upperDesc.includes("MAIN KITCHEN")) currentSectionDept = "SGHC-KITCHEN";
            else if (upperDesc.includes("CAFETERIA") || upperDesc.includes("CANTEEN")) currentSectionDept = "SGHC-CAFETERIA";
            else if (upperDesc.includes("FRONT OFFICE") || upperDesc.includes("AIRPORT LOUNGE") || upperDesc.includes("KANATEN")) currentSectionDept = "SGHC-FRONT OFFICE";
            else if (upperDesc.includes("I.T") || upperDesc.includes("IT DEPT")) currentSectionDept = "SGHC-I.T.";
            else if (upperDesc.includes("H.R") || upperDesc.includes("HR DEPT") || upperDesc.includes("MEDICINE") || upperDesc.includes("CLINIC")) currentSectionDept = "SGHC-H.R.";
            else if (upperDesc.includes("ISLAND HOPPING") || upperDesc.includes("TOURS") || upperDesc.includes("TOUR")) currentSectionDept = "SGHC-TOURS";
            else if (upperDesc.includes("COASTER") || upperDesc.includes("COASTERS") || upperDesc.includes("S&R") || upperDesc.includes("TRANSPORT")) currentSectionDept = "SGHC-TRANSPORT";
            else if (upperDesc.includes("FLEET") || upperDesc.includes("GENSET") || upperDesc.includes("ENGINEERING") || upperDesc.includes("MAINTENANCE")) currentSectionDept = "SGHC-ENGINEERING";
            else if (upperDesc.includes("HOUSEKEEPING") || upperDesc.includes(" HK")) currentSectionDept = "SGHC-HOUSEKEEPING";
            else if (upperDesc.includes("BAR")) currentSectionDept = "SGHC-BAR";
            else if (upperDesc.includes("PASTRY") || upperDesc.includes("BAKERY")) currentSectionDept = "SGHC-PASTRY";
            else if (upperDesc.includes("SPA")) currentSectionDept = "SGHC-SPA";
            else if (upperDesc.includes("STEWARDING")) currentSectionDept = "SGHC-STEWARDING";
            else if (upperDesc.includes("WAREHOUSE")) currentSectionDept = "SGHC-WAREHOUSE";
            else if (upperDesc.startsWith("SGHC-")) {
              currentSectionDept = upperDesc.split(" ")[0].trim();
            }

            const rawQtyVal = row[qtyCol];
            const hasQty = rawQtyVal !== undefined && rawQtyVal !== "" && !isNaN(Number(rawQtyVal));
            if (!hasQty) {
              continue; // Skip section header line
            }
          }

          if (desc.toLowerCase().includes("total") || desc.toLowerCase().startsWith("prepared by") || desc.toLowerCase().startsWith("approved")) {
            continue;
          }

          const rawQty = row[qtyCol];
          const parsedQty = typeof rawQty === "number" ? rawQty : parseFloat(String(rawQty).replace(/[^0-9.]/g, "")) || 1;
          const uom = String(row[uomCol] || "PCS").trim().toUpperCase() || "PCS";
          
          const remarksParts: string[] = [];
          if (poCol >= 0 && row[poCol]) {
            const poVal = String(row[poCol]).trim();
            if (poVal) {
              detectedPo = poVal;
              if (poVal.toUpperCase().includes("MNL")) detectedLocation = "MNL";
              remarksParts.push(`PO# ${poVal}`);
            }
          }
          if (expiryCol >= 0 && row[expiryCol]) {
            const expVal = String(row[expiryCol]).trim();
            if (expVal && expVal.toLowerCase() !== "n/a" && expVal !== "-") {
              remarksParts.push(`Exp: ${expVal}`);
            }
          }
          if (remarksCol >= 0 && row[remarksCol]) {
            const remVal = String(row[remarksCol]).trim();
            if (remVal) remarksParts.push(remVal);
          }

          let itemDept = currentSectionDept;
          if (deptCol >= 0 && row[deptCol]) {
            const customDept = String(row[deptCol]).trim().toUpperCase();
            if (customDept) {
              itemDept = customDept.startsWith("SGHC-") ? customDept : "SGHC-" + customDept;
            }
          }

          if (detectedMainTo === "SGHC-KITCHEN" && itemDept !== "SGHC-KITCHEN") {
            detectedMainTo = itemDept;
          }

          allItems.push({
            id: 'item-' + sheetName + '-' + r + '-' + Date.now(),
            itemBrand: desc.toUpperCase(),
            qty: parsedQty,
            uom: uom || "PCS",
            remarks: remarksParts.join(" - "),
            department: itemDept
          });
        }
      });

      if (allItems.length === 0) return null;

      return {
        id: 'rec-' + Date.now(),
        title: 'Stock Receiving - ' + (cleanFileName || 'Document'),
        from: "SGHC-WAREHOUSE PAR STOCK",
        to: detectedMainTo,
        sghcNo: cleanFileName || detectedPo,
        date: new Date().toISOString().split("T")[0],
        location: detectedLocation,
        purpose: "Stock Replenishment",
        items: allItems,
        preparedBy: "JEFFERSON SALOM",
        approvedBy: "ANGELO LIZARES",
        notedBy: "",
        receivedBy: "",
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      console.error("Local excel parsing error:", e);
      return null;
    }
  };

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !promptText) {
      setError("Please select an Excel file, image, or PDF document to parse.");
      return;
    }

    setIsParsing(true);
    setError(null);

    // Fast-path: For Excel spreadsheets, parse instantly client-side!
    if (isExcel && file) {
      try {
        const localForm = await parseExcelClientSide(file);
        if (localForm && localForm.items.length > 0) {
          const filterLower = promptText.trim().toLowerCase();
          if (filterLower) {
            const filteredItems = localForm.items.filter(item => {
              const itemDept = (item.department || "").toLowerCase();
              const itemBrand = (item.itemBrand || "").toLowerCase();
              const remarks = (item.remarks || "").toLowerCase();
              return itemDept.includes(filterLower) || itemBrand.includes(filterLower) || remarks.includes(filterLower);
            });
            if (filteredItems.length > 0) {
              localForm.items = filteredItems;
            }
          }
          onDataLoaded(localForm);
          onClose();
          return;
        }
      } catch (localErr) {
        console.warn("Client-side Excel parse failed, proceeding to server parse:", localErr);
      }
    }

    try {
      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      }
      formData.append("prompt", promptText);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      let response: Response;
      try {
        response = await fetch("/api/parse-receipt", {
          method: "POST",
          body: formData,
          signal: controller.signal
        });
      } catch (networkErr: any) {
        clearTimeout(timeoutId);
        // If network failed or timed out and file is Excel, fallback to client-side parser
        if (isExcel && file) {
          const localForm = await parseExcelClientSide(file);
          if (localForm && localForm.items.length > 0) {
            onDataLoaded(localForm);
            onClose();
            return;
          }
        }
        if (networkErr.name === "AbortError") {
          throw new Error("Request timed out. The document took longer than 2 minutes to process. Please try uploading an Excel spreadsheet or try a smaller file.");
        }
        throw new Error("Unable to reach server. Please check your connection or try another file.");
      } finally {
        clearTimeout(timeoutId);
      }

      const responseText = await response.text();
      let result: any = null;

      if (responseText && responseText.trim()) {
        const raw = responseText.trim();
        // 1. Direct parse attempt
        try {
          result = JSON.parse(raw);
        } catch {
          // 2. Strip code fences (```json ... ```)
          try {
            const stripped = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
            result = JSON.parse(stripped);
          } catch {
            // 3. Extract JSON object substring between '{' and '}'
            const startIdx = raw.indexOf('{');
            const endIdx = raw.lastIndexOf('}');
            if (startIdx !== -1 && endIdx > startIdx) {
              const candidate = raw.substring(startIdx, endIdx + 1);
              try {
                result = JSON.parse(candidate);
              } catch {
                console.warn("Could not parse substring JSON candidate:", candidate.slice(0, 100));
              }
            }
          }
        }
      }

      if (!response.ok) {
        // If server returned an error, fallback to client-side Excel parser if available
        if (isExcel && file) {
          const localForm = await parseExcelClientSide(file);
          if (localForm && localForm.items.length > 0) {
            onDataLoaded(localForm);
            onClose();
            return;
          }
        }
        const serverError = result?.error || `Server returned error (${response.status}: ${response.statusText || 'Service Busy'}).`;
        throw new Error(serverError);
      }

      // Check if response was HTML (e.g., if API route fell through or service gateway timed out)
      if (!result && responseText.trim().startsWith('<')) {
        if (isExcel && file) {
          const localForm = await parseExcelClientSide(file);
          if (localForm && localForm.items.length > 0) {
            onDataLoaded(localForm);
            onClose();
            return;
          }
        }
        throw new Error("The AI service timed out while processing this document. Please try again with a clearer or smaller image/PDF, or upload an Excel spreadsheet.");
      }

      if (!result) {
        if (isExcel && file) {
          const localForm = await parseExcelClientSide(file);
          if (localForm && localForm.items.length > 0) {
            onDataLoaded(localForm);
            onClose();
            return;
          }
        }
        throw new Error("Unable to parse document response. Please try again or load a sample template.");
      }

      // Support either { success: true, data: { ... } } or direct { items: [ ... ], ... }
      const payload = result.data || (Array.isArray(result.items) || result.from || result.to ? result : null);

      if (payload && (Array.isArray(payload.items) || payload.from || payload.to)) {
        const cleanFileName = file ? file.name.replace(/\.[^/.]+$/, "").trim() : '';
        const newForm: ReceivingFormModel = {
          id: 'rec-' + Date.now(),
          title: cleanFileName ? `Stock Receiving - ${cleanFileName}` : (payload.purpose || 'Stock Receiving Copy'),
          from: payload.from || 'SGHC-WAREHOUSE PAR STOCK',
          to: payload.to || 'SGHC-KITCHEN',
          sghcNo: cleanFileName || payload.sghcNo || 'SGHC 2026-06-0001',
          date: payload.date || new Date().toISOString().split('T')[0],
          location: (payload.location === 'MNL' ? 'MNL' : 'SETIR') as 'MNL' | 'SETIR',
          purpose: payload.purpose || 'Stock Replenishment',
          items: (payload.items || []).map((item: any, idx: number) => ({
            id: 'item-' + idx + '-' + Date.now(),
            itemBrand: item.itemBrand || item.item || 'Item',
            qty: Number(item.qty) || 1,
            uom: item.uom || 'PCS',
            remarks: item.remarks || '',
            department: item.department || ''
          })),
          preparedBy: payload.preparedBy || 'JEFFERSON SALOM',
          approvedBy: payload.approvedBy || 'ANGELO LIZARES',
          notedBy: payload.notedBy || '',
          receivedBy: payload.receivedBy || '',
          createdAt: new Date().toISOString()
        };
        onDataLoaded(newForm);
        onClose();
      } else {
        // If AI parsing failed but file is Excel, fallback to client-side parser
        if (isExcel && file) {
          const localForm = await parseExcelClientSide(file);
          if (localForm && localForm.items.length > 0) {
            onDataLoaded(localForm);
            onClose();
            return;
          }
        }
        throw new Error(result?.error || "Failed to extract items from file.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during document parsing.");
    } finally {
      setIsParsing(false);
    }
  };

  // Generate and download a sample Sunlight Par Stock Excel file for testing
  const downloadSampleExcel = () => {
    const wsData = [
      ["ITEM DESCRIPTION", "QTY", "UOM", "EXPIRY DATE", "PO NO.", "REMARKS"],
      ["GOLDEN SILK PANCIT CANTON", 12, "PCS", "N/A", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["DEL MONTE SPAGHETTI PASTA (20 X 900G)", 1, "CASE", "Aug-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["DEL MONTE SPAGHETTI SAUCE ITALIAN (12 X 900G)", 1, "CASE", "Mar-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["DEL MONTE PINEAPPLE TIDBITS (48 X 115G)", 1, "CASE", "Dec-26", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["DEL MONTE TOMATO PASTE (48 X 150G)", 1, "CASE", "Mar-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["BOY BIGAS (25KGS/SACK)", 15, "SACKS", "N/A", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["CLARA OLE ORIGINAL PANCAKE SYRUP (355ML X 12)", 1, "CASE", "Apr-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["CLARA OLE MAPLE PANCAKE SYRUP (355ML X 12)", 1, "CASE", "Mar-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["ALASKA CONDENSADA (24 X 545G)", 1, "CASE", "Apr-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["ALASKA EVAPORADA (48 X 360ML)", 1, "CASE", "May-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["AJINOMOTO UMAMI SEASONING (2.5KGS X 8)", 2, "CASES", "Apr-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["KNORR SINIGANG SA GABI (40 X 160G)", 1, "CASE", "Jul-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["KNORR SINIGANG SA SAMPALOK BROTH (30 X 160G)", 1, "CASE", "Jun-27", "SGHC 2026-06-0001", "C/O JULIUS CORNELIA"],
      ["BONELESS BANGUS", 10, "KGS", "N/A", "SGHC 2026-06-0003", "C/O JULIUS CORNELIA - Fresh"],
      ["MARINATED DAING GALUNGGONG", 10, "KGS", "N/A", "SGHC 2026-06-0003", "C/O JULIUS CORNELIA"],
      ["SADIA WHOLE CHICKEN (12KGS/BOX)", 24, "KGS", "Sep-27", "SETIR 2026-06-0003", "C/O JULIUS CORNELIA"]
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Par Stock List");
    XLSX.writeFile(wb, "Sample_Sunlight_Par_Stock_Invoice.xlsx");
  };

  const loadPreset = (sample: ReceivingFormModel) => {
    onDataLoaded({
      ...sample,
      id: 'rec-' + Date.now(),
      createdAt: new Date().toISOString()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-amber-100 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-amber-600 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-200" />
            <h2 className="text-lg font-semibold tracking-wide">AI Document & Excel Parser</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-amber-700 transition text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* File Formats Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-gray-700">Supported Formats:</span>
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-semibold rounded-md flex items-center space-x-1">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel (.xlsx, .xls)</span>
            </span>
            <span className="px-2.5 py-1 bg-teal-100 text-teal-800 font-medium rounded-md">
              CSV / TSV
            </span>
            <span className="px-2.5 py-1 bg-blue-100 text-blue-800 font-medium rounded-md">
              PDF Documents
            </span>
            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-medium rounded-md">
              Scanned / Photos (PNG/JPG)
            </span>
          </div>

          {/* Direct Google Sheets Connect Banner */}
          {onOpenGoogleSheets && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-emerald-900">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Working with a live Google Sheet? Import or sync tabs directly.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGoogleSheets();
                }}
                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg text-xs transition flex items-center space-x-1 shrink-0 shadow-2xs"
              >
                <span>Connect Google Sheets</span>
                <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          )}

          {/* File Upload Box */}
          <form onSubmit={handleParse} className="space-y-4">
            <div>
              <div className="border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-xl p-6 text-center bg-amber-50/40 transition relative group cursor-pointer">
                <input 
                  type="file" 
                  onChange={handleFileChange}
                  accept=".xlsx,.xls,.csv,.tsv,.ods,.pdf,image/*"
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 bg-amber-100 text-amber-700 rounded-full group-hover:scale-110 transition">
                    {isExcel ? (
                      <FileSpreadsheet className="w-7 h-7 text-emerald-600" />
                    ) : (
                      <Upload className="w-7 h-7 text-amber-700" />
                    )}
                  </div>
                  {file ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-center space-x-2 text-gray-900 font-bold text-sm">
                        {isExcel ? <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> : <FileText className="w-4 h-4 text-amber-600" />}
                        <span>{file.name}</span>
                      </div>
                      <p className="text-xs text-emerald-700 font-medium">
                        {(file.size / 1024).toFixed(1)} KB • Ready for AI extraction
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-gray-800">
                        Drop your Excel spreadsheet (.xlsx, .xls, .csv) or image here, or <span className="text-amber-600 underline">browse</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Direct table mapping from Par Stock / Invoice sheets
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Custom Extraction Prompt / Specific Section Filter (Optional)
              </label>
              <input 
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g., Extract only SGHC-CAFETERIA PAR STOCK or specify PO# SGHC 2026-06-0001"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm outline-none"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={downloadSampleExcel}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium flex items-center space-x-1 hover:underline"
                title="Download a test .xlsx file configured with sample par stock data"
              >
                <Table className="w-3.5 h-3.5" />
                <span>Download Sample Excel (.xlsx)</span>
              </button>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isParsing}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition flex items-center space-x-2 disabled:opacity-50"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Parsing with Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate Receiving Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Quick Presets Section */}
          <div className="border-t border-gray-200 pt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Or load sample template data instantly:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SAMPLE_RECEIPTS.map((sample, idx) => (
                <button
                  key={sample.id || idx}
                  type="button"
                  onClick={() => loadPreset(sample)}
                  className="text-left p-3 rounded-xl border border-gray-200 hover:border-amber-500 hover:bg-amber-50/40 transition flex items-start justify-between group"
                >
                  <div>
                    <div className="font-semibold text-gray-800 text-xs group-hover:text-amber-900">
                      {sample.title}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {sample.items.length} items • {sample.sghcNo}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-amber-600 mt-1 shrink-0" />
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
