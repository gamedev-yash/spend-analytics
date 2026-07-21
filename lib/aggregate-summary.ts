import "server-only";

import {
  purchaseOrders,
  materialById,
  supplierById,
  contracts,
  CATEGORIES,
  BUSINESS_UNITS,
  spendSummary,
} from "@/lib/raw-data";
import type { PurchaseOrder, SummaryFilters } from "@/lib/types";

export function getSummaryFilterOptions() {
  return { categories: CATEGORIES, businessUnits: BUSINESS_UNITS };
}

export function getFilteredPurchaseOrders(filters: SummaryFilters): PurchaseOrder[] {
  return purchaseOrders.filter((po) => {
    if (filters.businessUnit && po.businessUnit !== filters.businessUnit) return false;
    if (filters.category) {
      const material = materialById.get(po.materialId);
      if (!material || material.category !== filters.category) return false;
    }
    return true;
  });
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface MonthlyTrendPoint {
  month: string;
  totalSpend: number;
  contractSpend: number;
  nonContractSpend: number;
}

export function getMonthlySpendTrend(filters: SummaryFilters): MonthlyTrendPoint[] {
  const filtered = getFilteredPurchaseOrders(filters);
  const buckets = MONTH_LABELS.map((label) => ({
    month: label,
    totalSpend: 0,
    contractSpend: 0,
    nonContractSpend: 0,
  }));

  for (const po of filtered) {
    const idx = new Date(po.poDate).getUTCMonth();
    buckets[idx].totalSpend += po.totalAmount;
    if (po.contracted) buckets[idx].contractSpend += po.totalAmount;
    else buckets[idx].nonContractSpend += po.totalAmount;
  }

  return buckets.map((b) => ({
    month: b.month,
    totalSpend: round2(b.totalSpend),
    contractSpend: round2(b.contractSpend),
    nonContractSpend: round2(b.nonContractSpend),
  }));
}

export interface CategorySpendPoint {
  category: string;
  spend: number;
  percentage: number;
}

export function getCategorySpend(filters: SummaryFilters): CategorySpendPoint[] {
  const filtered = getFilteredPurchaseOrders(filters);
  const totals = new Map<string, number>();
  let grandTotal = 0;

  for (const po of filtered) {
    const material = materialById.get(po.materialId);
    if (!material) continue;
    totals.set(material.category, (totals.get(material.category) ?? 0) + po.totalAmount);
    grandTotal += po.totalAmount;
  }

  return Array.from(totals.entries())
    .map(([category, spend]) => ({
      category,
      spend: round2(spend),
      percentage: grandTotal > 0 ? round2((spend / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}

export interface PlantSpendPoint {
  plant: string;
  businessUnit: string;
  spend: number;
}

export function getPlantSpend(filters: SummaryFilters): PlantSpendPoint[] {
  const filtered = getFilteredPurchaseOrders(filters);
  const totals = new Map<string, { businessUnit: string; spend: number }>();

  for (const po of filtered) {
    const existing = totals.get(po.plant);
    if (existing) existing.spend += po.totalAmount;
    else totals.set(po.plant, { businessUnit: po.businessUnit, spend: po.totalAmount });
  }

  return Array.from(totals.entries())
    .map(([plant, v]) => ({ plant, businessUnit: v.businessUnit, spend: round2(v.spend) }))
    .sort((a, b) => b.spend - a.spend);
}

export interface TopSupplierRow {
  supplierId: string;
  supplierName: string;
  totalSpend: number;
  contractSpend: number;
  nonContractSpend: number;
  onTimeDeliveryPercent: number;
  supplierRating: number;
  purchaseOrders: number;
  preferredSupplier: boolean;
}

export function getTopSuppliers(filters: SummaryFilters, limit = 10): TopSupplierRow[] {
  const filtered = getFilteredPurchaseOrders(filters);
  const bySupplier = new Map<
    string,
    { totalSpend: number; contractSpend: number; onTime: number; count: number }
  >();

  for (const po of filtered) {
    const entry = bySupplier.get(po.supplierId) ?? {
      totalSpend: 0,
      contractSpend: 0,
      onTime: 0,
      count: 0,
    };
    entry.totalSpend += po.totalAmount;
    if (po.contracted) entry.contractSpend += po.totalAmount;
    if (po.deliveryStatus === "On Time" || po.deliveryStatus === "Early") entry.onTime += 1;
    entry.count += 1;
    bySupplier.set(po.supplierId, entry);
  }

  return Array.from(bySupplier.entries())
    .map(([supplierId, v]) => {
      const supplier = supplierById.get(supplierId);
      return {
        supplierId,
        supplierName: supplier?.supplierName ?? supplierId,
        totalSpend: round2(v.totalSpend),
        contractSpend: round2(v.contractSpend),
        nonContractSpend: round2(v.totalSpend - v.contractSpend),
        onTimeDeliveryPercent: round2((v.onTime / v.count) * 100),
        supplierRating: supplier?.supplierRating ?? 0,
        purchaseOrders: v.count,
        preferredSupplier: supplier?.preferredSupplier ?? false,
      };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, limit);
}

export interface FilteredHeadline {
  totalSpend: number;
  poCount: number;
  supplierCount: number;
  averagePOValue: number;
}

export function getFilteredHeadline(filters: SummaryFilters): FilteredHeadline {
  const filtered = getFilteredPurchaseOrders(filters);
  const totalSpend = filtered.reduce((s, po) => s + po.totalAmount, 0);
  const supplierCount = new Set(filtered.map((po) => po.supplierId)).size;
  return {
    totalSpend: round2(totalSpend),
    poCount: filtered.length,
    supplierCount,
    averagePOValue: filtered.length ? round2(totalSpend / filtered.length) : 0,
  };
}

export function getSavingsTrend(): { month: string; savings: number }[] {
  return spendSummary.map((m) => ({ month: m.month, savings: round2(m.savings) }));
}

export function getActiveContractsCount(): number {
  return contracts.filter((c) => c.contractStatus === "Active").length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
