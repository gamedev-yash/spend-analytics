export interface PaymentTermBucket {
  termLabel: string;
  invoiceCount: number;
  percentOfSpend: number;
}

export interface PaymentTermsData {
  averageDpo: number;
  targetDpo: number;
  buckets: PaymentTermBucket[];
}

export const paymentTermsMock: PaymentTermsData = {
  averageDpo: 42.6,
  targetDpo: 45,
  buckets: [
    { termLabel: "Net 30", invoiceCount: 4820, percentOfSpend: 38 },
    { termLabel: "Net 45", invoiceCount: 3110, percentOfSpend: 27 },
    { termLabel: "Net 60", invoiceCount: 2075, percentOfSpend: 19 },
    { termLabel: "Net 90", invoiceCount: 960, percentOfSpend: 11 },
    { termLabel: "Immediate", invoiceCount: 540, percentOfSpend: 5 },
  ],
};
