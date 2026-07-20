export interface CategoryConcentration {
  category: string;
  supplierCount: number;
  top3ConcentrationPercent: number;
  singleUseSuppliers: number;
}

export interface SupplierFragmentationData {
  totalActiveSuppliers: number;
  singleUseSupplierCount: number;
  top10ConcentrationPercent: number;
  categories: CategoryConcentration[];
}

export const supplierMock: SupplierFragmentationData = {
  totalActiveSuppliers: 3_140,
  singleUseSupplierCount: 1_285,
  top10ConcentrationPercent: 47,
  categories: [
    { category: "IT & Telecom", supplierCount: 420, top3ConcentrationPercent: 62, singleUseSuppliers: 140 },
    { category: "Facilities", supplierCount: 610, top3ConcentrationPercent: 38, singleUseSuppliers: 305 },
    { category: "Professional Services", supplierCount: 890, top3ConcentrationPercent: 29, singleUseSuppliers: 410 },
    { category: "MRO", supplierCount: 745, top3ConcentrationPercent: 34, singleUseSuppliers: 260 },
    { category: "Logistics", supplierCount: 475, top3ConcentrationPercent: 51, singleUseSuppliers: 170 },
  ],
};
