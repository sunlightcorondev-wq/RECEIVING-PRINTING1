import { ReceivingFormModel, ReceivingItem } from '../types';

export interface SheetData {
  deptName: string;
  pageItems: ReceivingItem[];
  pageBlanks: any[];
  pageIndex: number;
  totalPages: number;
}

export function generatePrintableHtml(
  form: ReceivingFormModel,
  allSheets: SheetData[],
  layout: 'overflow' | 'duplicate' | 'single',
  signaturesOnlyOnLastPage: boolean = true,
  rowsPerPage: number = 16
): string {
  // Build sheet pairs for 11" x 8.5" landscape paper
  const bondPairs: Array<{ left: SheetData; right: SheetData | null; leftLabel?: string; rightLabel?: string }> = [];

  if (layout === 'duplicate') {
    allSheets.forEach(sheet => {
      bondPairs.push({
        left: sheet,
        right: sheet,
        leftLabel: 'RECEIVING COPY',
        rightLabel: 'DUPLICATE COPY'
      });
    });
  } else if (layout === 'overflow') {
    if (allSheets.length === 1) {
      bondPairs.push({
        left: allSheets[0],
        right: allSheets[0],
        leftLabel: 'RECEIVING COPY',
        rightLabel: 'DUPLICATE COPY'
      });
    } else {
      for (let i = 0; i < allSheets.length; i += 2) {
        bondPairs.push({
          left: allSheets[i],
          right: i + 1 < allSheets.length ? allSheets[i + 1] : null
        });
      }
    }
  } else {
    // Single
    allSheets.forEach(sheet => {
      bondPairs.push({
        left: sheet,
        right: null
      });
    });
  }

  const renderSingleHalfSheetHtml = (
    sheet: SheetData,
    copyLabel?: string
  ): string => {
    const isLastPage = sheet.pageIndex === sheet.totalPages - 1;
    const showSignatures = !signaturesOnlyOnLastPage || isLastPage;

    const populatedRows = sheet.pageItems.map(item => `
      <tr class="table-row">
        <td class="col-item">${escapeHtml(item.itemBrand || '')}</td>
        <td class="col-qty">${item.qty != null && !isNaN(Number(item.qty)) ? item.qty : ''}</td>
        <td class="col-uom">${escapeHtml(item.uom || '')}</td>
        <td class="col-remarks">${escapeHtml(item.remarks || '')}</td>
      </tr>
    `).join('');

    const blankRows = sheet.pageBlanks.map(() => `
      <tr class="table-row">
        <td class="col-item">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-uom">&nbsp;</td>
        <td class="col-remarks">&nbsp;</td>
      </tr>
    `).join('');

    return `
      <div class="half-sheet">
        <!-- TOP SECTION -->
        <div class="top-section">
          <!-- LOGO & TITLE HEADER -->
          <div class="header-grid">
            <div class="header-brand">
              <div class="brand-cursive">Sunlight</div>
              <div class="brand-sub">HOTEL, CORON</div>
            </div>
            <div class="header-title">
              <div class="title-main">STOCK</div>
              <div class="title-main">RECEIVING</div>
              <div class="page-badge-wrap">
                <span class="page-badge">PAGE ${sheet.pageIndex + 1} OF ${sheet.totalPages}</span>
                ${copyLabel ? `<span class="copy-badge">• ${copyLabel}</span>` : ''}
              </div>
            </div>
          </div>

          <!-- METADATA BOX -->
          <div class="meta-box">
            <div class="meta-row border-b">
              <div class="meta-col-7 border-r" style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; overflow: hidden;">
                  <span class="meta-label">FROM:</span>
                  <span class="meta-val uppercase font-bold">${escapeHtml(form.from || '—')}</span>
                </div>
                <div style="display: flex; align-items: center; border-left: 1px solid black; padding-left: 6px; margin-left: 6px; white-space: nowrap;">
                  <span class="meta-label" style="font-size: 8.5px; margin-right: 4px;">MAHRA #:</span>
                  <span class="meta-val uppercase font-bold" style="font-size: 9px;">${escapeHtml(form.mahraNo || '—')}</span>
                </div>
              </div>
              <div class="meta-col-5">
                <span class="meta-label">SGHC:</span>
                <span class="meta-val uppercase font-bold">${escapeHtml(form.sghcNo || '—')}</span>
              </div>
            </div>
            <div class="meta-row border-b">
              <div class="meta-col-7 border-r">
                <span class="meta-label">TO:</span>
                <span class="meta-val uppercase font-bold">${escapeHtml(sheet.deptName || form.to || 'SGHC-KITCHEN')}</span>
              </div>
              <div class="meta-col-5">
                <span class="meta-label">DATE:</span>
                <span class="meta-val">${escapeHtml(form.date || '')}</span>
              </div>
            </div>
            <div class="meta-row">
              <div class="meta-col-12">
                <span class="meta-label">PURPOSE:</span>
                <span class="meta-val">${escapeHtml(form.purpose || '—')}</span>
              </div>
            </div>
          </div>

          <!-- ITEMS TABLE -->
          <div class="table-container">
            <table class="items-table">
              <thead>
                <tr>
                  <th class="th-item">ITEM/BRAND</th>
                  <th class="th-qty">QTY</th>
                  <th class="th-uom">UOM</th>
                  <th class="th-remarks">REMARKS</th>
                </tr>
              </thead>
              <tbody>
                ${populatedRows}
                ${blankRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- BOTTOM SECTION -->
        <div class="bottom-section">
          ${showSignatures ? `
            <div class="confirm-text">
              This is to confirm that all items listed above are complete in actual number and in good condition
            </div>
            <div class="sign-row border-b">
              <div class="sign-col border-r">
                <span class="sign-label">PREPARED BY:</span>
                <span class="sign-val">${escapeHtml(form.preparedBy || 'JEFFERSON SALOM')}</span>
              </div>
              <div class="sign-col">
                <span class="sign-label">APPROVED BY:</span>
                <span class="sign-val">${escapeHtml(form.approvedBy || 'ANGELO LIZARES')}</span>
              </div>
            </div>
            <div class="sign-row">
              <div class="sign-col border-r">
                <span class="sign-label">NOTED BY:</span>
                <span class="sign-val">${escapeHtml(form.notedBy || '')}</span>
              </div>
              <div class="sign-col">
                <span class="sign-label">RECEIVED BY:</span>
                <span class="sign-val">${escapeHtml(form.receivedBy || '')}</span>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  };

  const pagesHtml = bondPairs.map((pair, idx) => `
    <div class="landscape-page ${layout === 'single' ? 'single-mode' : ''}">
      ${renderSingleHalfSheetHtml(pair.left, pair.leftLabel)}
      ${layout !== 'single' ? `
        <div class="cut-line"></div>
        ${pair.right ? renderSingleHalfSheetHtml(pair.right, pair.rightLabel) : renderSingleHalfSheetHtml(pair.left, 'DUPLICATE COPY')}
      ` : ''}
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(form.sghcNo || 'Stock Receiving Form')} - Sunlight Hotel Coron</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Great+Vibes&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    @page {
      size: ${layout === 'single' ? '5.5in 8.5in portrait' : '11in 8.5in landscape'};
      margin: 0.15in;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #525659;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Screen UI Toolbar */
    .screen-toolbar {
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      background: #1e293b;
      color: white;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 1000;
    }

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .toolbar-title {
      font-weight: 700;
      font-size: 15px;
    }

    .toolbar-sub {
      font-size: 12px;
      color: #94a3b8;
    }

    .print-btn {
      background: #d97706;
      hover: #b45309;
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .print-btn:hover {
      background: #b45309;
    }

    .close-btn {
      background: #334155;
      color: #cbd5e1;
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
    }
    .close-btn:hover {
      background: #475569;
      color: #fff;
    }

    .pages-container {
      padding: 24px 16px 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }

    /* Landscape Sheet */
    .landscape-page {
      width: 10.6in;
      height: 8.1in;
      max-height: 8.1in;
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      padding: 0;
      box-sizing: border-box;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .landscape-page.single-mode {
      width: 5.2in;
      height: 8.1in;
    }

    .half-sheet {
      width: 5.2in;
      height: 8.1in;
      max-height: 8.1in;
      border: 1.5px solid #000;
      padding: 0.12in;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      background: #fff;
    }

    .cut-line {
      width: 0px;
      border-right: 1.5px dashed #666;
      margin: 0 0.08in;
      height: 8.1in;
      box-sizing: border-box;
    }

    .top-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    /* Brand & Header */
    .header-grid {
      border: 1px solid #000;
      display: grid;
      grid-template-columns: 7fr 5fr;
    }

    .header-brand {
      border-right: 1px solid #000;
      padding: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .brand-cursive {
      font-family: 'Great Vibes', 'Alex Brush', cursive;
      font-size: 32px;
      line-height: 1;
      color: #d97706;
    }

    .brand-sub {
      font-size: 8.5px;
      font-weight: 900;
      letter-spacing: 0.12em;
      color: #78350f;
      text-transform: uppercase;
      margin-top: 1px;
    }

    .header-title {
      padding: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: #f8fafc;
    }

    .title-main {
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.05em;
      line-height: 1.1;
      text-transform: uppercase;
    }

    .page-badge-wrap {
      display: flex;
      align-items: center;
      gap: 3px;
      margin-top: 2px;
    }

    .page-badge {
      background: #000;
      color: #fff;
      font-size: 7.5px;
      font-weight: 900;
      padding: 1px 4px;
      border-radius: 2px;
      letter-spacing: 0.05em;
    }

    .copy-badge {
      font-size: 7.5px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
    }

    /* Meta Box */
    .meta-box {
      border-left: 1px solid #000;
      border-right: 1px solid #000;
      border-bottom: 1px solid #000;
      font-size: 9px;
    }

    .meta-row {
      display: flex;
      width: 100%;
    }

    .border-b { border-bottom: 1px solid #000; }
    .border-r { border-right: 1px solid #000; }

    .meta-col-7 { width: 58.33%; padding: 3px 4px; display: flex; align-items: center; }
    .meta-col-5 { width: 41.67%; padding: 3px 4px; display: flex; align-items: center; }
    .meta-col-12 { width: 100%; padding: 3px 4px; display: flex; align-items: center; }

    .meta-label {
      font-weight: 900;
      font-size: 8.5px;
      margin-right: 4px;
      flex-shrink: 0;
    }

    .meta-val {
      font-size: 9px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .font-bold { font-weight: 700; }
    .uppercase { text-transform: uppercase; }

    /* Table Container */
    .table-container {
      border-left: 1px solid #000;
      border-right: 1px solid #000;
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .items-table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 8.5px;
    }

    .items-table thead tr {
      background: #e2e8f0;
      height: 20px;
    }

    .items-table th {
      border-bottom: 1px solid #000;
      border-right: 1px solid #000;
      padding: 2px 3px;
      font-size: 8px;
      font-weight: 900;
      text-align: center;
      letter-spacing: 0.03em;
    }
    .items-table th:last-child { border-right: none; }

    .th-item { width: 48%; text-align: left !important; padding-left: 4px !important; }
    .th-qty { width: 13%; }
    .th-uom { width: 13%; }
    .th-remarks { width: 26%; text-align: left !important; padding-left: 4px !important; }

    .table-row {
      height: calc(100% / ${rowsPerPage});
    }

    .items-table td {
      border-bottom: 1px solid #000;
      border-right: 1px solid #000;
      padding: 0 3px;
      line-height: 1.1;
      vertical-align: middle;
    }
    .items-table td:last-child { border-right: none; }

    .col-item {
      font-weight: 700;
      font-size: 8.5px;
      text-transform: uppercase;
      word-break: break-word;
      overflow-wrap: break-word;
      line-height: 1.15;
    }

    .col-qty {
      font-weight: 800;
      text-align: center;
      font-size: 8.5px;
    }

    .col-uom {
      text-align: center;
      text-transform: uppercase;
      font-size: 8px;
      font-weight: 600;
    }

    .col-remarks {
      font-size: 8px;
      color: #1e293b;
      word-break: break-word;
      overflow-wrap: break-word;
      line-height: 1.15;
    }

    /* Bottom Section */
    .bottom-section {
      flex-shrink: 0;
    }

    .confirm-text {
      border-left: 1px solid #000;
      border-right: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 2px 3px;
      text-align: center;
      font-size: 7px;
      font-style: italic;
      line-height: 1.1;
      background: #f8fafc;
    }

    .sign-row {
      border-left: 1px solid #000;
      border-right: 1px solid #000;
      border-bottom: 1px solid #000;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .sign-col {
      padding: 2px 4px;
      min-height: 22px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .sign-label {
      font-size: 6.5px;
      font-weight: 900;
      color: #475569;
      text-transform: uppercase;
    }

    .sign-val {
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .cont-box {
      border-left: 1px solid #000;
      border-right: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 4px;
      text-align: center;
      font-size: 7.5px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #f1f5f9;
    }

    /* Print Overrides */
    @media print {
      body {
        background: #ffffff !important;
      }
      .no-print, .screen-toolbar {
        display: none !important;
      }
      .pages-container {
        padding: 0 !important;
        gap: 0 !important;
      }
      .landscape-page {
        box-shadow: none !important;
        margin: 0 auto !important;
      }
    }
  </style>
</head>
<body>
  <div class="screen-toolbar no-print">
    <div class="toolbar-left">
      <div>
        <div class="toolbar-title">${escapeHtml(form.sghcNo || 'Stock Receiving Form')}</div>
        <div class="toolbar-sub">Sunlight Hotel Coron • ${layout === 'overflow' ? '2-Up (2 Forms per Sheet)' : layout === 'duplicate' ? 'Duplicate Mode' : 'Single 1-Up'}</div>
      </div>
    </div>
    <div style="display: flex; gap: 8px;">
      <button onclick="window.print()" class="print-btn">
        🖨️ Print Now (or Save PDF)
      </button>
      <button onclick="window.close()" class="close-btn">
        Close Window
      </button>
    </div>
  </div>

  <div class="pages-container">
    ${pagesHtml}
  </div>

  <script>
    // Auto-trigger print dialog when document loads
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.print();
        } catch(e) {
          console.error(e);
        }
      }, 350);
    });
  </script>
</body>
</html>
  `;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
