import "server-only";

import {
  compliance,
  purchaseOrderById,
  supplierById,
  BUSINESS_UNITS,
} from "@/lib/raw-data";
import type { ComplianceFilters, ComplianceRecord, RiskLevel, ViolationType } from "@/lib/types";

const RISK_LEVELS: RiskLevel[] = ["Low", "Medium", "High"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function getComplianceFilterOptions() {
  return { businessUnits: BUSINESS_UNITS, riskLevels: RISK_LEVELS };
}

interface JoinedRecord extends ComplianceRecord {
  poDate: string | null;
  businessUnit: string | null;
  plant: string | null;
}

function joinWithPO(record: ComplianceRecord): JoinedRecord {
  const po = purchaseOrderById.get(record.poId);
  return {
    ...record,
    poDate: po?.poDate ?? null,
    businessUnit: po?.businessUnit ?? null,
    plant: po?.plant ?? null,
  };
}

export function getFilteredCompliance(filters: ComplianceFilters): JoinedRecord[] {
  return compliance
    .map(joinWithPO)
    .filter((r) => {
      if (filters.businessUnit && r.businessUnit !== filters.businessUnit) return false;
      if (filters.riskLevel && r.riskLevel !== filters.riskLevel) return false;
      return true;
    });
}

export interface ComplianceHeadline {
  totalTransactions: number;
  contractCompliancePercent: number;
  pricingCompliancePercent: number;
  policyCompliancePercent: number;
  approvalCompliancePercent: number;
  deliveryCompliancePercent: number;
  avgOverallCompliance: number;
  highRiskCount: number;
  totalViolations: number;
  onTimeDeliveryPercent: number;
}

export function getComplianceHeadline(filters: ComplianceFilters): ComplianceHeadline {
  const rows = getFilteredCompliance(filters);
  const n = rows.length || 1;

  const pct = (pred: (r: JoinedRecord) => boolean) =>
    round2((rows.filter(pred).length / n) * 100);

  return {
    totalTransactions: rows.length,
    contractCompliancePercent: pct((r) => r.contractCompliance),
    pricingCompliancePercent: pct((r) => r.pricingCompliance),
    policyCompliancePercent: pct((r) => r.policyCompliance),
    approvalCompliancePercent: pct((r) => r.approvalCompliance),
    deliveryCompliancePercent: pct((r) => r.deliveryCompliance),
    avgOverallCompliance: round2(rows.reduce((s, r) => s + r.overallCompliance, 0) / n),
    highRiskCount: rows.filter((r) => r.riskLevel === "High").length,
    totalViolations: rows.filter((r) => r.violationType !== null).length,
    onTimeDeliveryPercent: pct((r) => r.deliveryCompliance),
  };
}

export interface RiskDistributionPoint {
  riskLevel: RiskLevel;
  count: number;
  percentage: number;
}

export function getRiskDistribution(filters: ComplianceFilters): RiskDistributionPoint[] {
  const rows = getFilteredCompliance(filters);
  const total = rows.length || 1;
  return RISK_LEVELS.map((riskLevel) => {
    const count = rows.filter((r) => r.riskLevel === riskLevel).length;
    return { riskLevel, count, percentage: round2((count / total) * 100) };
  });
}

export interface DimensionPassRate {
  dimension: string;
  passRatePercent: number;
}

export function getDimensionPassRates(filters: ComplianceFilters): DimensionPassRate[] {
  const rows = getFilteredCompliance(filters);
  const n = rows.length || 1;
  const dims: { key: keyof ComplianceRecord; label: string }[] = [
    { key: "contractCompliance", label: "Contract" },
    { key: "pricingCompliance", label: "Pricing" },
    { key: "policyCompliance", label: "Policy" },
    { key: "approvalCompliance", label: "Approval" },
    { key: "deliveryCompliance", label: "Delivery" },
  ];
  return dims.map(({ key, label }) => ({
    dimension: label,
    passRatePercent: round2((rows.filter((r) => r[key] === true).length / n) * 100),
  }));
}

export interface ComplianceTrendPoint {
  month: string;
  avgOverallCompliance: number;
  violationCount: number;
}

export function getComplianceTrend(filters: ComplianceFilters): ComplianceTrendPoint[] {
  const rows = getFilteredCompliance(filters).filter((r) => r.poDate);
  const buckets = MONTH_LABELS.map(() => ({ sum: 0, count: 0, violations: 0 }));

  for (const r of rows) {
    const idx = new Date(r.poDate as string).getUTCMonth();
    buckets[idx].sum += r.overallCompliance;
    buckets[idx].count += 1;
    if (r.violationType) buckets[idx].violations += 1;
  }

  return MONTH_LABELS.map((month, idx) => ({
    month,
    avgOverallCompliance: buckets[idx].count ? round2(buckets[idx].sum / buckets[idx].count) : 0,
    violationCount: buckets[idx].violations,
  }));
}

export interface ViolationTypeCount {
  violationType: ViolationType;
  count: number;
}

export function getViolationTypeBreakdown(filters: ComplianceFilters): ViolationTypeCount[] {
  const rows = getFilteredCompliance(filters);
  const totals = new Map<ViolationType, number>();
  for (const r of rows) {
    if (!r.violationType) continue;
    totals.set(r.violationType, (totals.get(r.violationType) ?? 0) + 1);
  }
  return Array.from(totals.entries())
    .map(([violationType, count]) => ({ violationType, count }))
    .sort((a, b) => b.count - a.count);
}

export interface WorstSupplierRow {
  supplierId: string;
  supplierName: string;
  transactionCount: number;
  violationCount: number;
  avgOverallCompliance: number;
}

export function getWorstSuppliers(filters: ComplianceFilters, limit = 10): WorstSupplierRow[] {
  const rows = getFilteredCompliance(filters);
  const bySupplier = new Map<string, { sum: number; count: number; violations: number }>();

  for (const r of rows) {
    const entry = bySupplier.get(r.supplierId) ?? { sum: 0, count: 0, violations: 0 };
    entry.sum += r.overallCompliance;
    entry.count += 1;
    if (r.violationType) entry.violations += 1;
    bySupplier.set(r.supplierId, entry);
  }

  return Array.from(bySupplier.entries())
    .map(([supplierId, v]) => ({
      supplierId,
      supplierName: supplierById.get(supplierId)?.supplierName ?? supplierId,
      transactionCount: v.count,
      violationCount: v.violations,
      avgOverallCompliance: round2(v.sum / v.count),
    }))
    .sort((a, b) => b.violationCount - a.violationCount || a.avgOverallCompliance - b.avgOverallCompliance)
    .slice(0, limit);
}

export interface RecentViolationRow {
  transactionId: string;
  poId: string;
  poDate: string;
  supplierName: string;
  businessUnit: string;
  violationType: ViolationType;
  riskLevel: RiskLevel;
  overallCompliance: number;
}

export function getRecentViolations(filters: ComplianceFilters, limit = 25): RecentViolationRow[] {
  const rows = getFilteredCompliance(filters).filter((r) => r.violationType && r.poDate);
  return rows
    .sort((a, b) => new Date(b.poDate as string).getTime() - new Date(a.poDate as string).getTime())
    .slice(0, limit)
    .map((r) => ({
      transactionId: r.transactionId,
      poId: r.poId,
      poDate: r.poDate as string,
      supplierName: supplierById.get(r.supplierId)?.supplierName ?? r.supplierId,
      businessUnit: r.businessUnit ?? "—",
      violationType: r.violationType as ViolationType,
      riskLevel: r.riskLevel,
      overallCompliance: r.overallCompliance,
    }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
