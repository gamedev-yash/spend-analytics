import "server-only";

import suppliersJson from "@/data/suppliers.json";
import purchaseOrdersJson from "@/data/purchaseOrders.json";
import complianceJson from "@/data/compliance.json";
import type { Supplier, PurchaseOrder, ComplianceRecord } from "@/lib/types";

/**
 * Single server-side entry point for the Compliance dashboard's raw
 * transactional JSON (the Summary dashboard now runs on lib/sap instead).
 * Charts and pages never import these files directly — they consume
 * pre-aggregated view models from lib/aggregate-compliance.ts so large
 * arrays (purchaseOrders, compliance) never reach the client bundle.
 */
export const suppliers = suppliersJson as Supplier[];
export const purchaseOrders = purchaseOrdersJson as PurchaseOrder[];
export const compliance = complianceJson as ComplianceRecord[];

export const supplierById = new Map(suppliers.map((s) => [s.supplierId, s]));
export const purchaseOrderById = new Map(purchaseOrders.map((po) => [po.poId, po]));

export const BUSINESS_UNITS = Array.from(new Set(purchaseOrders.map((po) => po.businessUnit))).sort();
