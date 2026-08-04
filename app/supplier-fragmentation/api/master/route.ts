import { NextResponse } from "next/server";
import { poItems, vendorById, categoryByCode, plantByCode, plants } from "@/lib/sap/raw-data";
import type { MasterPayload, MasterRow } from "../../lib/types";

/**
 * Route-local master-data endpoint for the Supplier Fragmentation dashboard.
 *
 * Serves the denormalised PO-line rows (fact_po_items joined to the vendor /
 * category / plant dimensions — the equivalent of the Python prototype's
 * data_loader.load_master) so the client can run every fragmentation metric
 * in-browser. The HHI math needs supplier-level spend shares per category,
 * which the declarative widget-query seam cannot express — hence raw rows.
 *
 * The source is bundled JSON, so the response is fully static and cacheable.
 */
export const dynamic = "force-static";

export async function GET() {
  const rows: MasterRow[] = [];
  let dateMin = "";
  let dateMax = "";

  for (const item of poItems) {
    if (item.is_deleted) continue; // clean-data safeguard, mirrors the prototype

    const vendor = vendorById.get(item.vendor_id);
    const category = categoryByCode.get(item.category_code);
    const plant = plantByCode.get(item.plant_code);

    rows.push({
      po: item.po_number,
      vendor: item.vendor_id,
      vendorName: vendor?.vendor_name ?? item.vendor_id,
      parent: vendor?.parent_company_group ?? null,
      active: vendor?.is_active ?? false,
      l1: category?.category_l1 ?? "Unknown",
      l2: category?.category_l2 ?? "Unknown",
      plant: item.plant_code,
      plantName: plant?.plant_name ?? item.plant_code,
      date: item.po_date,
      value: item.net_value_inr,
    });

    if (!dateMin || item.po_date < dateMin) dateMin = item.po_date;
    if (!dateMax || item.po_date > dateMax) dateMax = item.po_date;
  }

  const plantOptions = [...plants]
    .sort((a, b) => a.plant_name.localeCompare(b.plant_name))
    .map((p) => ({ code: p.plant_code, name: p.plant_name }));

  const l1Options = [...new Set(rows.map((row) => row.l1))].sort((a, b) => a.localeCompare(b));

  const payload: MasterPayload = { rows, plantOptions, l1Options, dateMin, dateMax };
  return NextResponse.json(payload);
}
