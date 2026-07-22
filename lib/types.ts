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

export interface ComplianceFilters {
  businessUnit?: string;
  riskLevel?: RiskLevel;
}
