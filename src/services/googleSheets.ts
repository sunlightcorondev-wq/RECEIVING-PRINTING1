import { ReceivingFormModel, ReceivingItem } from '../types';

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  index: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SheetTabInfo[];
}

/**
 * Extracts a spreadsheet ID from a Google Sheets URL or raw ID string
 * E.g. https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0
 */
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pattern for /d/{spreadsheetId}/
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // If plain ID
  if (/^[a-zA-Z0-9-_]{20,80}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Fetch spreadsheet metadata and list of sheet tabs
 */
export async function fetchSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,spreadsheetUrl,sheets.properties(sheetId,title,index)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(`Failed to load Google Sheet: ${message}`);
  }

  const data = await response.json();
  const sheets: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
    sheetId: s.properties?.sheetId || 0,
    title: s.properties?.title || 'Sheet1',
    index: s.properties?.index || 0,
  }));

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Untitled Spreadsheet',
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheets,
  };
}

/**
 * Read all cell values from a specific sheet/tab in a spreadsheet
 */
export async function readSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<any[][]> {
  // Read full tab values
  const encodedTitle = encodeURIComponent(sheetTitle);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodedTitle}'!A1:Z1000`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(`Failed to read sheet tab '${sheetTitle}': ${message}`);
  }

  const data = await response.json();
  return data.values || [];
}

/**
 * Parse 2D row array from Google Sheets into a ReceivingFormModel
 */
export function parseSheetRowsToReceivingForm(
  rows: any[][],
  sheetTitle: string,
  tabTitle: string
): ReceivingFormModel {
  if (!rows || rows.length === 0) {
    throw new Error('The selected sheet tab is empty.');
  }

  const cleanTitle = tabTitle || sheetTitle || 'Google Sheet';
  let detectedMainDept = 'SGHC-KITCHEN';
  let detectedPo = `SGHC ${new Date().toISOString().split('T')[0].slice(0, 7)}-0001`;
  let detectedLocation: 'MNL' | 'SETIR' = 'SETIR';

  // Find header row index and column positions
  let headerRowIdx = -1;
  let descCol = -1;
  let qtyCol = -1;
  let uomCol = -1;
  let deptCol = -1;
  let remarksCol = -1;
  let poCol = -1;
  let expiryCol = -1;

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const rowLower = row.map(c => String(c || '').toLowerCase().trim());

    const hasItem = rowLower.some(c => c.includes('item') || c.includes('desc') || c.includes('particular') || c.includes('product') || c.includes('brand') || c.includes('material') || c.includes('article'));
    const hasQty = rowLower.some(c => c.includes('qty') || c.includes('quantity') || c.includes('count') || c.includes('pieces'));

    if (hasItem || hasQty) {
      headerRowIdx = r;
      rowLower.forEach((col, idx) => {
        if (col.includes('item') || col.includes('desc') || col.includes('particular') || col.includes('product') || col.includes('brand') || col.includes('material') || col.includes('article')) {
          if (descCol === -1) descCol = idx;
        } else if (col.includes('qty') || col.includes('quantity') || col.includes('count')) {
          if (qtyCol === -1) qtyCol = idx;
        } else if (col.includes('uom') || col.includes('unit') || col.includes('pkg') || col.includes('packaging')) {
          if (uomCol === -1) uomCol = idx;
        } else if (col.includes('dept') || col.includes('department') || col.includes('destination') || col.includes('to')) {
          if (deptCol === -1) deptCol = idx;
        } else if (col.includes('po') || col.includes('sghc') || col.includes('reference') || col.includes('ref')) {
          if (poCol === -1) poCol = idx;
        } else if (col.includes('exp')) {
          if (expiryCol === -1) expiryCol = idx;
        } else if (col.includes('remark') || col.includes('note') || col.includes('handler') || col.includes('c/o')) {
          if (remarksCol === -1) remarksCol = idx;
        }
      });
      break;
    }
  }

  // Fallback column heuristics if no header row found
  if (descCol === -1) {
    let bestTextCol = 0;
    let maxTextScore = 0;
    let bestNumCol = 1;
    let maxNumScore = 0;

    const sample = rows.slice(0, Math.min(rows.length, 10));
    const maxCols = Math.max(...sample.map(r => r.length), 3);

    for (let c = 0; c < maxCols; c++) {
      let textLen = 0;
      let numCount = 0;
      sample.forEach(row => {
        const val = row[c];
        if (val !== undefined && val !== null && val !== '') {
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
  let currentSectionDept = tabTitle.toUpperCase().startsWith('SGHC-') 
    ? tabTitle.toUpperCase() 
    : (tabTitle.toUpperCase().includes('KITCHEN') ? 'SGHC-KITCHEN' : 'SGHC-' + tabTitle.toUpperCase());

  const items: ReceivingItem[] = [];

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const desc = String(row[descCol] || '').trim();
    if (!desc) continue;

    const upperDesc = desc.toUpperCase();

    // Check for section banners (e.g. SGHC-MAIN KITCHEN PAR STOCK, SGHC-WAREHOUSE PAR STOCK, SGHC-FRONT OFFICE)
    const isSectionBanner = (
      upperDesc.startsWith('SGHC-') ||
      upperDesc.includes('PAR STOCK') ||
      upperDesc.includes('PACKING LIST') ||
      upperDesc.includes('MAIN KITCHEN') ||
      upperDesc.includes('FRONT OFFICE') ||
      upperDesc.includes('AIRPORT LOUNGE') ||
      upperDesc.includes('KANATEN') ||
      upperDesc.includes('I.T DEPT') ||
      upperDesc.includes('H.R DEPT') ||
      upperDesc.includes('ISLAND HOPPING') ||
      upperDesc.includes('COASTERS') ||
      upperDesc.includes('FLEET & GENSET') ||
      upperDesc.includes('HOUSEKEEPING') ||
      upperDesc.includes('BAR') ||
      upperDesc.includes('PASTRY')
    );

    if (isSectionBanner) {
      if (upperDesc.includes('KITCHEN')) currentSectionDept = 'SGHC-KITCHEN';
      else if (upperDesc.includes('CAFETERIA')) currentSectionDept = 'SGHC-CAFETERIA';
      else if (upperDesc.includes('FRONT OFFICE')) currentSectionDept = 'SGHC-FRONT OFFICE';
      else if (upperDesc.includes('I.T')) currentSectionDept = 'SGHC-I.T.';
      else if (upperDesc.includes('H.R')) currentSectionDept = 'SGHC-H.R.';
      else if (upperDesc.includes('TOURS') || upperDesc.includes('ISLAND HOPPING')) currentSectionDept = 'SGHC-TOURS';
      else if (upperDesc.includes('COASTERS') || upperDesc.includes('TRANSPORT')) currentSectionDept = 'SGHC-TRANSPORT';
      else if (upperDesc.includes('FLEET') || upperDesc.includes('GENSET') || upperDesc.includes('ENGINEERING')) currentSectionDept = 'SGHC-ENGINEERING';
      else if (upperDesc.includes('HOUSEKEEPING')) currentSectionDept = 'SGHC-HOUSEKEEPING';
      else if (upperDesc.includes('BAR')) currentSectionDept = 'SGHC-BAR';
      else if (upperDesc.includes('PASTRY')) currentSectionDept = 'SGHC-PASTRY';
      else if (upperDesc.includes('WAREHOUSE')) currentSectionDept = 'SGHC-WAREHOUSE';
      else if (upperDesc.startsWith('SGHC-')) currentSectionDept = upperDesc.split(' ')[0].trim();

      const rawQty = row[qtyCol];
      if (rawQty === undefined || rawQty === '' || isNaN(Number(rawQty))) {
        continue; // skip pure header banner
      }
    }

    if (desc.toLowerCase().includes('total') || desc.toLowerCase().startsWith('prepared by') || desc.toLowerCase().startsWith('approved')) {
      continue;
    }

    const rawQty = row[qtyCol];
    const parsedQty = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty).replace(/[^0-9.]/g, '')) || 1;
    const uom = String(row[uomCol] || 'PCS').trim().toUpperCase() || 'PCS';

    const remarksParts: string[] = [];
    if (poCol >= 0 && row[poCol]) {
      const poVal = String(row[poCol]).trim();
      if (poVal) {
        detectedPo = poVal;
        if (poVal.toUpperCase().includes('MNL')) detectedLocation = 'MNL';
        remarksParts.push(`PO# ${poVal}`);
      }
    }
    if (expiryCol >= 0 && row[expiryCol]) {
      const expVal = String(row[expiryCol]).trim();
      if (expVal && expVal.toLowerCase() !== 'n/a' && expVal !== '-') {
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
        itemDept = customDept.startsWith('SGHC-') ? customDept : 'SGHC-' + customDept;
      }
    }

    if (detectedMainDept === 'SGHC-KITCHEN' && itemDept !== 'SGHC-KITCHEN') {
      detectedMainDept = itemDept;
    }

    items.push({
      id: `item-${r}-${Date.now()}`,
      itemBrand: desc.toUpperCase(),
      qty: parsedQty,
      uom: uom,
      remarks: remarksParts.join(' - '),
      department: itemDept,
    });
  }

  if (items.length === 0) {
    throw new Error(`No item rows could be parsed from sheet tab '${tabTitle}'. Please verify the sheet content.`);
  }

  return {
    id: `rec-sheet-${Date.now()}`,
    title: `Stock Receiving - ${cleanTitle}`,
    from: 'SGHC-WAREHOUSE PAR STOCK',
    to: detectedMainDept,
    sghcNo: detectedPo,
    date: new Date().toISOString().split('T')[0],
    location: detectedLocation,
    purpose: `Stock Transfer from Google Sheet (${cleanTitle})`,
    items,
    preparedBy: 'JEFFERSON SALOM',
    approvedBy: 'ANGELO LIZARES',
    notedBy: '',
    receivedBy: '',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Export current Stock Receiving Form to a new or existing Google Spreadsheet
 */
export async function exportFormToGoogleSheet(
  accessToken: string,
  form: ReceivingFormModel,
  targetSpreadsheetId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; sheetTitle: string }> {
  const sheetTitle = (form.sghcNo || form.title || 'Stock Receiving')
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
    .slice(0, 50);

  // Prepare formatted rows
  const headerRows = [
    ['SUNLIGHT HOTEL, CORON - STOCK RECEIVING COPY'],
    [`Document Ref: ${form.sghcNo || 'N/A'}`, `Date: ${form.date}`, `Location: ${form.location}`],
    [`From: ${form.from}`, `To: ${form.to}`, `Purpose: ${form.purpose}`],
    [],
    ['#', 'ITEM DESCRIPTION / BRAND', 'QTY', 'UOM', 'DEPARTMENT', 'REMARKS']
  ];

  const itemRows = form.items.map((item, idx) => [
    idx + 1,
    item.itemBrand,
    item.qty,
    item.uom,
    item.department || form.to || 'GENERAL',
    item.remarks || ''
  ]);

  const signatoryRows = [
    [],
    ['Signatures & Authorization:'],
    ['Prepared By:', form.preparedBy || 'JEFFERSON SALOM', 'Approved By:', form.approvedBy || 'ANGELO LIZARES'],
    ['Noted By:', form.notedBy || '', 'Received By:', form.receivedBy || '']
  ];

  const allRows = [...headerRows, ...itemRows, ...signatoryRows];

  if (targetSpreadsheetId) {
    // Append to existing spreadsheet: Add a new sheet/tab
    const cleanId = extractSpreadsheetId(targetSpreadsheetId) || targetSpreadsheetId;
    
    // Add a new sheet tab to the existing spreadsheet
    const addSheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: `${sheetTitle} (${new Date().toLocaleDateString().replace(/\//g, '-')})`,
                },
              },
            },
          ],
        }),
      }
    );

    let tabName = sheetTitle;
    if (addSheetResponse.ok) {
      const addedData = await addSheetResponse.json();
      tabName = addedData?.replies?.[0]?.addSheet?.properties?.title || sheetTitle;
    } else {
      // If adding sheet tab failed (e.g. duplicate title), fetch first sheet title
      const meta = await fetchSpreadsheetMetadata(accessToken, cleanId);
      tabName = meta.sheets[0]?.title || 'Sheet1';
    }

    // Write values into the sheet tab
    const appendResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/'${encodeURIComponent(tabName)}'!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: allRows,
        }),
      }
    );

    if (!appendResponse.ok) {
      const err = await appendResponse.json().catch(() => ({}));
      throw new Error(`Failed to write to Google Sheet: ${err?.error?.message || appendResponse.statusText}`);
    }

    return {
      spreadsheetId: cleanId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
      sheetTitle: tabName,
    };
  } else {
    // Create a brand new Google Spreadsheet
    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `SGHC Stock Receiving - ${form.sghcNo || form.title || new Date().toISOString().split('T')[0]}`,
        },
        sheets: [
          {
            properties: {
              title: sheetTitle,
              gridProperties: {
                rowCount: allRows.length + 10,
                columnCount: 10,
              },
            },
            data: [
              {
                startRow: 0,
                startColumn: 0,
                rowData: allRows.map(row => ({
                  values: row.map(cell => ({
                    userEnteredValue: typeof cell === 'number' ? { numberValue: cell } : { stringValue: String(cell ?? '') },
                  })),
                })),
              },
            ],
          },
        ],
      }),
    });

    if (!createResponse.ok) {
      const err = await createResponse.json().catch(() => ({}));
      throw new Error(`Failed to create Google Spreadsheet: ${err?.error?.message || createResponse.statusText}`);
    }

    const createdData = await createResponse.json();
    return {
      spreadsheetId: createdData.spreadsheetId,
      spreadsheetUrl: createdData.spreadsheetUrl,
      sheetTitle,
    };
  }
}
