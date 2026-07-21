import "server-only";

import vendorsJson from "@/data/sap/dimVendor.json";
import categoriesJson from "@/data/sap/dimCategory.json";
import plantsJson from "@/data/sap/dimPlant.json";
import materialsJson from "@/data/sap/dimMaterial.json";
import poItemsJson from "@/data/sap/factPoItems.json";
import invoicesJson from "@/data/sap/factInvoices.json";
import type { Vendor, Category, Plant, Material, PoItem, Invoice } from "@/lib/sap/types";

export const vendors = vendorsJson as Vendor[];
export const categories = categoriesJson as Category[];
export const plants = plantsJson as Plant[];
export const materials = materialsJson as Material[];
export const poItems = poItemsJson as PoItem[];
export const invoices = invoicesJson as Invoice[];

export const vendorById = new Map(vendors.map((v) => [v.vendor_id, v]));
export const categoryByCode = new Map(categories.map((c) => [c.category_code, c]));
export const plantByCode = new Map(plants.map((p) => [p.plant_code, p]));

export const L1_CATEGORIES = Array.from(new Set(categories.map((c) => c.category_l1)));
export const PLANT_LIST = plants;

export const DATA_MIN_DATE = "2023-01-01";
export const DATA_MAX_DATE = "2025-12-31";
