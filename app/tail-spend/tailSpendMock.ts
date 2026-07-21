// Mock data for the Tail Spend Dashboard (Vedanta Limited — SAP ECC sourced spend).
// Every figure below is internally reconciled: category totals sum to totalAnnualSpend,
// segment splits sum to totalPOCount / totalActiveSuppliers, etc.

export type SpendSegment = "Strategic" | "Core" | "Tail";

export interface KPISummary {
  totalAnnualSpend: number;
  totalPOCount: number;
  totalActiveSuppliers: number;
  tailSpendValue: number;
  tailSpendPercentOfValue: number;
  tailPOCount: number;
  tailSpendPercentOfPOs: number;
  microPOThreshold: number;
  microPOCount: number;
  microPOPercentOfTotalPOs: number;
  microPOProcessingCost: number;
  tailSupplierCount: number;
  singleUseSupplierCount: number;
  avgPOProcessingCost: number;
  potentialConsolidationSavings: number;
}

export interface ParetoDecile {
  decileLabel: string;
  supplierCount: number;
  spendPercentOfTotal: number;
  cumulativeSpendPercent: number;
}

export interface CategoryTailBreakdown {
  category: string;
  strategicSpend: number;
  coreSpend: number;
  tailSpend: number;
  totalSpend: number;
  tailPercent: number;
  supplierCount: number;
  tailSupplierCount: number;
}

export interface SupplierBubblePoint {
  supplierId: string;
  supplierName: string;
  category: string;
  poCount: number;
  avgPOValue: number;
  totalSpend: number;
  segment: SpendSegment;
}

export interface SegmentComparison {
  segment: SpendSegment;
  supplierCount: number;
  supplierPercent: number;
  poCount: number;
  poPercent: number;
  spendValue: number;
  spendPercent: number;
  avgPOValue: number;
  processingCost: number;
}

export interface MonthlyTrendPoint {
  month: string;
  strategicSpend: number;
  coreSpend: number;
  tailSpend: number;
}

export type ConsolidationAction = "Consolidate" | "Contract" | "Monitor";

export interface ConsolidationCandidate {
  supplierId: string;
  supplierName: string;
  category: string;
  poCount: number;
  microPOCount: number;
  totalSpend: number;
  avgPOValue: number;
  processingCost: number;
  potentialSavings: number;
  consolidationScore: number;
  recommendedAction: ConsolidationAction;
}

export interface POValueBucket {
  bucketLabel: string;
  poCount: number;
  totalValue: number;
  percentOfPOCount: number;
  percentOfTotalValue: number;
  processingCost: number;
  isMicroPO: boolean;
}

// --- SAP Spend Control Tower (Tier 1) types -------------------------------

/** The 4-metric navy KPI ribbon at the top of the SAP standard workspace. */
export interface SapKpiRibbon {
  invoiceCount: number;
  supplierCountGlobalUltimate: number;
  meanInvoiceAmountPerSupplier: number;
  meanInvoicesPerSupplier: number;
}

/** Top-left widget: invoice value buckets, bar = invoices/supplier, line = invoice count. */
export interface InvoiceValueBucket {
  bucketLabel: string;
  invoiceCount: number;
  invoicesPerSupplier: number;
  spend: number;
  spendPercent: number;
}

/** Top-right widget: suppliers (Global Ultimate) ranked by spend. */
export interface SupplierSpendRank {
  supplierId: string;
  supplierName: string;
  totalSpend: number;
}

/** Bottom-right widget: SAP category code/name with supplier count and spend bar. */
export interface SapCategoryRow {
  code: string;
  category: string;
  supplierCount: number;
  spend: number;
}

/** Full-width SAP detailed report table row. */
export interface SapSupplierReportRow {
  supplierId: string;
  supplierName: string;
  invoiceCount: number;
  plantCount: number;
  categoryCount: number;
  productCount: number;
  costCenterCount: number;
  spend: number;
}

export interface SapFilterOptions {
  dateRanges: string[];
  sourceSystems: string[];
  plantSites: string[];
}

export interface TailSpendData {
  kpi: KPISummary;
  paretoDeciles: ParetoDecile[];
  categoryBreakdown: CategoryTailBreakdown[];
  supplierBubbles: SupplierBubblePoint[];
  segmentComparison: SegmentComparison[];
  monthlyTrend: MonthlyTrendPoint[];
  consolidationCandidates: ConsolidationCandidate[];
  poValueBuckets: POValueBucket[];
  sapKpiRibbon: SapKpiRibbon;
  invoiceValueBuckets: InvoiceValueBucket[];
  supplierSpendRank: SupplierSpendRank[];
  sapCategoryRows: SapCategoryRow[];
  sapSupplierReport: SapSupplierReportRow[];
  sapFilterOptions: SapFilterOptions;
}

export const tailSpendMock: TailSpendData = {
  kpi: {
    totalAnnualSpend: 48_600_000_000,
    totalPOCount: 186_400,
    totalActiveSuppliers: 5_240,
    tailSpendValue: 9_720_000_000,
    tailSpendPercentOfValue: 20,
    tailPOCount: 145_400,
    tailSpendPercentOfPOs: 78,
    microPOThreshold: 25_000,
    microPOCount: 92_600,
    microPOPercentOfTotalPOs: 49.7,
    microPOProcessingCost: 463_000_000,
    tailSupplierCount: 4_192,
    singleUseSupplierCount: 1_860,
    avgPOProcessingCost: 5_000,
    potentialConsolidationSavings: 300_000_000,
  },

  paretoDeciles: [
    { decileLabel: "Top 10%", supplierCount: 524, spendPercentOfTotal: 68, cumulativeSpendPercent: 68 },
    { decileLabel: "10–20%", supplierCount: 524, spendPercentOfTotal: 12, cumulativeSpendPercent: 80 },
    { decileLabel: "20–40%", supplierCount: 1_048, spendPercentOfTotal: 11, cumulativeSpendPercent: 91 },
    { decileLabel: "40–60%", supplierCount: 1_048, spendPercentOfTotal: 5, cumulativeSpendPercent: 96 },
    { decileLabel: "60–80%", supplierCount: 1_048, spendPercentOfTotal: 3, cumulativeSpendPercent: 99 },
    { decileLabel: "80–100%", supplierCount: 1_048, spendPercentOfTotal: 1, cumulativeSpendPercent: 100 },
  ],

  categoryBreakdown: [
    { category: "Capital Equipment & Capex Contracts", strategicSpend: 10_692_000_000, coreSpend: 0, tailSpend: 0, totalSpend: 10_692_000_000, tailPercent: 0, supplierCount: 45, tailSupplierCount: 0 },
    { category: "Mining Equipment Spares", strategicSpend: 5_880_600_000, coreSpend: 3_037_500_000, tailSpend: 388_800_000, totalSpend: 9_306_900_000, tailPercent: 4.2, supplierCount: 680, tailSupplierCount: 410 },
    { category: "Civil, Structural & Construction", strategicSpend: 4_009_500_000, coreSpend: 1_215_000_000, tailSpend: 486_000_000, totalSpend: 5_710_500_000, tailPercent: 8.5, supplierCount: 380, tailSupplierCount: 260 },
    { category: "Logistics, Freight & Handling", strategicSpend: 3_207_600_000, coreSpend: 1_215_000_000, tailSpend: 583_200_000, totalSpend: 5_005_800_000, tailPercent: 11.7, supplierCount: 410, tailSupplierCount: 300 },
    { category: "Electrical & Instrumentation Spares", strategicSpend: 2_138_400_000, coreSpend: 2_430_000_000, tailSpend: 777_600_000, totalSpend: 5_346_000_000, tailPercent: 14.5, supplierCount: 520, tailSupplierCount: 340 },
    { category: "MRO – Mechanical Consumables", strategicSpend: 0, coreSpend: 2_430_000_000, tailSpend: 1_749_600_000, totalSpend: 4_179_600_000, tailPercent: 41.9, supplierCount: 890, tailSupplierCount: 720 },
    { category: "Chemicals & Reagents", strategicSpend: 801_900_000, coreSpend: 1_822_500_000, tailSpend: 680_400_000, totalSpend: 3_304_800_000, tailPercent: 20.6, supplierCount: 310, tailSupplierCount: 210 },
    { category: "Safety & PPE", strategicSpend: 0, coreSpend: 0, tailSpend: 1_555_200_000, totalSpend: 1_555_200_000, tailPercent: 100, supplierCount: 640, tailSupplierCount: 640 },
    { category: "IT, Electronics & Software", strategicSpend: 0, coreSpend: 0, tailSpend: 1_263_600_000, totalSpend: 1_263_600_000, tailPercent: 100, supplierCount: 480, tailSupplierCount: 480 },
    { category: "Facility, Housekeeping & Admin", strategicSpend: 0, coreSpend: 0, tailSpend: 1_166_400_000, totalSpend: 1_166_400_000, tailPercent: 100, supplierCount: 520, tailSupplierCount: 520 },
    { category: "Office Supplies, Stationery & Misc", strategicSpend: 0, coreSpend: 0, tailSpend: 1_069_200_000, totalSpend: 1_069_200_000, tailPercent: 100, supplierCount: 365, tailSupplierCount: 312 },
  ],

  segmentComparison: [
    { segment: "Strategic", supplierCount: 210, supplierPercent: 4.0, poCount: 22_300, poPercent: 12.0, spendValue: 26_730_000_000, spendPercent: 55, avgPOValue: 1_199_103, processingCost: 111_500_000 },
    { segment: "Core", supplierCount: 838, supplierPercent: 16.0, poCount: 18_700, poPercent: 10.0, spendValue: 12_150_000_000, spendPercent: 25, avgPOValue: 649_733, processingCost: 93_500_000 },
    { segment: "Tail", supplierCount: 4_192, supplierPercent: 80.0, poCount: 145_400, poPercent: 78.0, spendValue: 9_720_000_000, spendPercent: 20, avgPOValue: 66_850, processingCost: 727_000_000 },
  ],

  monthlyTrend: [
    { month: "Aug 2025", strategicSpend: 2_050_000_000, coreSpend: 980_000_000, tailSpend: 760_000_000 },
    { month: "Sep 2025", strategicSpend: 1_890_000_000, coreSpend: 940_000_000, tailSpend: 775_000_000 },
    { month: "Oct 2025", strategicSpend: 2_410_000_000, coreSpend: 1_050_000_000, tailSpend: 790_000_000 },
    { month: "Nov 2025", strategicSpend: 3_120_000_000, coreSpend: 1_180_000_000, tailSpend: 805_000_000 },
    { month: "Dec 2025", strategicSpend: 2_780_000_000, coreSpend: 1_020_000_000, tailSpend: 820_000_000 },
    { month: "Jan 2026", strategicSpend: 1_960_000_000, coreSpend: 890_000_000, tailSpend: 835_000_000 },
    { month: "Feb 2026", strategicSpend: 2_240_000_000, coreSpend: 970_000_000, tailSpend: 845_000_000 },
    { month: "Mar 2026", strategicSpend: 3_450_000_000, coreSpend: 1_240_000_000, tailSpend: 860_000_000 },
    { month: "Apr 2026", strategicSpend: 1_780_000_000, coreSpend: 910_000_000, tailSpend: 850_000_000 },
    { month: "May 2026", strategicSpend: 2_140_000_000, coreSpend: 1_010_000_000, tailSpend: 865_000_000 },
    { month: "Jun 2026", strategicSpend: 2_360_000_000, coreSpend: 1_080_000_000, tailSpend: 875_000_000 },
    { month: "Jul 2026", strategicSpend: 2_550_000_000, coreSpend: 1_180_000_000, tailSpend: 890_000_000 },
  ],

  poValueBuckets: [
    { bucketLabel: "< ₹5K", poCount: 34_800, totalValue: 90_480_000, percentOfPOCount: 18.7, percentOfTotalValue: 0.2, processingCost: 174_000_000, isMicroPO: true },
    { bucketLabel: "₹5K – ₹25K", poCount: 57_800, totalValue: 797_640_000, percentOfPOCount: 31.0, percentOfTotalValue: 1.6, processingCost: 289_000_000, isMicroPO: true },
    { bucketLabel: "₹25K – ₹1L", poCount: 46_700, totalValue: 2_708_600_000, percentOfPOCount: 25.1, percentOfTotalValue: 5.6, processingCost: 233_500_000, isMicroPO: false },
    { bucketLabel: "₹1L – ₹5L", poCount: 27_300, totalValue: 6_688_500_000, percentOfPOCount: 14.6, percentOfTotalValue: 13.8, processingCost: 136_500_000, isMicroPO: false },
    { bucketLabel: "₹5L – ₹25L", poCount: 13_400, totalValue: 15_410_000_000, percentOfPOCount: 7.2, percentOfTotalValue: 31.7, processingCost: 67_000_000, isMicroPO: false },
    { bucketLabel: "> ₹25L", poCount: 6_400, totalValue: 22_904_780_000, percentOfPOCount: 3.4, percentOfTotalValue: 47.1, processingCost: 32_000_000, isMicroPO: false },
  ],

  supplierBubbles: [
    { supplierId: "SUP-1001", supplierName: "Shree Balaji Traders", category: "Office Supplies, Stationery & Misc", poCount: 118, avgPOValue: 8_400, totalSpend: 991_200, segment: "Tail" },
    { supplierId: "SUP-1002", supplierName: "Om Sai Enterprises", category: "MRO – Mechanical Consumables", poCount: 134, avgPOValue: 12_600, totalSpend: 1_688_400, segment: "Tail" },
    { supplierId: "SUP-1003", supplierName: "Vikas Hardware & Fasteners", category: "MRO – Mechanical Consumables", poCount: 96, avgPOValue: 15_200, totalSpend: 1_459_200, segment: "Tail" },
    { supplierId: "SUP-1004", supplierName: "National Safety Equipments", category: "Safety & PPE", poCount: 108, avgPOValue: 9_800, totalSpend: 1_058_400, segment: "Tail" },
    { supplierId: "SUP-1005", supplierName: "Kalyan Industrial Supplies", category: "Safety & PPE", poCount: 87, avgPOValue: 11_400, totalSpend: 991_800, segment: "Tail" },
    { supplierId: "SUP-1006", supplierName: "Sunrise Office Mart", category: "Office Supplies, Stationery & Misc", poCount: 142, avgPOValue: 5_600, totalSpend: 795_200, segment: "Tail" },
    { supplierId: "SUP-1007", supplierName: "Anand Computers & Peripherals", category: "IT, Electronics & Software", poCount: 76, avgPOValue: 18_900, totalSpend: 1_436_400, segment: "Tail" },
    { supplierId: "SUP-1008", supplierName: "Raghav Facility Services", category: "Facility, Housekeeping & Admin", poCount: 121, avgPOValue: 14_200, totalSpend: 1_718_200, segment: "Tail" },
    { supplierId: "SUP-1009", supplierName: "Jai Bharat Cleaning Co.", category: "Facility, Housekeeping & Admin", poCount: 99, avgPOValue: 10_500, totalSpend: 1_039_500, segment: "Tail" },
    { supplierId: "SUP-1010", supplierName: "Deccan Chemicals Trading", category: "Chemicals & Reagents", poCount: 68, avgPOValue: 22_400, totalSpend: 1_523_200, segment: "Tail" },
    { supplierId: "SUP-1011", supplierName: "Metro Fastener House", category: "MRO – Mechanical Consumables", poCount: 105, avgPOValue: 9_100, totalSpend: 955_500, segment: "Tail" },
    { supplierId: "SUP-1012", supplierName: "Sanman Electricals Trading", category: "Electrical & Instrumentation Spares", poCount: 88, avgPOValue: 24_600, totalSpend: 2_164_800, segment: "Tail" },
    { supplierId: "SUP-1013", supplierName: "Vedika IT Solutions", category: "IT, Electronics & Software", poCount: 63, avgPOValue: 16_800, totalSpend: 1_058_400, segment: "Tail" },
    { supplierId: "SUP-1014", supplierName: "Global Print & Stationers", category: "Office Supplies, Stationery & Misc", poCount: 129, avgPOValue: 4_900, totalSpend: 632_100, segment: "Tail" },
    { supplierId: "SUP-1015", supplierName: "Trimurti Pest Control", category: "Facility, Housekeeping & Admin", poCount: 54, avgPOValue: 13_600, totalSpend: 734_400, segment: "Tail" },
    { supplierId: "SUP-1016", supplierName: "Shivam Safety Gears", category: "Safety & PPE", poCount: 91, avgPOValue: 7_900, totalSpend: 719_900, segment: "Tail" },
    { supplierId: "SUP-1017", supplierName: "Ambika Logistics Support", category: "Logistics, Freight & Handling", poCount: 47, avgPOValue: 28_400, totalSpend: 1_334_800, segment: "Tail" },
    { supplierId: "SUP-1018", supplierName: "Krishna Lab Chemicals", category: "Chemicals & Reagents", poCount: 39, avgPOValue: 31_200, totalSpend: 1_216_800, segment: "Tail" },
    { supplierId: "SUP-1019", supplierName: "Patel Engineering Works", category: "MRO – Mechanical Consumables", poCount: 82, avgPOValue: 17_300, totalSpend: 1_418_600, segment: "Tail" },
    { supplierId: "SUP-1020", supplierName: "Unique Office Automation", category: "IT, Electronics & Software", poCount: 58, avgPOValue: 21_600, totalSpend: 1_252_800, segment: "Tail" },
    { supplierId: "SUP-1021", supplierName: "Rani Enterprises", category: "Office Supplies, Stationery & Misc", poCount: 136, avgPOValue: 3_800, totalSpend: 516_800, segment: "Tail" },
    { supplierId: "SUP-1022", supplierName: "Bhairav Traders", category: "MRO – Mechanical Consumables", poCount: 74, avgPOValue: 19_600, totalSpend: 1_450_400, segment: "Tail" },
    { supplierId: "SUP-1023", supplierName: "Aarav Electrical Supplies", category: "Electrical & Instrumentation Spares", poCount: 61, avgPOValue: 26_800, totalSpend: 1_634_800, segment: "Tail" },
    { supplierId: "SUP-1024", supplierName: "Everest Housekeeping Services", category: "Facility, Housekeeping & Admin", poCount: 43, avgPOValue: 16_200, totalSpend: 696_600, segment: "Tail" },
    { supplierId: "SUP-1025", supplierName: "Siddhi Vinayak Traders", category: "Safety & PPE", poCount: 79, avgPOValue: 10_900, totalSpend: 861_100, segment: "Tail" },
    { supplierId: "SUP-1026", supplierName: "New India Freight Movers", category: "Logistics, Freight & Handling", poCount: 34, avgPOValue: 33_600, totalSpend: 1_142_400, segment: "Tail" },
    { supplierId: "SUP-1027", supplierName: "Gokul Industrial Traders", category: "MRO – Mechanical Consumables", poCount: 97, avgPOValue: 8_600, totalSpend: 834_200, segment: "Tail" },
    { supplierId: "SUP-1028", supplierName: "Prime Chemical Distributors", category: "Chemicals & Reagents", poCount: 45, avgPOValue: 27_900, totalSpend: 1_255_500, segment: "Tail" },
    { supplierId: "SUP-1029", supplierName: "Vaishnavi Print Solutions", category: "Office Supplies, Stationery & Misc", poCount: 112, avgPOValue: 4_200, totalSpend: 470_400, segment: "Tail" },
    { supplierId: "SUP-1030", supplierName: "Sanjay Hardware Mart", category: "MRO – Mechanical Consumables", poCount: 89, avgPOValue: 11_700, totalSpend: 1_041_300, segment: "Tail" },
    { supplierId: "SUP-1031", supplierName: "Digital Age Computers", category: "IT, Electronics & Software", poCount: 51, avgPOValue: 19_400, totalSpend: 989_400, segment: "Tail" },
    { supplierId: "SUP-1032", supplierName: "Mahalaxmi Facility Mgmt", category: "Facility, Housekeeping & Admin", poCount: 66, avgPOValue: 12_800, totalSpend: 844_800, segment: "Tail" },
    { supplierId: "SUP-1033", supplierName: "Sterling Safety Solutions", category: "Safety & PPE", poCount: 72, avgPOValue: 15_600, totalSpend: 1_123_200, segment: "Tail" },
    { supplierId: "SUP-1034", supplierName: "Ganesh Transport Co.", category: "Logistics, Freight & Handling", poCount: 41, avgPOValue: 24_800, totalSpend: 1_016_800, segment: "Tail" },

    { supplierId: "SUP-2001", supplierName: "Sundaram Spares & Components", category: "Mining Equipment Spares", poCount: 62, avgPOValue: 185_000, totalSpend: 11_470_000, segment: "Core" },
    { supplierId: "SUP-2002", supplierName: "Precision Electricals Ltd.", category: "Electrical & Instrumentation Spares", poCount: 54, avgPOValue: 220_000, totalSpend: 11_880_000, segment: "Core" },
    { supplierId: "SUP-2003", supplierName: "Bharat Mechanical Works", category: "MRO – Mechanical Consumables", poCount: 71, avgPOValue: 165_000, totalSpend: 11_715_000, segment: "Core" },
    { supplierId: "SUP-2004", supplierName: "Continental Chemicals Pvt Ltd", category: "Chemicals & Reagents", poCount: 48, avgPOValue: 310_000, totalSpend: 14_880_000, segment: "Core" },
    { supplierId: "SUP-2005", supplierName: "Krishna Civil Contractors", category: "Civil, Structural & Construction", poCount: 39, avgPOValue: 410_000, totalSpend: 15_990_000, segment: "Core" },
    { supplierId: "SUP-2006", supplierName: "Reliable Freight Carriers", category: "Logistics, Freight & Handling", poCount: 58, avgPOValue: 195_000, totalSpend: 11_310_000, segment: "Core" },
    { supplierId: "SUP-2007", supplierName: "Apex Instrumentation Co.", category: "Electrical & Instrumentation Spares", poCount: 44, avgPOValue: 260_000, totalSpend: 11_440_000, segment: "Core" },
    { supplierId: "SUP-2008", supplierName: "National Mining Spares", category: "Mining Equipment Spares", poCount: 37, avgPOValue: 340_000, totalSpend: 12_580_000, segment: "Core" },
    { supplierId: "SUP-2009", supplierName: "Vardhman Structural Works", category: "Civil, Structural & Construction", poCount: 33, avgPOValue: 385_000, totalSpend: 12_705_000, segment: "Core" },
    { supplierId: "SUP-2010", supplierName: "Orient Chemical Industries", category: "Chemicals & Reagents", poCount: 29, avgPOValue: 295_000, totalSpend: 8_555_000, segment: "Core" },

    { supplierId: "SUP-3001", supplierName: "Larsen Heavy Equipment Ltd.", category: "Capital Equipment & Capex Contracts", poCount: 12, avgPOValue: 42_500_000, totalSpend: 510_000_000, segment: "Strategic" },
    { supplierId: "SUP-3002", supplierName: "Vedanta EPC Partners", category: "Capital Equipment & Capex Contracts", poCount: 9, avgPOValue: 38_200_000, totalSpend: 343_800_000, segment: "Strategic" },
    { supplierId: "SUP-3003", supplierName: "Continental Mining Systems", category: "Mining Equipment Spares", poCount: 18, avgPOValue: 21_400_000, totalSpend: 385_200_000, segment: "Strategic" },
    { supplierId: "SUP-3004", supplierName: "TransIndia Bulk Logistics", category: "Logistics, Freight & Handling", poCount: 26, avgPOValue: 12_800_000, totalSpend: 332_800_000, segment: "Strategic" },
    { supplierId: "SUP-3005", supplierName: "Apex Civil & Infra Ltd.", category: "Civil, Structural & Construction", poCount: 15, avgPOValue: 18_600_000, totalSpend: 279_000_000, segment: "Strategic" },
    { supplierId: "SUP-3006", supplierName: "Global Process Chemicals", category: "Chemicals & Reagents", poCount: 21, avgPOValue: 9_200_000, totalSpend: 193_200_000, segment: "Strategic" },
  ],

  consolidationCandidates: [
    { supplierId: "SUP-1021", supplierName: "Rani Enterprises", category: "Office Supplies, Stationery & Misc", poCount: 136, microPOCount: 129, totalSpend: 516_800, avgPOValue: 3_800, processingCost: 680_000, potentialSavings: 442_000, consolidationScore: 96, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1006", supplierName: "Sunrise Office Mart", category: "Office Supplies, Stationery & Misc", poCount: 142, microPOCount: 133, totalSpend: 795_200, avgPOValue: 5_600, processingCost: 710_000, potentialSavings: 461_500, consolidationScore: 95, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1029", supplierName: "Vaishnavi Print Solutions", category: "Office Supplies, Stationery & Misc", poCount: 112, microPOCount: 105, totalSpend: 470_400, avgPOValue: 4_200, processingCost: 560_000, potentialSavings: 364_000, consolidationScore: 94, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1014", supplierName: "Global Print & Stationers", category: "Office Supplies, Stationery & Misc", poCount: 129, microPOCount: 118, totalSpend: 632_100, avgPOValue: 4_900, processingCost: 645_000, potentialSavings: 419_250, consolidationScore: 93, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1002", supplierName: "Om Sai Enterprises", category: "MRO – Mechanical Consumables", poCount: 134, microPOCount: 96, totalSpend: 1_688_400, avgPOValue: 12_600, processingCost: 670_000, potentialSavings: 402_000, consolidationScore: 90, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1035", supplierName: "Sanman Traders (Alt Site)", category: "Safety & PPE", poCount: 108, microPOCount: 85, totalSpend: 1_058_400, avgPOValue: 9_800, processingCost: 540_000, potentialSavings: 324_000, consolidationScore: 89, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1011", supplierName: "Metro Fastener House", category: "MRO – Mechanical Consumables", poCount: 105, microPOCount: 88, totalSpend: 955_500, avgPOValue: 9_100, processingCost: 525_000, potentialSavings: 315_000, consolidationScore: 88, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1030", supplierName: "Sanjay Hardware Mart", category: "MRO – Mechanical Consumables", poCount: 89, microPOCount: 79, totalSpend: 1_041_300, avgPOValue: 11_700, processingCost: 445_000, potentialSavings: 267_000, consolidationScore: 86, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1004", supplierName: "National Safety Equipments", category: "Safety & PPE", poCount: 108, microPOCount: 92, totalSpend: 1_058_400, avgPOValue: 9_800, processingCost: 540_000, potentialSavings: 297_000, consolidationScore: 85, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1008", supplierName: "Raghav Facility Services", category: "Facility, Housekeeping & Admin", poCount: 121, microPOCount: 74, totalSpend: 1_718_200, avgPOValue: 14_200, processingCost: 605_000, potentialSavings: 302_500, consolidationScore: 84, recommendedAction: "Consolidate" },
    { supplierId: "SUP-1003", supplierName: "Vikas Hardware & Fasteners", category: "MRO – Mechanical Consumables", poCount: 96, microPOCount: 71, totalSpend: 1_459_200, avgPOValue: 15_200, processingCost: 480_000, potentialSavings: 264_000, consolidationScore: 83, recommendedAction: "Contract" },
    { supplierId: "SUP-1009", supplierName: "Jai Bharat Cleaning Co.", category: "Facility, Housekeeping & Admin", poCount: 99, microPOCount: 68, totalSpend: 1_039_500, avgPOValue: 10_500, processingCost: 495_000, potentialSavings: 247_500, consolidationScore: 82, recommendedAction: "Contract" },
    { supplierId: "SUP-1016", supplierName: "Shivam Safety Gears", category: "Safety & PPE", poCount: 91, microPOCount: 76, totalSpend: 719_900, avgPOValue: 7_900, processingCost: 455_000, potentialSavings: 250_250, consolidationScore: 81, recommendedAction: "Contract" },
    { supplierId: "SUP-1027", supplierName: "Gokul Industrial Traders", category: "MRO – Mechanical Consumables", poCount: 97, microPOCount: 81, totalSpend: 834_200, avgPOValue: 8_600, processingCost: 485_000, potentialSavings: 242_500, consolidationScore: 80, recommendedAction: "Contract" },
    { supplierId: "SUP-1025", supplierName: "Siddhi Vinayak Traders", category: "Safety & PPE", poCount: 79, microPOCount: 62, totalSpend: 861_100, avgPOValue: 10_900, processingCost: 395_000, potentialSavings: 197_500, consolidationScore: 78, recommendedAction: "Contract" },
    { supplierId: "SUP-1022", supplierName: "Bhairav Traders", category: "MRO – Mechanical Consumables", poCount: 74, microPOCount: 51, totalSpend: 1_450_400, avgPOValue: 19_600, processingCost: 370_000, potentialSavings: 166_500, consolidationScore: 75, recommendedAction: "Contract" },
    { supplierId: "SUP-1032", supplierName: "Mahalaxmi Facility Mgmt", category: "Facility, Housekeeping & Admin", poCount: 66, microPOCount: 48, totalSpend: 844_800, avgPOValue: 12_800, processingCost: 330_000, potentialSavings: 148_500, consolidationScore: 73, recommendedAction: "Contract" },
    { supplierId: "SUP-1007", supplierName: "Anand Computers & Peripherals", category: "IT, Electronics & Software", poCount: 76, microPOCount: 44, totalSpend: 1_436_400, avgPOValue: 18_900, processingCost: 380_000, potentialSavings: 152_000, consolidationScore: 71, recommendedAction: "Contract" },
    { supplierId: "SUP-1033", supplierName: "Sterling Safety Solutions", category: "Safety & PPE", poCount: 72, microPOCount: 41, totalSpend: 1_123_200, avgPOValue: 15_600, processingCost: 360_000, potentialSavings: 144_000, consolidationScore: 69, recommendedAction: "Monitor" },
    { supplierId: "SUP-1019", supplierName: "Patel Engineering Works", category: "MRO – Mechanical Consumables", poCount: 82, microPOCount: 39, totalSpend: 1_418_600, avgPOValue: 17_300, processingCost: 410_000, potentialSavings: 143_500, consolidationScore: 67, recommendedAction: "Monitor" },
    { supplierId: "SUP-1013", supplierName: "Vedika IT Solutions", category: "IT, Electronics & Software", poCount: 63, microPOCount: 32, totalSpend: 1_058_400, avgPOValue: 16_800, processingCost: 315_000, potentialSavings: 110_250, consolidationScore: 64, recommendedAction: "Monitor" },
    { supplierId: "SUP-1015", supplierName: "Trimurti Pest Control", category: "Facility, Housekeeping & Admin", poCount: 54, microPOCount: 29, totalSpend: 734_400, avgPOValue: 13_600, processingCost: 270_000, potentialSavings: 94_500, consolidationScore: 61, recommendedAction: "Monitor" },
    { supplierId: "SUP-1010", supplierName: "Deccan Chemicals Trading", category: "Chemicals & Reagents", poCount: 68, microPOCount: 22, totalSpend: 1_523_200, avgPOValue: 22_400, processingCost: 340_000, potentialSavings: 88_400, consolidationScore: 58, recommendedAction: "Monitor" },
    { supplierId: "SUP-1020", supplierName: "Unique Office Automation", category: "IT, Electronics & Software", poCount: 58, microPOCount: 19, totalSpend: 1_252_800, avgPOValue: 21_600, processingCost: 290_000, potentialSavings: 72_500, consolidationScore: 55, recommendedAction: "Monitor" },
    { supplierId: "SUP-1031", supplierName: "Digital Age Computers", category: "IT, Electronics & Software", poCount: 51, microPOCount: 17, totalSpend: 989_400, avgPOValue: 19_400, processingCost: 255_000, potentialSavings: 63_750, consolidationScore: 52, recommendedAction: "Monitor" },
  ],

  // --- SAP Spend Control Tower (Tier 1) ------------------------------------
  // Invoice-centric counts run slightly ahead of PO counts above (a PO can be
  // billed across several invoices); Global Ultimate supplier count is lower
  // than the raw active-supplier count since it groups child suppliers under
  // their parent entity.

  sapKpiRibbon: {
    invoiceCount: 214_800,
    supplierCountGlobalUltimate: 3_120,
    meanInvoiceAmountPerSupplier: 15_576_923,
    meanInvoicesPerSupplier: 68.8,
  },

  invoiceValueBuckets: [
    { bucketLabel: "<1K", invoiceCount: 42_500, invoicesPerSupplier: 24.3, spend: 21_250_000, spendPercent: 0.04 },
    { bucketLabel: "1K-5K", invoiceCount: 51_300, invoicesPerSupplier: 18.7, spend: 153_900_000, spendPercent: 0.32 },
    { bucketLabel: "5K-10K", invoiceCount: 38_900, invoicesPerSupplier: 13.4, spend: 291_750_000, spendPercent: 0.6 },
    { bucketLabel: "10K-100K", invoiceCount: 46_700, invoicesPerSupplier: 9.6, spend: 2_568_500_000, spendPercent: 5.28 },
    { bucketLabel: "100K-1M", invoiceCount: 25_800, invoicesPerSupplier: 5.8, spend: 12_900_000_000, spendPercent: 26.54 },
    { bucketLabel: "1M-5M", invoiceCount: 7_400, invoicesPerSupplier: 2.1, spend: 18_500_000_000, spendPercent: 38.07 },
    { bucketLabel: ">5M", invoiceCount: 2_200, invoicesPerSupplier: 1.2, spend: 14_164_600_000, spendPercent: 29.15 },
  ],

  supplierSpendRank: [
    { supplierId: "SUP-3001", supplierName: "Larsen Heavy Equipment Ltd.", totalSpend: 510_000_000 },
    { supplierId: "SUP-3002", supplierName: "Vedanta EPC Partners", totalSpend: 343_800_000 },
    { supplierId: "SUP-3003", supplierName: "Continental Mining Systems", totalSpend: 385_200_000 },
    { supplierId: "SUP-3004", supplierName: "TransIndia Bulk Logistics", totalSpend: 332_800_000 },
    { supplierId: "SUP-3005", supplierName: "Apex Civil & Infra Ltd.", totalSpend: 279_000_000 },
    { supplierId: "SUP-3006", supplierName: "Global Process Chemicals", totalSpend: 193_200_000 },
    { supplierId: "SUP-2005", supplierName: "Krishna Civil Contractors", totalSpend: 15_990_000 },
    { supplierId: "SUP-2004", supplierName: "Continental Chemicals Pvt Ltd", totalSpend: 14_880_000 },
    { supplierId: "SUP-2009", supplierName: "Vardhman Structural Works", totalSpend: 12_705_000 },
    { supplierId: "SUP-2008", supplierName: "National Mining Spares", totalSpend: 12_580_000 },
  ],

  sapCategoryRows: [
    { code: "CAP-EQP", category: "Capital Equipment & Capex Contracts", supplierCount: 45, spend: 10_692_000_000 },
    { code: "MIN-SPR", category: "Mining Equipment Spares", supplierCount: 680, spend: 9_306_900_000 },
    { code: "CIV-CON", category: "Civil, Structural & Construction", supplierCount: 380, spend: 5_710_500_000 },
    { code: "LOG-FRT", category: "Logistics, Freight & Handling", supplierCount: 410, spend: 5_005_800_000 },
    { code: "ELE-INS", category: "Electrical & Instrumentation Spares", supplierCount: 520, spend: 5_346_000_000 },
    { code: "MRO-MEC", category: "MRO – Mechanical Consumables", supplierCount: 890, spend: 4_179_600_000 },
    { code: "CHM-REA", category: "Chemicals & Reagents", supplierCount: 310, spend: 3_304_800_000 },
    { code: "SAF-PPE", category: "Safety & PPE", supplierCount: 640, spend: 1_555_200_000 },
    { code: "ITE-SFT", category: "IT, Electronics & Software", supplierCount: 480, spend: 1_263_600_000 },
    { code: "FAC-ADM", category: "Facility, Housekeeping & Admin", supplierCount: 520, spend: 1_166_400_000 },
    { code: "OFF-STA", category: "Office Supplies, Stationery & Misc", supplierCount: 365, spend: 1_069_200_000 },
  ],

  sapSupplierReport: [
    { supplierId: "SUP-3001", supplierName: "Larsen Heavy Equipment Ltd.", invoiceCount: 58, plantCount: 6, categoryCount: 3, productCount: 142, costCenterCount: 12, spend: 510_000_000 },
    { supplierId: "SUP-3002", supplierName: "Vedanta EPC Partners", invoiceCount: 44, plantCount: 4, categoryCount: 2, productCount: 96, costCenterCount: 9, spend: 343_800_000 },
    { supplierId: "SUP-3003", supplierName: "Continental Mining Systems", invoiceCount: 71, plantCount: 5, categoryCount: 2, productCount: 118, costCenterCount: 10, spend: 385_200_000 },
    { supplierId: "SUP-3004", supplierName: "TransIndia Bulk Logistics", invoiceCount: 96, plantCount: 8, categoryCount: 1, productCount: 34, costCenterCount: 14, spend: 332_800_000 },
    { supplierId: "SUP-3005", supplierName: "Apex Civil & Infra Ltd.", invoiceCount: 39, plantCount: 3, categoryCount: 1, productCount: 27, costCenterCount: 6, spend: 279_000_000 },
    { supplierId: "SUP-3006", supplierName: "Global Process Chemicals", invoiceCount: 54, plantCount: 4, categoryCount: 2, productCount: 61, costCenterCount: 7, spend: 193_200_000 },
    { supplierId: "SUP-2005", supplierName: "Krishna Civil Contractors", invoiceCount: 39, plantCount: 2, categoryCount: 1, productCount: 18, costCenterCount: 4, spend: 15_990_000 },
    { supplierId: "SUP-2004", supplierName: "Continental Chemicals Pvt Ltd", invoiceCount: 48, plantCount: 3, categoryCount: 1, productCount: 29, costCenterCount: 5, spend: 14_880_000 },
    { supplierId: "SUP-2002", supplierName: "Precision Electricals Ltd.", invoiceCount: 54, plantCount: 3, categoryCount: 1, productCount: 41, costCenterCount: 6, spend: 11_880_000 },
    { supplierId: "SUP-2003", supplierName: "Bharat Mechanical Works", invoiceCount: 71, plantCount: 4, categoryCount: 2, productCount: 58, costCenterCount: 8, spend: 11_715_000 },
    { supplierId: "SUP-2001", supplierName: "Sundaram Spares & Components", invoiceCount: 62, plantCount: 3, categoryCount: 1, productCount: 37, costCenterCount: 5, spend: 11_470_000 },
    { supplierId: "SUP-2007", supplierName: "Apex Instrumentation Co.", invoiceCount: 44, plantCount: 2, categoryCount: 1, productCount: 22, costCenterCount: 4, spend: 11_440_000 },
    { supplierId: "SUP-1002", supplierName: "Om Sai Enterprises", invoiceCount: 134, plantCount: 1, categoryCount: 1, productCount: 8, costCenterCount: 2, spend: 1_688_400 },
    { supplierId: "SUP-1008", supplierName: "Raghav Facility Services", invoiceCount: 121, plantCount: 1, categoryCount: 1, productCount: 6, costCenterCount: 3, spend: 1_718_200 },
    { supplierId: "SUP-1012", supplierName: "Sanman Electricals Trading", invoiceCount: 88, plantCount: 1, categoryCount: 1, productCount: 11, costCenterCount: 2, spend: 2_164_800 },
  ],

  sapFilterOptions: {
    dateRanges: ["Jan 2025 – Dec 2025", "Jul 2025 – Jun 2026", "Jan 2024 – Dec 2024", "Apr 2025 – Mar 2026"],
    sourceSystems: ["SAP ECC", "SAP S/4HANA", "Ariba", "Coupa"],
    plantSites: ["Jharsuguda (Odisha)", "Lanjigarh (Odisha)", "Korba (Chhattisgarh)", "Chanderiya (Rajasthan)", "Zawar Mines (Rajasthan)", "Tuticorin (Tamil Nadu)", "Goa"],
  },
};

/** Compact INR formatter: crore / lakh for large values, comma-grouped for small ones. */
export function formatINR(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) {
    return `₹${(value / 1_00_00_000).toFixed(abs >= 100_00_00_000 ? 0 : 1)} Cr`;
  }
  if (abs >= 1_00_000) {
    return `₹${(value / 1_00_000).toFixed(1)} L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
}

/** Full, comma-grouped INR value — for tables and tooltips where precision matters. */
export function formatINRFull(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

/**
 * Re-estimates micro-PO count/value/processing-cost for an arbitrary threshold by
 * linearly interpolating within whichever PO-value bucket the threshold falls in.
 * Used by the threshold slider so KPIs and the donut respond without new "data".
 */
export function estimateMicroPOStats(
  buckets: POValueBucket[],
  threshold: number
): { poCount: number; totalValue: number; processingCost: number } {
  const boundaries = [5_000, 25_000, 100_000, 500_000, 2_500_000, Infinity];
  let poCount = 0;
  let totalValue = 0;
  let lower = 0;

  for (let i = 0; i < buckets.length; i++) {
    const upper = boundaries[i];
    if (threshold >= upper) {
      poCount += buckets[i].poCount;
      totalValue += buckets[i].totalValue;
    } else if (threshold > lower) {
      const fraction = (threshold - lower) / (upper - lower);
      poCount += buckets[i].poCount * fraction;
      totalValue += buckets[i].totalValue * fraction;
      break;
    } else {
      break;
    }
    lower = upper;
  }

  const roundedPoCount = Math.round(poCount);
  return {
    poCount: roundedPoCount,
    totalValue: Math.round(totalValue),
    processingCost: roundedPoCount * 5_000,
  };
}

export function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 100_000) {
    return `${(value / 100_000).toFixed(1)}L`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString("en-IN");
}
