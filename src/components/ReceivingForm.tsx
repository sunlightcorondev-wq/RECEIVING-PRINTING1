import React, { useState, useEffect } from 'react';
import { ReceivingFormModel, ReceivingItem } from '../types';
import { BatchDepartmentModal } from './BatchDepartmentModal';
import { PrintPreviewModal } from './PrintPreviewModal';
import { generatePrintableHtml } from '../utils/printHelper';
import { generateSerializedSghcCode, recordSghcCodeUsed, ensureSerializedSghcCode, isSerializedSghcCode } from '../utils/sghcSerializer';
import * as XLSX from 'xlsx';
import { 
  Plus, 
  Trash2, 
  Printer, 
  Save, 
  Sparkles, 
  FolderOpen, 
  RefreshCw, 
  Copy, 
  Scissors,
  CheckSquare,
  Square,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  ExternalLink
} from 'lucide-react';

interface ReceivingFormProps {
  form: ReceivingFormModel;
  onChange: (updated: ReceivingFormModel) => void;
  onSave: () => void;
  onOpenUpload: () => void;
  onOpenSaved: () => void;
  onOpenGoogleSheets?: () => void;
  onReset: () => void;
}

export function ReceivingForm({
  form,
  onChange,
  onSave,
  onOpenUpload,
  onOpenSaved,
  onOpenGoogleSheets,
  onReset
}: ReceivingFormProps) {
  const [printLayout, setPrintLayout] = useState<'overflow' | 'duplicate' | 'single'>('overflow');
  const [rowsPerPage, setRowsPerPage] = useState<number>(16);
  const [zoomLevel, setZoomLevel] = useState<number>(95);
  const [activeScreenTab, setActiveScreenTab] = useState<'all' | number>('all');

  const updateHeader = (field: keyof ReceivingFormModel, value: any) => {
    onChange({
      ...form,
      [field]: value
    });
  };

  // Ensure SGHC # is always populated with a sequential serialized code
  useEffect(() => {
    if (!form.sghcNo || !isSerializedSghcCode(form.sghcNo)) {
      updateHeader('sghcNo', ensureSerializedSghcCode(form.sghcNo));
    }
  }, [form.sghcNo]);

  const handleGenerateNextSghc = () => {
    const nextCode = generateSerializedSghcCode();
    updateHeader('sghcNo', nextCode);
  };

  const updateItem = (id: string, field: keyof ReceivingItem, value: any) => {
    const updatedItems = form.items.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    });
    onChange({ ...form, items: updatedItems });
  };

  const addItem = () => {
    const targetDept = selectedDept !== 'ALL' ? selectedDept : (form.to || 'SGHC-KITCHEN');
    const newItem: ReceivingItem = {
      id: 'item-' + Date.now(),
      itemBrand: '',
      qty: 1,
      uom: 'PCS',
      remarks: '',
      department: targetDept
    };
    onChange({ ...form, items: [...form.items, newItem] });
  };

  const removeItem = (id: string) => {
    onChange({ ...form, items: form.items.filter(item => item.id !== id) });
  };

  const exportToExcel = () => {
    const headerInfo = [
      ["SUNLIGHT HOTEL, CORON - STOCK RECEIVING REPORT"],
      ["FROM:", form.from, "MAHRA #:", form.mahraNo || "", "SGHC NO.:", form.sghcNo],
      ["TO:", form.to, "DATE:", form.date, "LOCATION:", form.location],
      ["PURPOSE:", form.purpose],
      [],
      ["ITEM/BRAND", "QTY", "UOM", "REMARKS"]
    ];

    const itemRows = form.items.map(item => [
      item.itemBrand,
      item.qty,
      item.uom,
      item.remarks
    ]);

    const footerInfo = [
      [],
      ["CONFIRMATION:", "This is to confirm that all items listed above are complete in actual number and in good condition."],
      ["PREPARED BY:", form.preparedBy, "APPROVED BY:", form.approvedBy],
      ["NOTED BY:", form.notedBy, "RECEIVED BY:", form.receivedBy]
    ];

    const fullSheetData = [...headerInfo, ...itemRows, ...footerInfo];
    const ws = XLSX.utils.aoa_to_sheet(fullSheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Receiving Slip");

    const safeTitle = (form.sghcNo || form.purpose || 'Receiving_Form').replace(/[^a-zA-Z0-9-_]/g, '_');
    XLSX.writeFile(wb, `${safeTitle}.xlsx`);
  };

  // Department presets commonly used in Sunlight Hotel stock transfers
  const HOTEL_DEPARTMENTS = [
    'SGHC-KITCHEN',
    'SGHC-WAREHOUSE',
    'SGHC-CAFETERIA',
    'SGHC-FRONT OFFICE',
    'SGHC-I.T.',
    'SGHC-H.R.',
    'SGHC-TOURS',
    'SGHC-TRANSPORT',
    'SGHC-ENGINEERING',
    'SGHC-HOUSEKEEPING',
    'SGHC-BAR',
    'SGHC-PASTRY',
    'SGHC-SPA',
    'SGHC-STEWARDING',
    'SGHC-F&B',
    'SGHC-SECURITY',
    'SGHC-PURCHASING'
  ];

  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [groupByDept, setGroupByDept] = useState<boolean>(false);
  const [signaturesOnlyOnLastPage, setSignaturesOnlyOnLastPage] = useState<boolean>(true);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState<boolean>(false);

  const handlePrint = (layout: 'overflow' | 'duplicate' | 'single') => {
    setPrintLayout(layout);
    if (layout === 'single') {
      document.body.classList.add('single-print-mode');
    } else {
      document.body.classList.remove('single-print-mode');
    }

    // 1. Generate standalone self-contained printable document
    const html = generatePrintableHtml(
      form,
      allRenderedSheets,
      layout,
      signaturesOnlyOnLastPage,
      rowsPerPage
    );

    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const printWin = window.open(blobUrl, '_blank');

      if (!printWin) {
        // Popups were blocked by browser or iframe policy -> Open in-app print preview modal fallback
        setIsPrintPreviewOpen(true);
      }
    } catch (e) {
      console.warn('Could not open new print window, opening in-app print modal', e);
      setIsPrintPreviewOpen(true);
    }
  };

  // Intelligent department classifier for items based on keywords and assigned department
  const getItemDepartment = (item: ReceivingItem): string => {
    if (item.department && item.department.trim()) {
      const d = item.department.trim().toUpperCase();
      return d.startsWith('SGHC-') ? d : `SGHC-${d}`;
    }
    const text = `${item.itemBrand} ${item.remarks || ''}`.toLowerCase();
    
    if (text.includes('printer') || text.includes('hard drive') || text.includes('mouse') || text.includes('keyboard') || text.includes('cable') || text.includes('toner') || text.includes('cartridge') || text.includes('router') || text.includes('switch') || text.includes('i.t') || text.includes('computer')) {
      return 'SGHC-I.T.';
    }
    if (text.includes('medicine') || text.includes('paracetamol') || text.includes('advil') || text.includes('biogesic') || text.includes('bioflu') || text.includes('bonamine') || text.includes('diatabs') || text.includes('kremil') || text.includes('neozep') || text.includes('decolgen') || text.includes('flugard') || text.includes('alaxan') || text.includes('medicol') || text.includes('mefenamic') || text.includes('cetirizine') || text.includes('catapres') || text.includes('h.r') || text.includes('clinic')) {
      return 'SGHC-H.R.';
    }
    if (text.includes('tshirt') || text.includes('t-shirt') || text.includes('shirt') || text.includes('souvenir') || text.includes('arrival post card') || text.includes('freedom begins') || text.includes('front office') || text.includes('lounge') || text.includes('keycard') || text.includes('key card')) {
      return 'SGHC-FRONT OFFICE';
    }
    if (text.includes('snorkel') || text.includes('mask') || text.includes('fin') || text.includes('life vest') || text.includes('life jacket') || text.includes('island hopping') || text.includes('tour') || text.includes('boat')) {
      return 'SGHC-TOURS';
    }
    if (text.includes('fuel filter') || text.includes('coaster') || text.includes('van') || text.includes('tire') || text.includes('s&r') || text.includes('transport')) {
      return 'SGHC-TRANSPORT';
    }
    if (text.includes('diesel') || text.includes('genset') || text.includes('fleet') || text.includes('oil filter') || text.includes('engineering') || text.includes('maintenance') || text.includes('light bulb') || text.includes('bulb') || text.includes('paint') || text.includes('pipe') || text.includes('screw') || text.includes('wire') || text.includes('fuse') || text.includes('cement')) {
      return 'SGHC-ENGINEERING';
    }
    if (text.includes('chlorine') || text.includes('alcohol') || text.includes('signage') || text.includes('drum') || text.includes('tin') || text.includes('storage') || text.includes('warehouse')) {
      return 'SGHC-WAREHOUSE';
    }
    if (text.includes('housekeeping') || text.includes(' hk') || text.includes('towel') || text.includes('linen') || text.includes('bedsheet') || text.includes('pillow') || text.includes('soap') || text.includes('shampoo') || text.includes('tissue') || text.includes('detergent') || text.includes('bleach') || text.includes('amenit') || text.includes('slipper') || text.includes('trash bag') || text.includes('garbage bag') || text.includes('mop') || text.includes('broom') || text.includes('cleaning')) {
      return 'SGHC-HOUSEKEEPING';
    }
    if (text.includes('bar ') || text.includes('wine') || text.includes('beer') || text.includes('vodka') || text.includes('whiskey') || text.includes('gin') || text.includes('rum') || text.includes('tequila') || text.includes('liqueur') || text.includes('cocktail') || text.includes('tonic water') || text.includes('soda water') || text.includes('liquor')) {
      return 'SGHC-BAR';
    }
    if (text.includes('spa') || text.includes('massage') || text.includes('essential oil') || text.includes('scrub') || text.includes('aroma')) {
      return 'SGHC-SPA';
    }
    if (text.includes('stewarding') || text.includes('dishwashing') || text.includes('degreaser') || text.includes('rinse aid') || text.includes('sanitizer')) {
      return 'SGHC-STEWARDING';
    }
    if (text.includes('cafeteria') || text.includes('canteen') || text.includes('staff meal')) {
      return 'SGHC-CAFETERIA';
    }

    // Default for all food, produce, groceries, bakery, meat, seafood, perishables, and supplies:
    return 'SGHC-KITCHEN';
  };

  // Calculate live item counts per department
  const deptCounts: Record<string, number> = {};
  form.items.forEach(item => {
    const d = getItemDepartment(item);
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });

  // Dynamically collect all departments present in items + standard list
  const activeDepartments = Array.from(
    new Set([
      ...Object.keys(deptCounts).filter(d => deptCounts[d] > 0),
      ...HOTEL_DEPARTMENTS
    ])
  );

  // Handle department selection
  const handleSelectDept = (dept: string) => {
    setSelectedDept(dept);
    if (dept !== 'ALL') {
      updateHeader('to', dept);
    }
    setActiveScreenTab('all');
  };

  // Batch assign all items in this document to a specific department
  const handleAssignAllToDept = (targetDept: string) => {
    const updatedItems = form.items.map(item => ({
      ...item,
      department: targetDept
    }));
    onChange({
      ...form,
      to: targetDept,
      items: updatedItems
    });
    setSelectedDept(targetDept);
  };

  // Group items by department or filter by selected department
  const getDepartmentGroups = () => {
    // If a specific department is selected, return only items belonging to that department
    if (selectedDept !== 'ALL') {
      const filtered = form.items.filter(item => getItemDepartment(item) === selectedDept);
      return [{ deptName: selectedDept, items: filtered }];
    }

    // If ALL is selected and groupByDept is toggled ON: Split into separate groups per department
    if (groupByDept) {
      const groups: { [key: string]: ReceivingItem[] } = {};
      form.items.forEach(item => {
        const d = getItemDepartment(item);
        if (!groups[d]) groups[d] = [];
        groups[d].push(item);
      });
      return Object.entries(groups).map(([deptName, items]) => ({ deptName, items }));
    }

    // If ALL is selected and groupByDept is OFF: Render all items under the main form.to header
    return [{ deptName: form.to || 'SGHC-KITCHEN', items: form.items }];
  };

  const departmentGroups = getDepartmentGroups();
  const totalItems = form.items.length;
  const currentFilteredCount = selectedDept === 'ALL' 
    ? totalItems 
    : (departmentGroups[0]?.items.length || 0);

  // Calculate pages for a given set of items
  const getPagesForItems = (itemsList: ReceivingItem[]) => {
    const total = itemsList.length;
    const pageCount = Math.max(1, Math.ceil(total / rowsPerPage));
    const pages = [];

    for (let p = 0; p < pageCount; p++) {
      const start = p * rowsPerPage;
      const end = start + rowsPerPage;
      const pageItems = itemsList.slice(start, end);
      const blankCount = Math.max(0, rowsPerPage - pageItems.length);
      const pageBlanks = Array.from({ length: blankCount }, (_, i) => ({
        id: `blank-${p}-${i}`,
        itemBrand: '',
        qty: '' as any,
        uom: '',
        remarks: '',
        department: ''
      }));
      pages.push({ pageIndex: p, pageItems, pageBlanks, totalPages: pageCount });
    }
    return pages;
  };

  // Reusable Single Half-Sheet Form Component
  const renderSingleForm = (
    deptName: string,
    pageItems: ReceivingItem[],
    pageBlanks: any[],
    pageIndex: number,
    totalPages: number,
    copyLabel?: string,
    isInteractive = true
  ) => {
    return (
      <div 
        key={`form-${deptName}-${pageIndex}-${copyLabel || 'main'}`}
        className="w-[5.2in] min-h-[8.1in] max-h-[8.1in] h-[8.1in] bg-white border-[1.5px] border-black p-2 font-sans text-black flex flex-col justify-between select-text shrink-0 box-border text-[11px] leading-tight shadow-md print:shadow-none print:border-black print:p-1.5"
      >
        {/* TOP SECTION: Header & Items Table */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Top Brand & Title Grid */}
          <div className="border border-black grid grid-cols-12 mb-0 shrink-0">
            {/* Left Brand Area (7 cols) */}
            <div className="col-span-7 p-1 border-r border-black flex flex-col justify-center items-center text-center bg-amber-50/20 print:bg-transparent">
              <div className="text-amber-500 font-sunlight text-3xl sm:text-4xl leading-none font-normal drop-shadow-2xs print:text-amber-600">
                Sunlight
              </div>
              <div className="text-[9px] font-extrabold tracking-widest text-amber-900 uppercase font-sans mt-0.5 print:text-black">
                HOTEL, CORON
              </div>
            </div>

            {/* Right Title & Page Area (5 cols) */}
            <div className="col-span-5 flex flex-col justify-center items-center text-center p-1 bg-gray-50/50 print:bg-transparent">
              <div className="font-extrabold text-[12px] tracking-wider uppercase text-black leading-tight">
                STOCK
              </div>
              <div className="font-extrabold text-[12px] tracking-wider uppercase text-black leading-tight">
                RECEIVING
              </div>
              <div className="flex items-center space-x-1 mt-0.5">
                <span className="text-[8px] font-black bg-black text-white print:bg-black print:text-white px-1 rounded-xs tracking-wider uppercase">
                  PAGE {pageIndex + 1} OF {totalPages}
                </span>
                {copyLabel && (
                  <span className="text-[7.5px] font-bold text-gray-500 uppercase tracking-tight">
                    • {copyLabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Metadata Header Box */}
          <div className="border-x border-b border-black text-[9.5px] shrink-0">
            {/* Row 1: FROM & MAHRA # & SGHC */}
            <div className="grid grid-cols-12 border-b border-black">
              <div className="col-span-7 p-1 flex items-center justify-between border-r border-black">
                <div className="flex items-center flex-1 min-w-0 pr-1">
                  <span className="font-extrabold w-11 shrink-0 text-[9px]">FROM:</span>
                  {isInteractive ? (
                    <input
                      type="text"
                      value={form.from}
                      onChange={(e) => updateHeader('from', e.target.value)}
                      placeholder="Supplier / Origin"
                      className="w-full bg-transparent outline-none font-bold text-[9.5px] uppercase px-0.5 focus:bg-amber-50"
                    />
                  ) : (
                    <span className="font-bold text-[9.5px] uppercase truncate">{form.from || '—'}</span>
                  )}
                </div>
                {/* MAHRA # Added to FROM: Section */}
                <div className="flex items-center shrink-0 border-l border-black/40 pl-1.5 ml-1">
                  <span className="font-extrabold text-[8.5px] shrink-0 mr-1 text-gray-800">MAHRA #:</span>
                  {isInteractive ? (
                    <input
                      type="text"
                      value={form.mahraNo || ''}
                      onChange={(e) => updateHeader('mahraNo', e.target.value)}
                      placeholder="MAHRA #"
                      className="w-20 bg-transparent outline-none font-bold text-[9px] uppercase px-0.5 focus:bg-amber-50 text-indigo-900"
                    />
                  ) : (
                    <span className="font-bold text-[9px] uppercase text-indigo-950 print:text-black">
                      {form.mahraNo || '—'}
                    </span>
                  )}
                </div>
              </div>
              <div className="col-span-5 p-1 flex items-center justify-between">
                <div className="flex items-center flex-1 min-w-0">
                  <span className="font-extrabold w-10 shrink-0 text-[9px]">SGHC:</span>
                  {isInteractive ? (
                    <input
                      type="text"
                      value={form.sghcNo}
                      onChange={(e) => updateHeader('sghcNo', e.target.value)}
                      placeholder="SGHC YYYY-MM-0001"
                      className="w-full bg-transparent outline-none font-bold text-[9.5px] uppercase px-0.5 focus:bg-amber-50 text-amber-950"
                    />
                  ) : (
                    <span className="font-bold text-[9.5px] uppercase text-amber-950 print:text-black">{form.sghcNo || '—'}</span>
                  )}
                </div>
                {isInteractive && (
                  <button
                    type="button"
                    onClick={handleGenerateNextSghc}
                    className="no-print p-0.5 text-gray-400 hover:text-amber-700 hover:bg-amber-100 rounded transition shrink-0 ml-1"
                    title="Generate next sequential serialized SGHC code"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: TO & DATE & LOCATION */}
            <div className="grid grid-cols-12 border-b border-black">
              <div className="col-span-7 p-1 flex items-center border-r border-black">
                <span className="font-extrabold w-11 shrink-0 text-[9px]">TO:</span>
                {isInteractive ? (
                  <div className="flex items-center w-full">
                    <input
                      type="text"
                      value={deptName}
                      onChange={(e) => updateHeader('to', e.target.value)}
                      placeholder="SGHC-KITCHEN"
                      className="w-full bg-transparent outline-none font-bold text-[9.5px] uppercase px-0.5 focus:bg-amber-50"
                    />
                  </div>
                ) : (
                  <span className="font-bold text-[9.5px] uppercase text-amber-950 print:text-black">{deptName}</span>
                )}
              </div>
              <div className="col-span-5 p-1 flex items-center">
                <span className="font-extrabold w-10 shrink-0 text-[9px]">DATE:</span>
                {isInteractive ? (
                  <input
                    type="text"
                    value={form.date}
                    onChange={(e) => updateHeader('date', e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-full bg-transparent outline-none font-medium text-[9.5px] px-0.5 focus:bg-amber-50"
                  />
                ) : (
                  <span className="font-medium text-[9.5px]">{form.date}</span>
                )}
              </div>
            </div>

            {/* Row 3: PURPOSE */}
            <div className="p-1 flex items-center">
              <span className="font-extrabold w-16 shrink-0 text-[9px]">PURPOSE:</span>
              {isInteractive ? (
                <input
                  type="text"
                  value={form.purpose}
                  onChange={(e) => updateHeader('purpose', e.target.value)}
                  placeholder="Purpose of transfer / receipt"
                  className="w-full bg-transparent outline-none font-medium text-[9.5px] px-0.5 focus:bg-amber-50"
                />
              ) : (
                <span className="font-medium text-[9.5px]">{form.purpose || '—'}</span>
              )}
            </div>
          </div>

          {/* Full-Height Table Grid that Populates the Entire Page */}
          <div className="border-x border-black flex-1 flex flex-col min-h-0 bg-white">
            <table className="w-full border-collapse table-fixed text-[9px] h-full flex-1">
              <thead>
                <tr className="bg-gray-200 border-b border-black font-extrabold text-[8.5px] uppercase tracking-wider text-center print:bg-gray-200 h-[22px] shrink-0">
                  <th className="py-0.5 px-1 border-r border-b border-black text-left w-[47%]">ITEM/BRAND</th>
                  <th className="py-0.5 px-0.5 border-r border-b border-black w-[13%]">QTY</th>
                  <th className="py-0.5 px-0.5 border-r border-b border-black w-[14%]">UOM</th>
                  <th className="py-0.5 px-1 border-b border-black text-left w-[26%]">REMARKS</th>
                  {isInteractive && (
                    <th className="no-print py-0.5 px-0.5 w-[16px] border-b border-black"></th>
                  )}
                </tr>
              </thead>
              <tbody className="h-[calc(100%-22px)]">
                {/* Populated Rows with Solid Grid Borders */}
                {pageItems.map((item) => (
                  <tr 
                    key={item.id} 
                    style={{ height: `${100 / (pageItems.length + pageBlanks.length)}%` }} 
                    className="hover:bg-amber-50/40"
                  >
                    <td className="px-1 border-r border-b border-black">
                      {isInteractive ? (
                        <div className="flex items-center space-x-1">
                          <input
                            type="text"
                            value={item.itemBrand}
                            onChange={(e) => updateItem(item.id, 'itemBrand', e.target.value)}
                            className="w-full bg-transparent outline-none font-semibold text-[9px] uppercase p-0"
                          />
                          {/* Compact inline department badge / selector */}
                          <select
                            value={getItemDepartment(item)}
                            onChange={(e) => updateItem(item.id, 'department', e.target.value)}
                            className="no-print bg-amber-50 hover:bg-amber-100 border border-amber-300 text-[7px] font-bold text-amber-900 rounded px-1 py-0.2 shrink-0 cursor-pointer focus:outline-none"
                            title="Change this item's department"
                          >
                            {activeDepartments.map(d => (
                              <option key={d} value={d}>{d.replace('SGHC-', '')}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span className="font-semibold text-[8.5px] uppercase block break-words leading-tight" title={item.itemBrand}>{item.itemBrand}</span>
                      )}
                    </td>
                    <td className="px-0.5 border-r border-b border-black text-center">
                      {isInteractive ? (
                        <input
                          type="text"
                          value={item.qty}
                          onChange={(e) => updateItem(item.id, 'qty', e.target.value)}
                          className="w-full bg-transparent outline-none font-bold text-center text-[9px] p-0"
                        />
                      ) : (
                        <span className="font-bold text-[9px]">{item.qty}</span>
                      )}
                    </td>
                    <td className="px-0.5 border-r border-b border-black text-center">
                      {isInteractive ? (
                        <input
                          type="text"
                          value={item.uom}
                          onChange={(e) => updateItem(item.id, 'uom', e.target.value)}
                          className="w-full bg-transparent outline-none text-center uppercase text-[8.5px] font-medium p-0"
                        />
                      ) : (
                        <span className="uppercase text-[8.5px] font-medium">{item.uom}</span>
                      )}
                    </td>
                    <td className="px-1 border-b border-black">
                      {isInteractive ? (
                        <textarea
                          value={item.remarks}
                          rows={1}
                          onChange={(e) => updateItem(item.id, 'remarks', e.target.value)}
                          className="w-full bg-transparent outline-none text-[8.5px] text-gray-700 p-0 resize-none leading-tight block break-words"
                        />
                      ) : (
                        <span className="text-[8px] text-gray-700 block break-words leading-[1.1] max-h-[2.4em] overflow-hidden" title={item.remarks}>{item.remarks}</span>
                      )}
                    </td>
                    {isInteractive && (
                      <td className="no-print px-0.5 border-b border-black text-center">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-red-400 hover:text-red-700 p-0 transition"
                          title="Delete row"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {/* Pad Blank Rows with Clear Grid Lines to Fill Entire Height to Footer */}
                {pageBlanks.map((b) => (
                  <tr 
                    key={b.id} 
                    style={{ height: `${100 / (pageItems.length + pageBlanks.length)}%` }}
                  >
                    <td className="px-1 border-r border-b border-black">&nbsp;</td>
                    <td className="px-0.5 border-r border-b border-black text-center">&nbsp;</td>
                    <td className="px-0.5 border-r border-b border-black text-center">&nbsp;</td>
                    <td className="px-1 border-b border-black">&nbsp;</td>
                    {isInteractive && <td className="no-print border-b border-black">&nbsp;</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* BOTTOM SECTION: Confirmation & Signatures (Shown only on last page) */}
        {(!signaturesOnlyOnLastPage || pageIndex === totalPages - 1) ? (
          <div className="mt-0 shrink-0">
            {/* Confirmation Text */}
            <div className="border-x border-b border-black p-0.5 text-center text-[7.5px] font-medium italic text-black leading-tight bg-gray-50/50 print:bg-transparent">
              This is to confirm that all items listed above are complete in actual number and in good condition
            </div>

            {/* Prepared By & Approved By */}
            <div className="border-x border-b border-black grid grid-cols-2 divide-x divide-black text-[8px]">
              <div className="p-1">
                <span className="font-extrabold uppercase block text-[7px] text-gray-700">PREPARED BY:</span>
                {isInteractive ? (
                  <input
                    type="text"
                    value={form.preparedBy}
                    onChange={(e) => updateHeader('preparedBy', e.target.value)}
                    className="w-full bg-transparent outline-none font-bold uppercase text-[8px] p-0"
                  />
                ) : (
                  <span className="font-bold uppercase">{form.preparedBy}</span>
                )}
              </div>
              <div className="p-1">
                <span className="font-extrabold uppercase block text-[7px] text-gray-700">APPROVED BY:</span>
                {isInteractive ? (
                  <input
                    type="text"
                    value={form.approvedBy}
                    onChange={(e) => updateHeader('approvedBy', e.target.value)}
                    className="w-full bg-transparent outline-none font-bold uppercase text-[8px] p-0"
                  />
                ) : (
                  <span className="font-bold uppercase">{form.approvedBy}</span>
                )}
              </div>
            </div>

            {/* Noted By & Received By */}
            <div className="border-x border-b border-black grid grid-cols-2 divide-x divide-black text-[8px]">
              <div className="p-1 min-h-[24px] flex flex-col justify-between">
                <span className="font-extrabold uppercase block text-[7px] text-gray-700">NOTED BY:</span>
                {isInteractive ? (
                  <input
                    type="text"
                    value={form.notedBy}
                    onChange={(e) => updateHeader('notedBy', e.target.value)}
                    placeholder="Name / Signature"
                    className="w-full bg-transparent outline-none font-semibold uppercase text-[8px] p-0"
                  />
                ) : (
                  <span className="font-semibold uppercase">{form.notedBy}</span>
                )}
              </div>
              <div className="p-1 min-h-[24px] flex flex-col justify-between">
                <span className="font-extrabold uppercase block text-[7px] text-gray-700">RECEIVED BY:</span>
                {isInteractive ? (
                  <input
                    type="text"
                    value={form.receivedBy}
                    onChange={(e) => updateHeader('receivedBy', e.target.value)}
                    placeholder="Name / Signature"
                    className="w-full bg-transparent outline-none font-semibold uppercase text-[8px] p-0"
                  />
                ) : (
                  <span className="font-semibold uppercase">{form.receivedBy}</span>
                )}
              </div>
            </div>
          </div>
        ) : null}

      </div>
    );
  };

  // Compile all rendered forms across all department groups for print and display
  const allRenderedSheets: Array<{
    deptName: string;
    pageItems: ReceivingItem[];
    pageBlanks: any[];
    pageIndex: number;
    totalPages: number;
  }> = [];

  departmentGroups.forEach(group => {
    const pages = getPagesForItems(group.items);
    pages.forEach(p => {
      allRenderedSheets.push({
        deptName: group.deptName,
        pageItems: p.pageItems,
        pageBlanks: p.pageBlanks,
        pageIndex: p.pageIndex,
        totalPages: p.totalPages
      });
    });
  });

  // Group pages into 2-form pairs for landscape bond sheets
  const bondPaperPairs: Array<{
    left: typeof allRenderedSheets[0];
    right: typeof allRenderedSheets[0] | null;
  }> = [];

  if (allRenderedSheets.length === 1) {
    // 1 single sheet: Left = Original, Right = Duplicate
    bondPaperPairs.push({
      left: allRenderedSheets[0],
      right: allRenderedSheets[0]
    });
  } else {
    // 2 or more forms: Pair 1 & 2, 3 & 4 on each bond sheet
    for (let i = 0; i < allRenderedSheets.length; i += 2) {
      bondPaperPairs.push({
        left: allRenderedSheets[i],
        right: i + 1 < allRenderedSheets.length ? allRenderedSheets[i + 1] : null
      });
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto pb-12">
      
      {/* ACTION CONTROL PANEL (Hidden during print) */}
      <div className="no-print mb-6 bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-amber-200/80 space-y-4">
        
        {/* Top toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={onReset}
              className="px-3 py-2 bg-white border border-gray-300 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-400 text-gray-700 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 shadow-xs"
              title="Create a new blank Stock Receiving Form"
            >
              <Plus className="w-4 h-4 text-amber-600" />
              <span>New Blank Form</span>
            </button>
            <button
              onClick={onOpenUpload}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 shadow-xs"
              title="Upload Excel (.xlsx/.xls/.csv), PDF, or Invoice image"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span>AI Parse Excel / Invoice</span>
            </button>
            <button
              onClick={onOpenSaved}
              className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs sm:text-sm font-medium transition flex items-center space-x-1.5"
            >
              <FolderOpen className="w-4 h-4 text-gray-600" />
              <span>Saved Records</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {onOpenGoogleSheets && (
              <button
                onClick={onOpenGoogleSheets}
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 shadow-xs"
                title="Connect, import, or sync with Google Sheets"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>Google Sheets</span>
              </button>
            )}

            <button
              onClick={exportToExcel}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 shadow-xs"
              title="Export all items to formatted Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export Excel</span>
            </button>

            <button
              onClick={onSave}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>Save</span>
            </button>
            
            {/* Primary Print Button with Layout Selector */}
            <div className="flex items-center rounded-xl bg-gray-900 p-0.5 text-white shadow-xs">
              <button
                onClick={() => handlePrint('overflow')}
                className="px-3 py-1.5 hover:bg-gray-800 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition text-amber-300"
                title="Fit 2 forms per landscape short bond paper (Items 1-16 on Left, Items 17-32 on Right)"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Print 2-Up</span>
              </button>
              <span className="text-gray-600">|</span>
              <button
                onClick={() => handlePrint('duplicate')}
                className="px-2.5 py-1.5 hover:bg-gray-800 rounded-lg text-xs font-semibold flex items-center space-x-1 transition text-gray-200"
                title="Print Receiving Copy + Duplicate for each page"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicates</span>
              </button>
              <span className="text-gray-600">|</span>
              <button
                onClick={() => handlePrint('single')}
                className="px-2 py-1.5 hover:bg-gray-800 rounded-lg text-xs font-semibold flex items-center space-x-1 transition text-gray-300"
                title="Print single 5.5 x 8.5 half-sheet"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>1-Up</span>
              </button>
              <span className="text-gray-600">|</span>
              <button
                onClick={() => setIsPrintPreviewOpen(true)}
                className="px-2.5 py-1.5 hover:bg-amber-600/30 rounded-lg text-xs font-semibold flex items-center space-x-1 transition text-amber-300"
                title="Open Interactive Print Preview & PDF Downloader"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            </div>
          </div>
        </div>

        {/* Department Grouping & Presets Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-700">Receiving Dept:</span>
            
            {/* Quick Department Filter/Select Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* ALL Items Button */}
              <button
                onClick={() => handleSelectDept('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition flex items-center space-x-1.5 ${
                  selectedDept === 'ALL'
                    ? 'bg-gray-900 text-white shadow-2xs'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
                title="View all items across all receiving departments"
              >
                <span>ALL ITEMS</span>
                <span className={`text-[10px] px-1 py-0.2 rounded-full font-bold ${selectedDept === 'ALL' ? 'bg-gray-700 text-amber-300' : 'bg-gray-200 text-gray-700'}`}>
                  {totalItems}
                </span>
              </button>

              {/* Department Buttons with Live Item Counts: show all departments that have items + standard presets */}
              {activeDepartments
                .filter(dept => (deptCounts[dept] || 0) > 0 || HOTEL_DEPARTMENTS.slice(0, 4).includes(dept))
                .map(dept => {
                  const count = deptCounts[dept] || 0;
                  const isSelected = selectedDept === dept;
                  return (
                    <button
                      key={dept}
                      onClick={() => handleSelectDept(dept)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition flex items-center space-x-1.5 ${
                        isSelected 
                          ? 'bg-amber-600 text-white shadow-2xs ring-2 ring-amber-400/50' 
                          : count > 0
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 shadow-2xs'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                      title={`Filter form to show only ${dept} items (${count} items)`}
                    >
                      <span>{dept.replace('SGHC-', '')}</span>
                      <span className={`text-[10px] px-1 py-0.2 rounded-full font-bold ${
                        isSelected 
                          ? 'bg-amber-800 text-white' 
                          : count > 0 
                          ? 'bg-amber-200 text-amber-900' 
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}

              {/* All Departments Dropdown with live counts */}
              <select
                value={selectedDept === 'ALL' ? 'ALL' : selectedDept}
                onChange={(e) => handleSelectDept(e.target.value)}
                className="bg-gray-100 border border-gray-300 rounded-md px-2 py-1 text-[11px] font-semibold focus:ring-1 focus:ring-amber-500 text-gray-800 cursor-pointer"
              >
                <option value="ALL">ALL DEPARTMENTS ({totalItems} items)</option>
                {activeDepartments.map(dept => (
                  <option key={dept} value={dept}>
                    {dept} ({deptCounts[dept] || 0} items)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick action to assign all items to current department */}
            {selectedDept !== 'ALL' && totalItems > currentFilteredCount && (
              <button
                onClick={() => handleAssignAllToDept(selectedDept)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition shadow-2xs"
                title={`Assign all ${totalItems} items in this document to ${selectedDept}`}
              >
                Assign All ({totalItems}) to {selectedDept.replace('SGHC-', '')}
              </button>
            )}

            {/* Batch Department Allocator Modal trigger */}
            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 shadow-2xs transition"
              title="Open batch department organizer table to multi-select and move items"
            >
              <Layers className="w-3.5 h-3.5 text-amber-700" />
              <span>Batch Department Allocator</span>
            </button>

            {/* Group by Dept Toggle (when in ALL view) */}
            {selectedDept === 'ALL' && (
              <button
                onClick={() => setGroupByDept(!groupByDept)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border transition ${
                  groupByDept
                    ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-2xs'
                    : 'bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-700'
                }`}
                title="Separate items into distinct full-page forms for each receiving department"
              >
                <Layers className="w-3.5 h-3.5 text-amber-700" />
                <span>{groupByDept ? '✓ Split per Receiving Dept' : 'Split per Receiving Dept'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Notice banner if filtered department currently has 0 items */}
        {selectedDept !== 'ALL' && currentFilteredCount === 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div>
              <strong>No items currently detected for {selectedDept}.</strong> (There are {totalItems} total items in this document).
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleAssignAllToDept(selectedDept)}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold shadow-xs"
              >
                Assign All {totalItems} Items to {selectedDept.replace('SGHC-', '')}
              </button>
              <button
                onClick={addItem}
                className="px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg font-semibold"
              >
                + Add Item for {selectedDept.replace('SGHC-', '')}
              </button>
              <button
                onClick={() => handleSelectDept('ALL')}
                className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold"
              >
                Show All Items
              </button>
            </div>
          </div>
        )}

        {/* Customization, Page Counts & Add Items */}
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-gray-600 pt-1 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={addItem}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-semibold transition flex items-center space-x-1.5 shadow-2xs"
            >
              <Plus className="w-4 h-4 text-amber-700" />
              <span>Add Item Row</span>
            </button>

            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-gray-700">Rows per Form:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="bg-gray-50 border border-gray-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-1 focus:ring-amber-500"
              >
                <option value={14}>14 rows</option>
                <option value={16}>16 rows (Standard Fit)</option>
                <option value={18}>18 rows (Compact)</option>
                <option value={20}>20 rows</option>
              </select>
            </div>

            {/* Signature Placement Toggle */}
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-gray-700">Signatures:</span>
              <button
                onClick={() => setSignaturesOnlyOnLastPage(!signaturesOnlyOnLastPage)}
                className={`px-2 py-1 rounded-md text-xs font-medium border transition ${
                  signaturesOnlyOnLastPage
                    ? 'bg-amber-100 border-amber-400 text-amber-900 font-semibold shadow-2xs'
                    : 'bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-700'
                }`}
                title="Toggle whether the confirmation and signature boxes appear only on the last page"
              >
                {signaturesOnlyOnLastPage ? '✓ Last Page Only' : 'Every Page'}
              </button>
            </div>

            {/* Smart bond paper fit badge */}
            <div className="flex items-center space-x-1.5 bg-amber-100/70 border border-amber-300 text-amber-900 px-2.5 py-1 rounded-lg font-medium text-xs">
              <Layers className="w-3.5 h-3.5 text-amber-700" />
              <span>
                <strong>{totalItems}</strong> items • <strong>{allRenderedSheets.length}</strong> {allRenderedSheets.length === 1 ? 'Form' : 'Forms'} 
                {allRenderedSheets.length <= 2 ? ' (Fits on 1 Bond Paper)' : ` (Fits on ${Math.ceil(allRenderedSheets.length / 2)} Bond Papers)`}
              </span>
            </div>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setZoomLevel(Math.max(70, zoomLevel - 10))}
              className="p-1 hover:bg-gray-100 rounded text-gray-600"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="w-10 text-center font-mono text-[11px]">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(Math.min(130, zoomLevel + 10))}
              className="p-1 hover:bg-gray-100 rounded text-gray-600"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(95)}
              className="p-1 hover:bg-gray-100 rounded text-gray-600"
              title="Reset Zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Multi-Form Screen Navigation Tabs */}
        {allRenderedSheets.length > 1 && (
          <div className="flex items-center space-x-2 pt-2 border-t border-gray-100 overflow-x-auto">
            <span className="text-xs font-bold text-gray-700 shrink-0">View Forms:</span>
            <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setActiveScreenTab('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  activeScreenTab === 'all'
                    ? 'bg-white text-gray-900 shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Side-by-Side (All {allRenderedSheets.length} Forms)
              </button>
              {allRenderedSheets.map((sheet, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveScreenTab(idx)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition flex items-center space-x-1 ${
                    activeScreenTab === idx
                      ? 'bg-white text-amber-800 shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>Form {idx + 1}: {sheet.deptName.replace('SGHC-', '')}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded-full">
                    {sheet.pageItems.length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SCREEN INTERACTIVE LIVE PREVIEW / EDITOR */}
      <div className="no-print bg-gray-200/90 rounded-2xl p-4 sm:p-6 flex flex-col items-center justify-center border border-gray-300 overflow-x-auto min-w-full">
        <div className="text-xs text-gray-600 mb-3 font-medium flex items-center space-x-2">
          <span>Short Bond Paper Preview (11" x 8.5" Landscape):</span>
          <span className="bg-white px-2 py-0.5 rounded shadow-2xs text-gray-800 font-mono text-[11px]">
            {totalItems} total items • {allRenderedSheets.length} {allRenderedSheets.length === 1 ? 'half-sheet form' : 'half-sheet forms'}
          </span>
        </div>

        <div 
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          className="transition-transform duration-150 flex flex-wrap items-start justify-center gap-6"
        >
          {activeScreenTab === 'all' ? (
            // Show all forms side-by-side or paired like on bond paper
            bondPaperPairs.map((pair, bIdx) => (
              <div 
                key={`screen-bond-${bIdx}`}
                className="bg-white p-3 rounded-xl shadow-lg border border-gray-300 flex items-start space-x-4 relative"
              >
                {/* Badge for Bond Sheet */}
                <div className="absolute -top-3 left-4 bg-gray-900 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                  Bond Paper Sheet {bIdx + 1}
                </div>

                {/* Left Form */}
                {renderSingleForm(
                  pair.left.deptName,
                  pair.left.pageItems,
                  pair.left.pageBlanks,
                  pair.left.pageIndex,
                  pair.left.totalPages,
                  allRenderedSheets.length === 1 ? 'RECEIVING COPY' : undefined,
                  true
                )}

                {/* Center Cut Line Indicator */}
                <div className="self-stretch flex flex-col items-center justify-center px-1 border-r border-dashed border-gray-400 my-2">
                  <Scissors className="w-3 h-3 text-gray-400 rotate-90 my-1" />
                </div>

                {/* Right Form */}
                {pair.right !== null ? (
                  renderSingleForm(
                    pair.right.deptName,
                    pair.right.pageItems,
                    pair.right.pageBlanks,
                    pair.right.pageIndex,
                    pair.right.totalPages,
                    allRenderedSheets.length === 1 ? 'DUPLICATE COPY' : undefined,
                    true
                  )
                ) : (
                  // Blank placeholder if odd count
                  <div className="w-[5.2in] min-h-[8.1in] max-h-[8.1in] h-[8.1in] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 p-6 text-center">
                    <span className="text-sm font-semibold">Blank Half-Sheet</span>
                    <span className="text-xs text-gray-400 mt-1">Ready for next overflow / department form</span>
                    <button
                      onClick={addItem}
                      className="mt-3 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold flex items-center space-x-1 border border-amber-200"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Item</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            // Show single active page tab
            <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-300">
              {allRenderedSheets[activeScreenTab] && renderSingleForm(
                allRenderedSheets[activeScreenTab].deptName,
                allRenderedSheets[activeScreenTab].pageItems,
                allRenderedSheets[activeScreenTab].pageBlanks,
                allRenderedSheets[activeScreenTab].pageIndex,
                allRenderedSheets[activeScreenTab].totalPages,
                undefined,
                true
              )}
            </div>
          )}
        </div>
      </div>

      {/* PRINT-ONLY MULTI-SHEET CONTAINER: Generates exact landscape 11" x 8.5" bond papers */}
      <div className="print-only">
        {printLayout === 'overflow' && (
          // Multi-page overflow mode: 2 forms per bond paper sheet
          bondPaperPairs.map((pair, bIdx) => (
            <div key={`print-overflow-${bIdx}`} className="print-page-landscape">
              {/* Left Half-Sheet */}
              <div className="print-half-sheet">
                {renderSingleForm(
                  pair.left.deptName,
                  pair.left.pageItems,
                  pair.left.pageBlanks,
                  pair.left.pageIndex,
                  pair.left.totalPages,
                  allRenderedSheets.length === 1 ? 'RECEIVING COPY' : undefined,
                  false
                )}
              </div>

              {/* Cut Line */}
              <div className="print-cut-line"></div>

              {/* Right Half-Sheet */}
              <div className="print-half-sheet">
                {pair.right !== null ? (
                  renderSingleForm(
                    pair.right.deptName,
                    pair.right.pageItems,
                    pair.right.pageBlanks,
                    pair.right.pageIndex,
                    pair.right.totalPages,
                    allRenderedSheets.length === 1 ? 'DUPLICATE COPY' : undefined,
                    false
                  )
                ) : (
                  renderSingleForm(
                    pair.left.deptName,
                    pair.left.pageItems,
                    pair.left.pageBlanks,
                    pair.left.pageIndex,
                    pair.left.totalPages,
                    'DUPLICATE COPY',
                    false
                  )
                )}
              </div>
            </div>
          ))
        )}

        {printLayout === 'duplicate' && (
          // Duplicate mode: Each form printed with Receiving + Duplicate copy side-by-side
          allRenderedSheets.map((sheet, pIdx) => (
            <div key={`print-dup-${pIdx}`} className="print-page-landscape">
              <div className="print-half-sheet">
                {renderSingleForm(
                  sheet.deptName,
                  sheet.pageItems,
                  sheet.pageBlanks,
                  sheet.pageIndex,
                  sheet.totalPages,
                  'RECEIVING COPY',
                  false
                )}
              </div>
              <div className="print-cut-line"></div>
              <div className="print-half-sheet print-second-copy">
                {renderSingleForm(
                  sheet.deptName,
                  sheet.pageItems,
                  sheet.pageBlanks,
                  sheet.pageIndex,
                  sheet.totalPages,
                  'DUPLICATE COPY',
                  false
                )}
              </div>
            </div>
          ))
        )}

        {printLayout === 'single' && (
          // Single 5.5 x 8.5 half-sheet mode
          allRenderedSheets.map((sheet, pIdx) => (
            <div key={`print-single-${pIdx}`} className="print-page-landscape">
              <div className="print-half-sheet">
                {renderSingleForm(
                  sheet.deptName,
                  sheet.pageItems,
                  sheet.pageBlanks,
                  sheet.pageIndex,
                  sheet.totalPages,
                  undefined,
                  false
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Batch Department Allocator Modal */}
      <BatchDepartmentModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        items={form.items}
        departments={activeDepartments}
        onUpdateItems={(updatedItems) => {
          onChange({
            ...form,
            items: updatedItems
          });
        }}
      />

      {/* Interactive Print & PDF Preview Modal */}
      <PrintPreviewModal
        isOpen={isPrintPreviewOpen}
        onClose={() => setIsPrintPreviewOpen(false)}
        form={form}
        allSheets={allRenderedSheets}
        initialLayout={printLayout}
        signaturesOnlyOnLastPage={signaturesOnlyOnLastPage}
        rowsPerPage={rowsPerPage}
      />

    </div>
  );
}
