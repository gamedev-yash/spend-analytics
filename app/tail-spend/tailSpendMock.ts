export interface InvoiceValueBucket {
  bucketLabel: string;
  invoiceCount: number;
  totalValue: number;
  percentOfTotalValue: number;
}

export interface ParetoPoint {
  supplierPercentile: number;
  cumulativeSpendPercent: number;
}

export interface TailSpendData {
  totalInvoices: number;
  totalSuppliers: number;
  tailSpendThreshold: number;
  tailSpendPercentOfInvoices: number;
  tailSpendPercentOfValue: number;
  valueBuckets: InvoiceValueBucket[];
  paretoDistribution: ParetoPoint[];
}

export const tailSpendMock: TailSpendData = {
  totalInvoices: 48_250,
  totalSuppliers: 3_140,
  tailSpendThreshold: 5_000,
  tailSpendPercentOfInvoices: 61,
  tailSpendPercentOfValue: 4.2,
  valueBuckets: [
    { bucketLabel: "< $1K", invoiceCount: 18_400, totalValue: 6_900_000, percentOfTotalValue: 1.1 },
    { bucketLabel: "$1K - $5K", invoiceCount: 11_050, totalValue: 21_300_000, percentOfTotalValue: 3.1 },
    { bucketLabel: "$5K - $25K", invoiceCount: 9_820, totalValue: 96_400_000, percentOfTotalValue: 14.2 },
    { bucketLabel: "$25K - $100K", invoiceCount: 5_960, totalValue: 218_700_000, percentOfTotalValue: 32.3 },
    { bucketLabel: "> $100K", invoiceCount: 3_020, totalValue: 333_100_000, percentOfTotalValue: 49.3 },
  ],
  paretoDistribution: [
    { supplierPercentile: 10, cumulativeSpendPercent: 68 },
    { supplierPercentile: 20, cumulativeSpendPercent: 80 },
    { supplierPercentile: 40, cumulativeSpendPercent: 91 },
    { supplierPercentile: 60, cumulativeSpendPercent: 96 },
    { supplierPercentile: 80, cumulativeSpendPercent: 99 },
    { supplierPercentile: 100, cumulativeSpendPercent: 100 },
  ],
};
