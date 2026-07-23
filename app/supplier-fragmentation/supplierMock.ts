export interface CategoryConcentration {
  category: string;
  supplierCount: number;
  top3ConcentrationPercent: number;
  singleUseSuppliers: number;
  spendCr: number;
}

export interface SupplierSizeBucket {
  bucket: string;
  supplierCount: number;
  spendCr: number;
}

export interface TopSupplierShare {
  supplier: string;
  spendCr: number;
  cumulativePercent: number;
}

export interface MonthlyOnboarding {
  month: string;
  newSuppliers: number;
  singleUseShare: number;
}

export type DuplicateAction = "Merge" | "Review" | "Monitor";

export interface DuplicateSupplierPair {
  primaryName: string;
  duplicateName: string;
  category: string;
  combinedSpendCr: number;
  invoiceCount: number;
  similarityPercent: number;
  action: DuplicateAction;
}

export interface SupplierFragmentationData {
  totalActiveSuppliers: number;
  singleUseSupplierCount: number;
  top10ConcentrationPercent: number;
  avgSuppliersPerCategory: number;
  duplicatePairCount: number;
  newSuppliersLast12M: number;
  categories: CategoryConcentration[];
  sizeBuckets: SupplierSizeBucket[];
  topSuppliers: TopSupplierShare[];
  monthlyOnboarding: MonthlyOnboarding[];
  duplicatePairs: DuplicateSupplierPair[];
  filterOptions: {
    dateRanges: string[];
    sourceSystems: string[];
    plantSites: string[];
  };
}

export function formatCrINR(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr`;
}

export const supplierMock: SupplierFragmentationData = {
  totalActiveSuppliers: 3_140,
  singleUseSupplierCount: 1_285,
  top10ConcentrationPercent: 47,
  avgSuppliersPerCategory: 628,
  duplicatePairCount: 42,
  newSuppliersLast12M: 486,
  categories: [
    { category: "IT & Telecom", supplierCount: 420, top3ConcentrationPercent: 62, singleUseSuppliers: 140, spendCr: 126 },
    { category: "Facilities", supplierCount: 610, top3ConcentrationPercent: 38, singleUseSuppliers: 305, spendCr: 117 },
    { category: "Professional Services", supplierCount: 890, top3ConcentrationPercent: 29, singleUseSuppliers: 410, spendCr: 210 },
    { category: "MRO", supplierCount: 745, top3ConcentrationPercent: 34, singleUseSuppliers: 260, spendCr: 418 },
    { category: "Logistics", supplierCount: 475, top3ConcentrationPercent: 51, singleUseSuppliers: 170, spendCr: 501 },
  ],
  sizeBuckets: [
    { bucket: "< ₹1 L", supplierCount: 980, spendCr: 4 },
    { bucket: "₹1–10 L", supplierCount: 890, spendCr: 38 },
    { bucket: "₹10 L–1 Cr", supplierCount: 720, spendCr: 262 },
    { bucket: "₹1–10 Cr", supplierCount: 395, spendCr: 1_240 },
    { bucket: "₹10–50 Cr", supplierCount: 118, spendCr: 2_610 },
    { bucket: "> ₹50 Cr", supplierCount: 37, spendCr: 3_180 },
  ],
  topSuppliers: [
    { supplier: "Larsen Heavy Equipment Ltd.", spendCr: 510, cumulativePercent: 7 },
    { supplier: "Continental Mining Systems", spendCr: 385, cumulativePercent: 12 },
    { supplier: "Vedanta EPC Partners", spendCr: 344, cumulativePercent: 17 },
    { supplier: "TransIndia Bulk Logistics", spendCr: 333, cumulativePercent: 21 },
    { supplier: "Apex Civil & Infra Ltd.", spendCr: 279, cumulativePercent: 25 },
    { supplier: "Global Process Chemicals", spendCr: 193, cumulativePercent: 28 },
    { supplier: "Sterlite Power Components", spendCr: 188, cumulativePercent: 31 },
    { supplier: "Hind Metallurgical Works", spendCr: 176, cumulativePercent: 34 },
    { supplier: "National Mining Spares", spendCr: 168, cumulativePercent: 41 },
    { supplier: "Vardhman Structural Works", spendCr: 150, cumulativePercent: 47 },
  ],
  monthlyOnboarding: [
    { month: "Aug 2025", newSuppliers: 31, singleUseShare: 55 },
    { month: "Sep 2025", newSuppliers: 36, singleUseShare: 58 },
    { month: "Oct 2025", newSuppliers: 42, singleUseShare: 60 },
    { month: "Nov 2025", newSuppliers: 39, singleUseShare: 54 },
    { month: "Dec 2025", newSuppliers: 28, singleUseShare: 50 },
    { month: "Jan 2026", newSuppliers: 45, singleUseShare: 62 },
    { month: "Feb 2026", newSuppliers: 41, singleUseShare: 59 },
    { month: "Mar 2026", newSuppliers: 52, singleUseShare: 65 },
    { month: "Apr 2026", newSuppliers: 44, singleUseShare: 61 },
    { month: "May 2026", newSuppliers: 40, singleUseShare: 57 },
    { month: "Jun 2026", newSuppliers: 43, singleUseShare: 60 },
    { month: "Jul 2026", newSuppliers: 45, singleUseShare: 63 },
  ],
  duplicatePairs: [
    { primaryName: "Sanman Electricals Trading", duplicateName: "Sanman Traders (Alt Site)", category: "MRO", combinedSpendCr: 3.2, invoiceCount: 196, similarityPercent: 94, action: "Merge" },
    { primaryName: "Om Sai Enterprises", duplicateName: "Om Sai Enterprise Pvt Ltd", category: "Facilities", combinedSpendCr: 2.4, invoiceCount: 231, similarityPercent: 97, action: "Merge" },
    { primaryName: "Krishna Civil Contractors", duplicateName: "Krishna Civil Contractor & Co", category: "Professional Services", combinedSpendCr: 17.1, invoiceCount: 78, similarityPercent: 92, action: "Merge" },
    { primaryName: "Continental Chemicals Pvt Ltd", duplicateName: "Continental Chemical Industries", category: "MRO", combinedSpendCr: 5.6, invoiceCount: 96, similarityPercent: 84, action: "Review" },
    { primaryName: "Raghav Facility Services", duplicateName: "Raghav Facilities Mgmt", category: "Facilities", combinedSpendCr: 2.9, invoiceCount: 187, similarityPercent: 88, action: "Review" },
    { primaryName: "Precision Electricals Ltd.", duplicateName: "Precision Electrical Works", category: "IT & Telecom", combinedSpendCr: 2.1, invoiceCount: 82, similarityPercent: 81, action: "Review" },
    { primaryName: "Bharat Mechanical Works", duplicateName: "Bharath Mechanical Work Shop", category: "MRO", combinedSpendCr: 1.9, invoiceCount: 104, similarityPercent: 76, action: "Monitor" },
    { primaryName: "Sundaram Spares & Components", duplicateName: "Sundaram Spare Components Co", category: "Logistics", combinedSpendCr: 1.7, invoiceCount: 91, similarityPercent: 73, action: "Monitor" },
  ],
  filterOptions: {
    dateRanges: ["Jan 2025 – Dec 2025", "Jul 2025 – Jun 2026", "Jan 2024 – Dec 2024", "Apr 2025 – Mar 2026"],
    sourceSystems: ["SAP ECC", "SAP S/4HANA", "Ariba", "Coupa"],
    plantSites: [
      "Jharsuguda (Odisha)",
      "Lanjigarh (Odisha)",
      "Korba (Chhattisgarh)",
      "Chanderiya (Rajasthan)",
      "Zawar Mines (Rajasthan)",
      "Tuticorin (Tamil Nadu)",
      "Goa",
    ],
  },
};
