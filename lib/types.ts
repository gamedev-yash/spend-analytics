export interface Supplier {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  country: string;
  state: string;
  city: string;
  supplierType: string;
  preferredSupplier: boolean;
  diverseSupplier: boolean;
  active: boolean;
  supplierRating: number;
  qualityScore: number;
  deliveryScore: number;
  contracted: boolean;
  paymentTerms: string;
  currency: string;
}

export interface Material {
  materialId: string;
  materialCode: string;
  materialName: string;
  category: string;
  subcategory: string;
  uom: string;
  manufacturer: string;
  preferredSupplierId: string;
}

export type DeliveryStatus = "On Time" | "Early" | "Delayed" | "Pending" | "Cancelled";
export type PaymentStatus = "Paid" | "Pending" | "Overdue" | "Partially Paid";

export interface PurchaseOrder {
  poId: string;
  poNumber: string;
  poDate: string;
  supplierId: string;
  materialId: string;
  plant: string;
  businessUnit: string;
  department: string;
  buyer: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  tax: number;
  freight: number;
  discount: number;
  totalAmount: number;
  contractId: string | null;
  contracted: boolean;
  maverickSpend: boolean;
  deliveryStatus: DeliveryStatus;
  leadTimeDays: number;
  paymentStatus: PaymentStatus;
}

export interface Invoice {
  invoiceId: string;
  poId: string;
  invoiceDate: string;
  invoiceAmount: number;
  paidAmount: number;
  paymentDate: string | null;
  paymentStatus: PaymentStatus;
}

export type ContractStatus = "Active" | "Expired" | "Terminated" | "Draft";

export interface Contract {
  contractId: string;
  supplierId: string;
  contractNumber: string;
  startDate: string;
  endDate: string;
  contractValue: number;
  remainingValue: number;
  contractType: string;
  contractStatus: ContractStatus;
}

export interface SpendSummaryMonth {
  month: string;
  totalSpend: number;
  contractSpend: number;
  nonContractSpend: number;
  maverickSpend: number;
  savings: number;
  averagePOValue: number;
  supplierCount: number;
  poCount: number;
  invoiceCount: number;
}

export type RiskLevel = "Low" | "Medium" | "High";
export type ViolationType =
  | "Off-Contract Purchase"
  | "Price Deviation"
  | "Missing Approval"
  | "Policy Breach"
  | "Late Delivery";

export interface ComplianceRecord {
  transactionId: string;
  supplierId: string;
  poId: string;
  contractCompliance: boolean;
  pricingCompliance: boolean;
  policyCompliance: boolean;
  approvalCompliance: boolean;
  deliveryCompliance: boolean;
  overallCompliance: number;
  violationType: ViolationType | null;
  riskLevel: RiskLevel;
}

export interface SavingRecord {
  savingId: string;
  supplierId: string;
  materialId: string;
  previousPrice: number;
  currentPrice: number;
  savingAmount: number;
  savingPercentage: number;
  savingReason: string;
}

export interface Kpis {
  totalSpend: number;
  spendUnderContract: number;
  contractCompliancePercent: number;
  supplierCompliancePercent: number;
  maverickSpend: number;
  savingsAchieved: number;
  averagePOValue: number;
  totalSuppliers: number;
  preferredSuppliers: number;
  activeContracts: number;
  totalPurchaseOrders: number;
  averageSupplierRating: number;
  spendGrowthPercent: number;
  monthlySpendTrend: { month: string; spend: number }[];
}

export interface SummaryFilters {
  businessUnit?: string;
  category?: string;
}

export interface ComplianceFilters {
  businessUnit?: string;
  riskLevel?: RiskLevel;
}
