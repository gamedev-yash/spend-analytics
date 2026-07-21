import "server-only";

import suppliersJson from "@/data/suppliers.json";
import materialsJson from "@/data/materials.json";
import purchaseOrdersJson from "@/data/purchaseOrders.json";
import contractsJson from "@/data/contracts.json";
import complianceJson from "@/data/compliance.json";
import kpisJson from "@/data/kpis.json";
import spendSummaryJson from "@/data/spendSummary.json";
import type {
  Supplier,
  Material,
  PurchaseOrder,
  Contract,
  ComplianceRecord,
  Kpis,
  SpendSummaryMonth,
} from "@/lib/types";

/**
 * Single server-side entry point for the raw transactional JSON.
 * Charts and pages never import these files directly — they consume
 * pre-aggregated view models from lib/aggregate-*.ts so large arrays
 * (purchaseOrders, compliance) never reach the client bundle.
 */
export const suppliers = suppliersJson as Supplier[];
export const materials = materialsJson as Material[];
export const purchaseOrders = purchaseOrdersJson as PurchaseOrder[];
export const contracts = contractsJson as Contract[];
export const compliance = complianceJson as ComplianceRecord[];
export const kpis = kpisJson as Kpis;
export const spendSummary = spendSummaryJson as SpendSummaryMonth[];

export const supplierById = new Map(suppliers.map((s) => [s.supplierId, s]));
export const materialById = new Map(materials.map((m) => [m.materialId, m]));
export const purchaseOrderById = new Map(purchaseOrders.map((po) => [po.poId, po]));

export const CATEGORIES = Array.from(new Set(materials.map((m) => m.category))).sort();
export const BUSINESS_UNITS = Array.from(new Set(purchaseOrders.map((po) => po.businessUnit))).sort();
