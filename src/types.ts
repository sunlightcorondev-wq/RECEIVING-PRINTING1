export interface ReceivingItem {
  id: string;
  itemBrand: string;
  qty: number;
  uom: string;
  remarks: string;
  department?: string;
}

export interface ReceivingFormModel {
  id?: string;
  title?: string;
  from: string;
  mahraNo?: string;
  to: string;
  sghcNo: string;
  date: string;
  location: 'MNL' | 'SETIR';
  purpose: string;
  items: ReceivingItem[];
  preparedBy: string;
  approvedBy: string;
  notedBy: string;
  receivedBy: string;
  createdAt?: string;
}

export const SAMPLE_RECEIPTS: ReceivingFormModel[] = [
  {
    id: "sample-1",
    title: "SGHC Kitchen Par Stock Replenishment (June 2026)",
    from: "SGHC-WAREHOUSE PAR STOCK",
    to: "SGHC-KITCHEN",
    sghcNo: "SGHC 2026-06-0001",
    date: "2026-06-05",
    location: "SETIR",
    purpose: "Monthly Kitchen Par Stock Replenishment & Dry Goods",
    items: [
      { id: "i1", itemBrand: "GOLDEN SILK PANCIT CANTON", qty: 12, uom: "PCS", remarks: "C/O JULIUS CORNELIA" },
      { id: "i2", itemBrand: "DEL MONTE SPAGHETTI PASTA (20 X 900G)", qty: 1, uom: "CASE", remarks: "C/O JULIUS CORNELIA - Exp: Aug-27" },
      { id: "i3", itemBrand: "DEL MONTE SPAGHETTI SAUCE ITALIAN (12 X 900G)", qty: 1, uom: "CASE", remarks: "C/O JULIUS CORNELIA - Exp: Mar-27" },
      { id: "i4", itemBrand: "DEL MONTE PINEAPPLE TIDBITS (48 X 115G)", qty: 1, uom: "CASE", remarks: "C/O JULIUS CORNELIA - Exp: Dec-26" },
      { id: "i5", itemBrand: "DEL MONTE TOMATO PASTE (48 X 150G)", qty: 1, uom: "CASE", remarks: "C/O JULIUS CORNELIA - Exp: Mar-27" },
      { id: "i6", itemBrand: "BOY BIGAS (25KGS/SACK)", qty: 15, uom: "SACKS", remarks: "C/O JULIUS CORNELIA" },
      { id: "i7", itemBrand: "CLARA OLE ORIGINAL PANCAKE SYRUP (355ML X 12)", qty: 1, uom: "CASE", remarks: "C/O JULIUS CORNELIA - Exp: Apr-27" },
      { id: "i8", itemBrand: "ALASKA CONDENSADA (24 X 545G)", qty: 1, uom: "CASE", remarks: "C/O JULIUS CORNELIA - Exp: Apr-27" },
      { id: "i9", itemBrand: "ALASKA EVAPORADA (48 X 360ML)", qty: 1, uom: "CASE", remarks: "C/O JULIUS CORNELIA - Exp: May-27" },
      { id: "i10", itemBrand: "AJINOMOTO UMAMI SEASONING (2.5KGS X 8)", qty: 2, uom: "CASES", remarks: "C/O JULIUS CORNELIA - Exp: Apr-27" },
      { id: "i11", itemBrand: "KNORR SINIGANG SA GABI (40 X 160G)", qty: 1, uom: "CASE", remarks: "C/O JULIUS CORNELIA - Exp: Jul-27" },
      { id: "i12", itemBrand: "KNORR SINIGANG SA SAMPALOK BROTH (30 X 160G)", qty: 1, uom: "CASE", remarks: "C/O JULIUS CORNELIA - Exp: Jun-27" }
    ],
    preparedBy: "JEFFERSON SALOM",
    approvedBy: "ANGELO LIZARES",
    notedBy: "MARIA SANTOS",
    receivedBy: "JUAN DELA CRUZ",
    createdAt: new Date().toISOString()
  },
  {
    id: "sample-2",
    title: "SGHC Cafeteria Fresh Proteins & Produce",
    from: "SGHC-WAREHOUSE COLD STORAGE",
    to: "SGHC-CAFETERIA",
    sghcNo: "SGHC 2026-06-0003",
    date: "2026-06-06",
    location: "SETIR",
    purpose: "Staff Cafeteria Daily Weekly Supply",
    items: [
      { id: "c1", itemBrand: "BONELESS BANGUS", qty: 10, uom: "KGS", remarks: "C/O JULIUS CORNELIA - Fresh" },
      { id: "c2", itemBrand: "MARINATED DAING GALUNGGONG", qty: 10, uom: "KGS", remarks: "C/O JULIUS CORNELIA" },
      { id: "c3", itemBrand: "SADIA WHOLE CHICKEN (12KGS/BOX)", qty: 24, uom: "KGS", remarks: "C/O JULIUS CORNELIA - Exp: Sep-27" },
      { id: "c4", itemBrand: "CARROTS", qty: 10, uom: "KGS", remarks: "C/O JULIUS CORNELIA" },
      { id: "c5", itemBrand: "SITAW", qty: 10, uom: "KGS", remarks: "C/O JULIUS CORNELIA" },
      { id: "c6", itemBrand: "OKRA", qty: 10, uom: "KGS", remarks: "C/O JULIUS CORNELIA" }
    ],
    preparedBy: "JEFFERSON SALOM",
    approvedBy: "ANGELO LIZARES",
    notedBy: "CHEF ANTONIO",
    receivedBy: "ESTHER L.",
    createdAt: new Date().toISOString()
  }
];
