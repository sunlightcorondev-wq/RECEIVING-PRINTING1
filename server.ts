import express from "express";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
import * as XLSX from "xlsx";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini client server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Helper to determine if file is Excel / Spreadsheet
function isExcelOrSpreadsheet(filename: string = "", mimetype: string = ""): boolean {
  const lowerName = filename.toLowerCase();
  const lowerMime = mimetype.toLowerCase();
  return (
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".tsv") ||
    lowerName.endsWith(".ods") ||
    lowerMime.includes("spreadsheet") ||
    lowerMime.includes("excel") ||
    lowerMime.includes("csv")
  );
}

// Convert Excel Buffer to structured text representation
function parseExcelToText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  let fullText = "";

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csvContent = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    fullText += `--- SHEET: ${sheetName} ---\n${csvContent}\n\n`;
  });

  return fullText;
}

// Deterministic spreadsheet parser for Excel / CSV files when AI is unavailable or offline
function parseExcelDirectly(buffer: Buffer, filename: string = "") {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const allItems: Array<{ itemBrand: string; qty: number; uom: string; remarks: string; department?: string }> = [];
    const cleanFileName = filename ? filename.replace(/\.[^/.]+$/, "").trim() : "";
    let detectedPo = cleanFileName || "SGHC 2026-06-0001";
    let detectedLocation: "MNL" | "SETIR" = "SETIR";
    let detectedMainTo = "SGHC-KITCHEN";

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;

      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (!rawRows || rawRows.length === 0) return;

      let sheetDept = sheetName.trim().toUpperCase();
      if (!sheetDept.startsWith("SGHC-") && !sheetDept.startsWith("SHEET")) {
        sheetDept = "SGHC-" + sheetDept;
      }

      let headerRowIdx = -1;
      let descCol = -1;
      let qtyCol = -1;
      let uomCol = -1;
      let poCol = -1;
      let remarksCol = -1;
      let expiryCol = -1;
      let deptCol = -1;

      // Search for header row
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

      if (descCol === -1) descCol = 0;
      if (qtyCol === -1) qtyCol = 1;
      if (uomCol === -1) uomCol = 2;

      const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 1;
      let currentSectionDept = sheetDept.startsWith("SHEET") ? "SGHC-KITCHEN" : sheetDept;

      for (let r = startRow; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        const desc = String(row[descCol] || "").trim();
        if (!desc || desc.toLowerCase().includes("total") || desc.toLowerCase().startsWith("prepared by") || desc.toLowerCase().startsWith("approved")) {
          continue;
        }

        // Check if this row is a section header like "SGHC-MAIN KITCHEN PAR STOCK (2 BROWN BOXES)", "SGHC-WAREHOUSE PAR STOCK", "SGHC-CAFETERIA PAR STOCK", "SGHC-FRONT OFFICE KANATEN / AIRPORT LOUNGE (2 BUNDLES)", "SGHC-I.T DEPT. FOR CHRISTER DUSONG", "SGHC-H.R DEPT. PAR STOCK FOR STAFF MEDICINE (1 PLASTIC)", "SGHC-FOR ISLAND HOPPING TOUR...", "SGHC-S&R FOR 3 COASTERS", "SGHC-TOURS C/O SNR", "SGHC-FOR FLEET & GENSET"
        const upperDesc = desc.toUpperCase();
        const isSectionHeader = (
          upperDesc.includes("PAR STOCK") || 
          upperDesc.includes("PACKING LIST") || 
          upperDesc.startsWith("SGHC-") || 
          upperDesc.includes("MAIN KITCHEN") ||
          upperDesc.includes("FRONT OFFICE") ||
          upperDesc.includes("AIRPORT LOUNGE") ||
          upperDesc.includes("I.T DEPT") ||
          upperDesc.includes("I.T.") ||
          upperDesc.includes("H.R DEPT") ||
          upperDesc.includes("H.R.") ||
          upperDesc.includes("STAFF MEDICINE") ||
          upperDesc.includes("ISLAND HOPPING") ||
          upperDesc.includes("TOURS") ||
          upperDesc.includes("COASTERS") ||
          upperDesc.includes("FLEET & GENSET") ||
          upperDesc.includes("S&R")
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

          // If this row has no quantity and looks like a section header, skip adding it as an item
          const rawQtyCheck = row[qtyCol];
          if (!rawQtyCheck || String(rawQtyCheck).trim() === "" || isNaN(Number(rawQtyCheck))) {
            continue;
          }
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

        if (detectedMainTo === "SGHC-KITCHEN" && itemDept !== "SGHC-KITCHEN" && itemDept !== "SGHC-WAREHOUSE") {
          detectedMainTo = itemDept;
        }

        allItems.push({
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
      from: "SGHC-WAREHOUSE PAR STOCK",
      to: detectedMainTo,
      sghcNo: detectedPo,
      date: new Date().toISOString().split("T")[0],
      location: detectedLocation,
      purpose: "Stock Replenishment",
      items: allItems,
      preparedBy: "JEFFERSON SALOM",
      approvedBy: "ANGELO LIZARES",
      notedBy: "",
      receivedBy: ""
    };
  } catch (e) {
    console.error("Direct Excel parsing error:", e);
    return null;
  }
}

// Robust JSON parsing with intelligent cleanup, repair, and regex recovery for long output sequences
function robustParseJson(rawText: string): any {
  if (!rawText || !rawText.trim()) return null;
  let text = rawText.trim();

  // 1. Strip all Markdown code fences (```json ... ``` or ``` ...)
  text = text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/m, "").trim();

  // Also strip any embedded code fences
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  // 2. Direct standard parse attempt
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (e) {
    // Continue to repair strategies
  }

  // 3. Locate first JSON object bracket
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return null;
  text = text.substring(firstBrace);

  // Strategy A: Try parsing from first '{' to last '}'
  try {
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > 0) {
      const candidate = text.substring(0, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (e) {
    // Continue to next strategy
  }

  // Strategy B: If JSON was truncated at token limit, cut back to the last complete item object '}' and balance brackets
  try {
    const lastObjectClose = text.lastIndexOf('}');
    if (lastObjectClose > 0) {
      let candidate = text.substring(0, lastObjectClose + 1);

      // Clean up any trailing comma after the last object before array close
      candidate = candidate.replace(/,\s*$/, "");

      // Count brackets and braces
      const openBrackets = (candidate.match(/\[/g) || []).length;
      const closeBrackets = (candidate.match(/\]/g) || []).length;
      if (openBrackets > closeBrackets) {
        candidate += "]".repeat(openBrackets - closeBrackets);
      }

      const openBraces = (candidate.match(/\{/g) || []).length;
      const closeBraces = (candidate.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        candidate += "}".repeat(openBraces - closeBraces);
      }

      const repaired = JSON.parse(candidate);
      if (repaired && (Array.isArray(repaired.items) || repaired.from || repaired.to)) {
        return repaired;
      }
    }
  } catch (repairErr) {
    // Continue to regex recovery
  }

  // Strategy C: Flexible regex-based extraction of items if JSON structure was truncated or broken
  try {
    // Matches itemBrand, qty, uom, and optional remarks / department
    const itemRegex = /"itemBrand"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"qty"\s*:\s*([0-9.]+)\s*,\s*"uom"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"(?:[^{}]*?"remarks"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)")?(?:[^{}]*?"department"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)")?/g;
    const recoveredItems: any[] = [];
    let match;

    while ((match = itemRegex.exec(text)) !== null) {
      const itemBrand = (match[1] || "").replace(/\\"/g, '"').trim();
      const qty = parseFloat(match[2]) || 1;
      const uom = (match[3] || "PCS").replace(/\\"/g, '"').trim().toUpperCase() || "PCS";
      const remarks = (match[4] || "").replace(/\\"/g, '"').trim();
      const department = (match[5] || "SGHC-KITCHEN").replace(/\\"/g, '"').trim();

      if (itemBrand) {
        recoveredItems.push({
          itemBrand,
          qty,
          uom,
          remarks,
          department: department || "SGHC-KITCHEN"
        });
      }
    }

    if (recoveredItems.length > 0) {
      // Also extract header fields if present
      const fromMatch = text.match(/"from"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const toMatch = text.match(/"to"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const sghcNoMatch = text.match(/"sghcNo"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const dateMatch = text.match(/"date"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const locationMatch = text.match(/"location"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const purposeMatch = text.match(/"purpose"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);

        return {
          from: fromMatch ? fromMatch[1].replace(/\\"/g, '"') : "SGHC-WAREHOUSE PAR STOCK",
          mahraNo: text.match(/"mahraNo"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/)?.[1]?.replace(/\\"/g, '"') || "",
          to: toMatch ? toMatch[1].replace(/\\"/g, '"') : "SGHC-KITCHEN",
          sghcNo: sghcNoMatch ? sghcNoMatch[1].replace(/\\"/g, '"') : "SGHC 2026-06-0001",
          date: dateMatch ? dateMatch[1] : new Date().toISOString().split("T")[0],
          location: (locationMatch && locationMatch[1].includes("MNL")) ? "MNL" : "SETIR",
          purpose: purposeMatch ? purposeMatch[1].replace(/\\"/g, '"') : "Stock Replenishment",
          items: recoveredItems,
          preparedBy: "JEFFERSON SALOM",
          approvedBy: "ANGELO LIZARES",
          notedBy: "",
          receivedBy: ""
        };
    }
  } catch (regexErr) {
    console.error("Regex recovery error:", regexErr);
  }

  return null;
}

// Helper to normalize and standardize department codes and filter out accidental section header items
function normalizeAndStandardizeItems(items: any[]): any[] {
  if (!Array.isArray(items)) return [];
  const normalized: any[] = [];
  let currentDept = "SGHC-KITCHEN";

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const itemBrand = String(item.itemBrand || "").trim();
    if (!itemBrand) continue;

    const upperBrand = itemBrand.toUpperCase();

    // Check if this item is actually a section banner header row that Gemini accidentally captured as an item
    const isSectionBanner = (
      (upperBrand.startsWith("SGHC-") && (upperBrand.includes("PAR STOCK") || upperBrand.includes("DEPT") || upperBrand.includes("KANATEN") || upperBrand.includes("FOR "))) ||
      upperBrand.includes("PACKING LIST (TRANSMITTAL)") ||
      upperBrand.includes("PAR STOCK (2 BROWN BOXES)") ||
      upperBrand.includes("PAR STOCK (2 BOXES)") ||
      upperBrand.includes("PAR STOCK FOR STAFF MEDICINE") ||
      upperBrand.includes("AIRPORT LOUNGE (2 BUNDLES)") ||
      upperBrand.includes("FOR ISLAND HOPPING TOUR") ||
      upperBrand.includes("FOR 3 COASTERS") ||
      upperBrand.includes("FOR FLEET & GENSET")
    );

    if (isSectionBanner) {
      if (upperBrand.includes("KITCHEN")) currentDept = "SGHC-KITCHEN";
      else if (upperBrand.includes("CAFETERIA") || upperBrand.includes("CANTEEN")) currentDept = "SGHC-CAFETERIA";
      else if (upperBrand.includes("FRONT OFFICE") || upperBrand.includes("KANATEN") || upperBrand.includes("AIRPORT LOUNGE")) currentDept = "SGHC-FRONT OFFICE";
      else if (upperBrand.includes("I.T") || upperBrand.includes("IT DEPT")) currentDept = "SGHC-I.T.";
      else if (upperBrand.includes("H.R") || upperBrand.includes("HR DEPT") || upperBrand.includes("MEDICINE")) currentDept = "SGHC-H.R.";
      else if (upperBrand.includes("ISLAND HOPPING") || upperBrand.includes("TOURS")) currentDept = "SGHC-TOURS";
      else if (upperBrand.includes("COASTERS") || upperBrand.includes("S&R") || upperBrand.includes("TRANSPORT")) currentDept = "SGHC-TRANSPORT";
      else if (upperBrand.includes("FLEET") || upperBrand.includes("GENSET") || upperBrand.includes("ENGINEERING")) currentDept = "SGHC-ENGINEERING";
      else if (upperBrand.includes("HOUSEKEEPING")) currentDept = "SGHC-HOUSEKEEPING";
      else if (upperBrand.includes("BAR")) currentDept = "SGHC-BAR";
      else if (upperBrand.includes("PASTRY")) currentDept = "SGHC-PASTRY";
      else if (upperBrand.includes("SPA")) currentDept = "SGHC-SPA";
      else if (upperBrand.includes("STEWARDING")) currentDept = "SGHC-STEWARDING";
      else if (upperBrand.includes("WAREHOUSE")) currentDept = "SGHC-WAREHOUSE";
      else if (upperBrand.startsWith("SGHC-")) currentDept = upperBrand.split(" ")[0].trim();

      // If quantity is 0 or undefined, skip adding the banner itself
      const rawQty = Number(item.qty);
      if (isNaN(rawQty) || rawQty <= 0) {
        continue;
      }
    }

    // Determine and clean up item department
    let dept = String(item.department || "").trim().toUpperCase();
    if (dept) {
      if (dept.includes("KITCHEN") || dept.includes("MAIN KITCHEN")) dept = "SGHC-KITCHEN";
      else if (dept.includes("CAFETERIA") || dept.includes("CANTEEN")) dept = "SGHC-CAFETERIA";
      else if (dept.includes("FRONT OFFICE") || dept.includes("KANATEN") || dept.includes("AIRPORT LOUNGE")) dept = "SGHC-FRONT OFFICE";
      else if (dept.includes("I.T") || dept.includes("IT DEPT") || dept === "IT") dept = "SGHC-I.T.";
      else if (dept.includes("H.R") || dept.includes("HR DEPT") || dept === "HR" || dept.includes("MEDICINE")) dept = "SGHC-H.R.";
      else if (dept.includes("ISLAND HOPPING") || dept.includes("TOURS") || dept.includes("TOUR")) dept = "SGHC-TOURS";
      else if (dept.includes("COASTER") || dept.includes("COASTERS") || dept.includes("S&R") || dept.includes("TRANSPORT")) dept = "SGHC-TRANSPORT";
      else if (dept.includes("FLEET") || dept.includes("GENSET") || dept.includes("ENGINEERING") || dept.includes("MAINTENANCE")) dept = "SGHC-ENGINEERING";
      else if (dept.includes("HOUSEKEEPING") || dept.includes(" HK")) dept = "SGHC-HOUSEKEEPING";
      else if (dept.includes("BAR")) dept = "SGHC-BAR";
      else if (dept.includes("PASTRY") || dept.includes("BAKERY")) dept = "SGHC-PASTRY";
      else if (dept.includes("SPA")) dept = "SGHC-SPA";
      else if (dept.includes("STEWARDING")) dept = "SGHC-STEWARDING";
      else if (dept.includes("WAREHOUSE")) dept = "SGHC-WAREHOUSE";
      else if (!dept.startsWith("SGHC-")) dept = `SGHC-${dept}`;

      currentDept = dept;
    } else {
      dept = currentDept;
    }

    normalized.push({
      itemBrand,
      qty: isNaN(Number(item.qty)) ? 1 : Number(item.qty),
      uom: String(item.uom || "PCS").toUpperCase().trim(),
      remarks: String(item.remarks || "").trim(),
      department: dept
    });
  }

  return normalized;
}

// Helper to execute asynchronous operations with a strict timeout so one slow model does not exhaust the entire request duration
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

// Resilient Gemini content generator with model fallback, high token limits, and JSON validation
async function generateGeminiWithFallback(contents: any[], schema: any): Promise<any> {
  // Model cascading priority requested:
  // Starts on gemini-3.8-flash -> gemini-3.7-flash -> gemini-3.1-flash-lite -> gemini-flash-latest
  const modelsToTry = [
    { name: "gemini-3.8-flash", thinking: ThinkingLevel.LOW, timeoutMs: 32000 },
    { name: "gemini-3.7-flash", thinking: ThinkingLevel.LOW, timeoutMs: 30000 },
    { name: "gemini-3.1-flash-lite", thinking: ThinkingLevel.MINIMAL, timeoutMs: 25000 },
    { name: "gemini-flash-latest", thinking: undefined, timeoutMs: 25000 }
  ];
  let lastError: any = null;

  for (const { name: model, thinking, timeoutMs } of modelsToTry) {
    try {
      console.log(`[Gemini Parse] Attempting model ${model} (timeout: ${timeoutMs / 1000}s)...`);

      const config: any = {
        responseMimeType: "application/json",
        responseSchema: schema,
        maxOutputTokens: 16384
      };

      if (thinking !== undefined) {
        config.thinkingConfig = { thinkingLevel: thinking };
      }

      // Race model generation against per-model timeout to avoid hanging
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: { parts: contents },
          config
        }),
        timeoutMs,
        `Model ${model}`
      );

      const rawText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = robustParseJson(rawText);
        if (parsed && (Array.isArray(parsed.items) || parsed.from || parsed.to || parsed.sghcNo)) {
          console.log(`[Gemini Parse] Model ${model} successfully extracted ${Array.isArray(parsed.items) ? parsed.items.length : 0} items.`);
          return parsed;
        }
      }
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err || "");
      console.warn(`[Gemini Parse] Model ${model} encountered limit/timeout:`, errMsg);

      // If error is thinkingConfig unsupported, retry once on this model without thinkingConfig
      if (errMsg.includes("thinking") || errMsg.includes("invalid") || errMsg.includes("InvalidArgument")) {
        try {
          console.log(`[Gemini Parse] Retrying ${model} without thinkingConfig...`);
          const plainConfig: any = {
            responseMimeType: "application/json",
            responseSchema: schema,
            maxOutputTokens: 16384
          };
          const retryResponse = await withTimeout(
            ai.models.generateContent({
              model,
              contents: { parts: contents },
              config: plainConfig
            }),
            timeoutMs,
            `Model ${model} (no-thinking retry)`
          );
          const rawText = retryResponse.text || retryResponse.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = robustParseJson(rawText);
            if (parsed && (Array.isArray(parsed.items) || parsed.from || parsed.to || parsed.sghcNo)) {
              console.log(`[Gemini Parse] Model ${model} (retry) extracted ${Array.isArray(parsed.items) ? parsed.items.length : 0} items.`);
              return parsed;
            }
          }
        } catch (retryErr: any) {
          console.warn(`[Gemini Parse] Retry for ${model} also failed:`, retryErr?.message || retryErr);
        }
      }

      // Cascade immediately to next model in the waterfall sequence!
      continue;
    }
  }

  throw lastError || new Error("Gemini AI models are temporarily busy or reached limits. Please try again or upload an Excel file.");
}

// Parse invoice / delivery receipt / stock sheet endpoint
app.post("/api/parse-receipt", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const textPrompt = (req.body.prompt || "").trim();

    if (!file && !textPrompt) {
      return res.status(400).json({ success: false, error: "No file or text provided for parsing." });
    }

    const fileName = file?.originalname || "";
    const cleanFileName = fileName ? fileName.replace(/\.[^/.]+$/, "").trim() : "";

    let contents: any[] = [];
    let excelTextContent = "";
    let deterministicExcelData: any = null;

    if (file) {
      const mimeType = file.mimetype || "application/octet-stream";

      if (isExcelOrSpreadsheet(fileName, mimeType)) {
        // Parse Excel workbook directly into CSV table format and structured JSON
        try {
          excelTextContent = parseExcelToText(file.buffer);
          deterministicExcelData = parseExcelDirectly(file.buffer, fileName);
        } catch (excelErr) {
          console.error("Failed to parse excel via SheetJS, fallback to raw string:", excelErr);
          excelTextContent = file.buffer.toString("utf-8");
        }

        // If no custom text prompt was entered, we can serve high-precision deterministic Excel data directly and immediately!
        if (!textPrompt && deterministicExcelData && deterministicExcelData.items && deterministicExcelData.items.length > 0) {
          return res.json({
            success: true,
            data: deterministicExcelData,
            message: "Excel spreadsheet parsed instantly."
          });
        }
      } else {
        // Image or PDF file
        const base64Data = file.buffer.toString("base64");
        let detectedMime = mimeType;
        if (!detectedMime || detectedMime === "application/octet-stream") {
          const lower = fileName.toLowerCase();
          if (lower.endsWith(".pdf")) detectedMime = "application/pdf";
          else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) detectedMime = "image/jpeg";
          else if (lower.endsWith(".png")) detectedMime = "image/png";
          else if (lower.endsWith(".webp")) detectedMime = "image/webp";
          else if (lower.endsWith(".gif")) detectedMime = "image/gif";
          else detectedMime = "image/jpeg";
        }

        contents.push({
          inlineData: {
            mimeType: detectedMime === "application/pdf" ? "application/pdf" : detectedMime,
            data: base64Data
          }
        });
      }
    }

    const extractionPrompt = `
You are an expert procurement and stock receiving data extraction assistant for Sunlight Hotel, Coron.
Analyze the attached document (invoice, purchase order, stock list, packing list transmittal, delivery receipt, spreadsheet, or Excel data) and extract ALL data into the exact JSON schema required for a Sunlight Hotel Stock Receiving Form.

${excelTextContent ? `\n=== EXTRACTED EXCEL SPREADSHEET CONTENT ===\n${excelTextContent}\n==========================================\n` : ''}

CRITICAL RULES:
1. EXTRACT EVERY SINGLE ROW IN THE DOCUMENT ACROSS ALL PAGES. DO NOT TRUNCATE, SAMPLE, OR STOP AT 10 OR 20 ITEMS. If there are 50, 60, or 100+ items across the tables or pages, YOU MUST EXTRACT ALL OF THEM.
2. "from": The vendor, supplier, or origin warehouse (default: "SGHC-WAREHOUSE PAR STOCK").
3. "to": Primary destination department (default: "SGHC-KITCHEN" or the first main department in the document).
4. "sghcNo": SGHC reference number or Document title.
   IMPORTANT: If an original filename is present (${cleanFileName ? `"${cleanFileName}"` : 'none'}), set "sghcNo" directly to "${cleanFileName}". If no filename is provided, extract PO/reference number from document text.
5. "date": Date in YYYY-MM-DD format (if not present, use today's date).
6. "location": "MNL" or "SETIR" (if PO starts with "SETIR", use "SETIR", otherwise default "SETIR").
7. "purpose": Purpose of transfer or receipt (e.g., "Kitchen Par Stock Replenishment", "Cafeteria Daily Supplies", "Multi-Department Stock Transmittal").
8. SEPARATE ITEMS BY DEPARTMENT (CRITICAL):
   The document contains horizontal section header banners dividing the items into distinct departments.
   You MUST assign each item's "department" field to match the exact header banner it appears beneath:
   - Section "SGHC-MAIN KITCHEN PAR STOCK..." -> set "department" to "SGHC-KITCHEN"
   - Section "SGHC-WAREHOUSE PAR STOCK..." or "SGHC-WAREHOUSE C/O..." -> set "department" to "SGHC-WAREHOUSE"
   - Section "SGHC-CAFETERIA PAR STOCK..." -> set "department" to "SGHC-CAFETERIA"
   - Section "SGHC-FRONT OFFICE KANATEN / AIRPORT LOUNGE..." -> set "department" to "SGHC-FRONT OFFICE"
   - Section "SGHC-I.T DEPT. FOR..." -> set "department" to "SGHC-I.T."
   - Section "SGHC-H.R DEPT. PAR STOCK FOR STAFF MEDICINE..." -> set "department" to "SGHC-H.R."
   - Section "SGHC-FOR ISLAND HOPPING TOUR..." or "SGHC-TOURS..." -> set "department" to "SGHC-TOURS"
   - Section "SGHC-S&R FOR 3 COASTERS..." -> set "department" to "SGHC-TRANSPORT"
   - Section "SGHC-FOR FLEET & GENSET..." -> set "department" to "SGHC-ENGINEERING"
   - Section "SGHC-HOUSEKEEPING..." -> set "department" to "SGHC-HOUSEKEEPING"
   - Section "SGHC-BAR..." -> set "department" to "SGHC-BAR"
   - Section "SGHC-PASTRY..." -> set "department" to "SGHC-PASTRY"
   - Section "SGHC-SPA..." -> set "department" to "SGHC-SPA"
   - Any other section header: format as "SGHC-[DEPT_NAME]".
   * DO NOT put all items into "SGHC-KITCHEN" if there are multiple section banners.
   * The section header banner itself is NOT an item—do not output banner titles as item rows.
9. "items": Complete array of all items extracted from every section. Each item must contain:
   - "itemBrand": Full item description / brand name / item name (e.g., "PL AGUILA CORNED BEEF (500G/PACK)", "PORK BONELESS WITH SKIN", "KRISPERS BREADCRUMBS", "FRESH WHITE EGGS MEDIUM", "GARLIC", "WHITE TSHIRT ARRIVAL POST CARD (S)", "POS PRINTER (XPRINTER)", "FEVRAL 200MG (ADVIL)").
   - "qty": Exact numeric quantity (e.g., 25.825, 32.18, 33.17, 19.38, 15, 50, 1, 5, 2000). Preserve decimal places if given.
   - "uom": Unit of measure in uppercase (e.g., "PACKS", "CASE", "KGS", "BLOCK", "PCS", "SACK", "TRAYS", "TINS", "TIN", "BOX", "UNIT", "GALLONS", "DRUMS", "PACKAGE", "SETS", "LITERS").
   - "remarks": Combined remarks including PO Number, Expiry Date, or handler / packaging notes from the section banner (e.g., "C/O CHRISTER DUSONG - PO# NO PO #", "PO# SGHC 2026-08-0001 - Exp: Jun-27", "C/O JEFF", "(2 BUNDLES)").
   - "department": The specific department section this item belongs to as specified above.
10. "preparedBy": Name if mentioned (default "JEFFERSON SALOM").
11. "approvedBy": Name if mentioned (default "ANGELO LIZARES").
12. "notedBy": Name if mentioned (leave empty string if not found).
13. "receivedBy": Name if mentioned (leave empty string if not found).

User instructions / focus: ${textPrompt}
`;

    contents.push({ text: extractionPrompt });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        from: { type: Type.STRING },
        to: { type: Type.STRING },
        sghcNo: { type: Type.STRING },
        date: { type: Type.STRING },
        location: { type: Type.STRING, description: "MNL or SETIR" },
        purpose: { type: Type.STRING },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              itemBrand: { type: Type.STRING, description: "Full item description or product name" },
              qty: { type: Type.NUMBER, description: "Numeric quantity" },
              uom: { type: Type.STRING, description: "Unit of measure: PACKS, CASE, KGS, PCS, SACK, TRAYS, TINS, BOX, UNIT, GALLONS, DRUMS, SETS, LITERS" },
              remarks: { type: Type.STRING, description: "PO number, expiry date, or handler notes" },
              department: { 
                type: Type.STRING, 
                description: "MANDATORY: Exact department header banner this item is located under. E.g. SGHC-KITCHEN, SGHC-WAREHOUSE, SGHC-CAFETERIA, SGHC-FRONT OFFICE, SGHC-I.T., SGHC-H.R., SGHC-TOURS, SGHC-TRANSPORT, SGHC-ENGINEERING, SGHC-HOUSEKEEPING, SGHC-BAR, SGHC-PASTRY, SGHC-SPA, SGHC-STEWARDING" 
              }
            },
            required: ["itemBrand", "qty", "uom", "department"]
          }
        },
        preparedBy: { type: Type.STRING },
        approvedBy: { type: Type.STRING },
        notedBy: { type: Type.STRING },
        receivedBy: { type: Type.STRING }
      },
      required: ["from", "to", "items"]
    };

    try {
      const parsedData = await generateGeminiWithFallback(contents, responseSchema);
      if (!parsedData || typeof parsedData !== "object") {
        throw new Error("Failed to parse a valid structured response from the document.");
      }

      if (parsedData.items && Array.isArray(parsedData.items)) {
        parsedData.items = normalizeAndStandardizeItems(parsedData.items);
      }

      if (cleanFileName && (!parsedData.sghcNo || parsedData.sghcNo.includes("2026-06-0001") || parsedData.sghcNo.trim() === "")) {
        parsedData.sghcNo = cleanFileName;
      } else if (cleanFileName) {
        parsedData.sghcNo = cleanFileName;
      }

      return res.json({ success: true, data: parsedData });
    } catch (aiErr: any) {
      console.warn("Gemini parsing error or capacity limit reached:", aiErr);

      // If we have deterministic Excel data extracted from the spreadsheet, return it gracefully!
      if (deterministicExcelData && deterministicExcelData.items && deterministicExcelData.items.length > 0) {
        console.log(`Serving deterministic Excel parsed data (${deterministicExcelData.items.length} items) as fallback`);
        return res.json({
          success: true,
          data: deterministicExcelData,
          fallback: true,
          message: "Data parsed directly from Excel structure (AI service was at capacity)."
        });
      }

      const is503 = String(aiErr?.message || "").includes("503") || String(aiErr?.message || "").includes("high demand") || String(aiErr?.message || "").includes("UNAVAILABLE");
      const userFriendlyMsg = is503
        ? "The AI model is temporarily experiencing high server demand. Please try again in a few moments, or upload an Excel spreadsheet / load a preset template."
        : (aiErr.message || "Failed to parse document");

      return res.status(503).json({ success: false, error: userFriendlyMsg });
    }

  } catch (error: any) {
    console.error("Error parsing receipt:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to parse document" });
  }
});

// Explicit 404 handler for API routes so they never fall through to Vite HTML
app.use("/api/*", (req, res) => {
  res.status(404).json({ success: false, error: `API route ${req.originalUrl} not found` });
});

// Error handling middleware for API routes to always return JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith("/api/")) {
    console.error("API Middleware Error:", err);
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "Internal server error occurred while processing request"
    });
  }
  next(err);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
