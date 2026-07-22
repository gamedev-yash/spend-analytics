// Generator for Initiative 18: Spend Overview — Vedanta (SAP-realistic dummy data)
// Scaled to ~20% of the spec'd volumes per user direction; category value
// ranges kept at the spec'd realistic magnitudes (so totals scale down
// proportionally with row count rather than being artificially inflated).
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = process.argv[2] || "./out";
fs.mkdirSync(OUT_DIR, { recursive: true });

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(180001);
const rf = (a, b) => a + rand() * (b - a);
const ri = (a, b) => Math.floor(rf(a, b + 1));
const pick = (arr) => arr[ri(0, arr.length - 1)];
const round2 = (n) => Math.round(n * 100) / 100;
const pad = (n, len) => String(n).padStart(len, "0");
const dateStr = (d) => d.toISOString().slice(0, 10);
const addDays = (d, days) => new Date(d.getTime() + days * 86400000);
function gaussian() {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
/**
 * Log-normal draw whose ARITHMETIC MEAN lands at `targetAvg` (compensating
 * for log-normal's mean = exp(mu + sigma^2/2), not exp(mu)), clamped to the
 * category's stated [lo, hi]. This gives direct control over each
 * category's contribution to total spend — plain log-uniform/skewed sampling
 * across a 2-3-order-of-magnitude range makes the mean dominated by the top
 * end in a way that's very hard to reason backward from.
 */
const SIGMA = 0.85;
const sampleAroundTarget = (lo, hi, targetAvg) => {
  const mu = Math.log(targetAvg) - (SIGMA * SIGMA) / 2;
  const v = Math.exp(mu + gaussian() * SIGMA);
  return Math.round(Math.min(hi, Math.max(lo, v)));
};
const weightedPick = (items) => {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rand() * total;
  for (const it of items) {
    if (r < it.w) return it.v;
    r -= it.w;
  }
  return items[items.length - 1].v;
};

// ---------- 1. dim_plant ----------
const PLANTS = [
  { plant_code: "HZL1", plant_name: "Hindustan Zinc", company_code: "HZL", region: "Rajasthan" },
  { plant_code: "VAL1", plant_name: "Vedanta Aluminium", company_code: "VAL", region: "Odisha" },
  { plant_code: "COG1", plant_name: "Cairn Oil & Gas", company_code: "CAIR", region: "Rajasthan" },
  { plant_code: "BAL1", plant_name: "BALCO", company_code: "BALC", region: "Chhattisgarh" },
  { plant_code: "STC1", plant_name: "Sterlite Copper", company_code: "STER", region: "Tamil Nadu" },
  { plant_code: "IOD1", plant_name: "Iron Ore Division", company_code: "SESA", region: "Goa" },
  { plant_code: "COR1", plant_name: "Corporate / Shared Services", company_code: "VEDL", region: "Maharashtra" },
];

// Relative spend weight per plant — Hindustan Zinc is Vedanta's largest single
// business (real-world ~₹5,000+ Cr/yr), Aluminium second; Corporate/Iron Ore smallest.
const PLANT_WEIGHT = {
  HZL1: 30, VAL1: 24, STC1: 13, BAL1: 12, COG1: 10, IOD1: 6, COR1: 5,
};
const plantWeighted = PLANTS.map((p) => ({ v: p, w: PLANT_WEIGHT[p.plant_code] }));

// ---------- 2. dim_category ----------
const CATEGORY_TREE = {
  "Raw Materials": ["Zinc Concentrate", "Lead Concentrate", "Copper Concentrate", "Bauxite", "Alumina", "Iron Ore Fines"],
  "MRO & Spares": ["Bearings", "Seals & Gaskets", "Pumps", "Conveyor Components", "Grinding Media", "Flotation Cells", "Crusher Parts", "Motor Spares"],
  "Capital Equipment": ["SAG Mills", "Furnaces", "Crushers", "Conveyor Systems", "Electrolytic Cells", "Drilling Rigs"],
  "Services": ["Shutdown Maintenance Contractors", "Logistics Services", "Civil Works", "Consulting Services", "Housekeeping Services", "Security Services"],
  "Chemicals & Reagents": ["Sodium Cyanide", "Xanthate Collectors", "Frothers", "Sulphuric Acid", "Lime", "Flocculants"],
  "Fuel & Energy": ["Coal", "Diesel", "Furnace Oil", "Petroleum Coke", "Electricity Purchase", "Natural Gas"],
  "Logistics & Transport": ["Rail Freight", "Road Transport", "Port Handling", "Shipping & Freight Forwarding"],
  "IT & Telecom": ["Hardware", "Software Licenses", "Network Services", "Telecom Services"],
  "Safety & PPE": ["Helmets & Protective Gear", "Fire Safety Equipment", "Gas Detectors", "Safety Footwear"],
  "Civil & Construction": ["Cement", "Steel Structures", "Ready Mix Concrete", "Construction Services"],
  "Electrical": ["Cables & Wires", "Transformers", "Switchgear", "VFDs & Drives"],
  "Instrumentation": ["Flow Meters", "Analyzers", "Control Valves", "PLC & DCS Systems"],
  "Packaging": ["Bags & Sacks", "Drums & Containers", "Pallets & Crates"],
};

// [lo, hi] INR per PO line, log-uniform
const L1_VALUE_RANGE = {
  "Raw Materials": [500_000, 500_000_000],
  "MRO & Spares": [10_000, 20_000_000],
  "Capital Equipment": [5_000_000, 2_000_000_000],
  "Services": [100_000, 250_000_000],
  "Chemicals & Reagents": [500_000, 100_000_000],
  "Fuel & Energy": [1_000_000, 1_000_000_000],
  "Logistics & Transport": [100_000, 150_000_000],
  "IT & Telecom": [50_000, 50_000_000],
  "Safety & PPE": [10_000, 5_000_000],
  "Civil & Construction": [500_000, 200_000_000],
  "Electrical": [100_000, 100_000_000],
  "Instrumentation": [200_000, 80_000_000],
  "Packaging": [10_000, 3_000_000],
};

// Relative PO-count weight per L1 (drives volume mix: MRO high-volume/low-value, Capital Equipment low-volume/high-value)
const L1_COUNT_WEIGHT = {
  "Raw Materials": 14,
  "MRO & Spares": 25,
  "Capital Equipment": 3,
  "Services": 12,
  "Chemicals & Reagents": 8,
  "Fuel & Energy": 8,
  "Logistics & Transport": 8,
  "IT & Telecom": 4,
  "Safety & PPE": 6,
  "Civil & Construction": 4,
  "Electrical": 4,
  "Instrumentation": 3,
  "Packaging": 1,
};

// Target share of TOTAL SPEND VALUE per L1 (sums to 100) — Raw Materials the
// single largest, Fuel second, combined ~45% ("~40%" per spec); MRO carries
// 25% of PO count but only 6% of spend. Drives sampleAroundTarget() below so
// the category mix actually reads like a mining/metals company, not an
// artifact of sampling a huge [lo, hi] range uniformly.
const L1_TARGET_SHARE = {
  "Raw Materials": 32,
  "Fuel & Energy": 15,
  "MRO & Spares": 6,
  "Capital Equipment": 12.95,
  "Services": 13,
  "Chemicals & Reagents": 5,
  "Logistics & Transport": 5,
  "Civil & Construction": 4,
  "Electrical": 3,
  "Instrumentation": 2,
  "IT & Telecom": 1.5,
  "Safety & PPE": 0.5,
  "Packaging": 0.05,
};
const TOTAL_TARGET_INR = 18_000 * 1e7; // ₹18,000 Cr — mid-range of Vedanta's real ~₹15-25k Cr annual spend
const PO_LINE_TARGET_FOR_AVG = 10_000;
const L1_TARGET_AVG = Object.fromEntries(
  Object.keys(CATEGORY_TREE).map((l1) => [
    l1,
    (TOTAL_TARGET_INR * (L1_TARGET_SHARE[l1] / 100)) / ((L1_COUNT_WEIGHT[l1] / 100) * PO_LINE_TARGET_FOR_AVG),
  ])
);

const UOM_BY_L1 = {
  "Raw Materials": ["MT"],
  "MRO & Spares": ["EA", "SET"],
  "Capital Equipment": ["EA", "SET"],
  "Services": ["LOT"],
  "Chemicals & Reagents": ["KG", "MT", "L"],
  "Fuel & Energy": ["MT", "L"],
  "Logistics & Transport": ["LOT"],
  "IT & Telecom": ["EA", "LOT"],
  "Safety & PPE": ["EA"],
  "Civil & Construction": ["MT", "EA", "LOT"],
  "Electrical": ["EA", "SET"],
  "Instrumentation": ["EA", "SET"],
  "Packaging": ["EA"],
};

const dimCategory = [];
let catSeq = 1;
for (const [l1, l2s] of Object.entries(CATEGORY_TREE)) {
  for (const l2 of l2s) {
    dimCategory.push({
      category_code: `M${pad(catSeq, 3)}`,
      category_name: l2,
      category_l1: l1,
      category_l2: l2,
    });
    catSeq++;
  }
}
const categoriesByL1 = new Map();
for (const c of dimCategory) {
  if (!categoriesByL1.has(c.category_l1)) categoriesByL1.set(c.category_l1, []);
  categoriesByL1.get(c.category_l1).push(c);
}
const L1_LIST = Object.keys(CATEGORY_TREE);

// ---------- 3. dim_vendor ----------
// Real, well-known industrial names as requested — each pinned to a plausible
// domicile/account-group instead of the random draw used for generic
// regional suppliers, so e.g. "Tata Steel Ltd" doesn't end up registered in
// Chicago. Indian entities (including local subsidiaries of foreign OEMs,
// e.g. "ABB India") are ZDOM; true cross-border import vendors are ZIMP.
const NAMED_LARGE_VENDORS = [
  { name: "Tata Steel Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Larsen & Toubro Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Thermax Ltd", country: "IN", account_group: "ZDOM" },
  { name: "ABB India Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Siemens India Ltd", country: "IN", account_group: "ZDOM" },
  { name: "SKF India Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Timken India Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Metso Outotec", country: "DE", account_group: "ZIMP" },
  { name: "FLSmidth", country: "DE", account_group: "ZIMP" },
  { name: "Sandvik Mining", country: "DE", account_group: "ZIMP" },
  { name: "Caterpillar Inc", country: "US", account_group: "ZIMP" },
  { name: "Komatsu Ltd", country: "JP", account_group: "ZIMP" },
  { name: "Cummins India Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Kirloskar Brothers Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Voltas Ltd", country: "IN", account_group: "ZDOM" },
  { name: "BHEL", country: "IN", account_group: "ZDOM" },
  { name: "JSW Steel Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Grasim Industries Ltd", country: "IN", account_group: "ZDOM" },
  { name: "UltraTech Cement Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Adani Ports & SEZ Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Container Corporation of India", country: "IN", account_group: "ZDOM" },
  { name: "Indian Oil Corporation Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Bharat Petroleum Corporation Ltd", country: "IN", account_group: "ZDOM" },
  { name: "GAIL India Ltd", country: "IN", account_group: "ZDOM" },
  { name: "Weir Minerals India", country: "IN", account_group: "ZDOM" },
  { name: "Flowserve India", country: "IN", account_group: "ZDOM" },
  { name: "Honeywell Automation India", country: "IN", account_group: "ZDOM" },
  { name: "Schneider Electric India", country: "IN", account_group: "ZDOM" },
  { name: "Grundfos Pumps India", country: "IN", account_group: "ZDOM" },
  { name: "Tega Industries Ltd", country: "IN", account_group: "ZDOM" },
];
const REGIONAL_PREFIX = [
  "Rajasthan", "Aravali", "Marwar", "Konkan", "Deccan", "Malwa", "Vindhya", "Nilgiri", "Godavari", "Narmada",
  "Coastal", "Desert", "Sahyadri", "Satpura", "Chambal", "Mewar", "Om Sai", "Shree Balaji", "National", "Apex",
  "Precision", "Sterling", "Orient", "Bharat", "Hind", "Vindhyachal", "Ganga", "Yamuna", "Cauvery", "Krishna",
];
const REGIONAL_SUFFIX = [
  "Engineering Works", "Industries", "Trading Co", "Fabricators", "Enterprises", "Suppliers Pvt Ltd",
  "Equipment Ltd", "Manufacturing Co", "Industrial Corporation", "Overseas Pvt Ltd", "Technologies Pvt Ltd",
];
const IN_CITIES = ["Mumbai", "Pune", "Chennai", "Bengaluru", "New Delhi", "Kolkata", "Ahmedabad", "Jaipur", "Udaipur", "Bhilwara", "Jharsuguda", "Korba", "Tuticorin", "Visakhapatnam", "Nagpur", "Hyderabad"];
const COUNTRY_CITY = {
  US: ["Houston", "Chicago"], DE: ["Munich", "Essen"], CN: ["Shanghai", "Shenzhen"],
  JP: ["Tokyo", "Osaka"], KR: ["Seoul"], AU: ["Perth"],
};
const COUNTRY_WEIGHTS = [
  { v: "IN", w: 80 }, { v: "US", w: 5 }, { v: "DE", w: 5 }, { v: "CN", w: 4 }, { v: "JP", w: 3 }, { v: "KR", w: 2 }, { v: "AU", w: 1 },
];
const ACCOUNT_GROUP_WEIGHTS = [{ v: "ZDOM", w: 70 }, { v: "ZIMP", w: 20 }, { v: "ZSER", w: 10 }];
const PAYMENT_TERMS = ["ZN30", "ZN45", "ZN60", "ZN90"];
const PARENT_GROUPS = [
  "TATA-GRP", "ABB-GRP", "SIEMENS-GRP", "METSO-GRP", "FLS-GRP", "SANDVIK-GRP", "CATERPILLAR-GRP",
  "CUMMINS-GRP", "VOLTAS-GRP", "ADANI-GRP", "WEIR-GRP", "SCHNEIDER-GRP",
];

const VENDOR_COUNT = 160;
const dimVendor = [];
for (let i = 1; i <= VENDOR_COUNT; i++) {
  const named = i <= NAMED_LARGE_VENDORS.length ? NAMED_LARGE_VENDORS[i - 1] : null;
  const vendor_name = named ? named.name : `${pick(REGIONAL_PREFIX)} ${pick(REGIONAL_SUFFIX)}`;
  const country = named ? named.country : weightedPick(COUNTRY_WEIGHTS);
  const city = country === "IN" ? pick(IN_CITIES) : pick(COUNTRY_CITY[country]);
  const account_group = named ? named.account_group : country === "IN" ? weightedPick(ACCOUNT_GROUP_WEIGHTS) : "ZIMP";
  // ~15% of vendors belong to a shared parent group
  const parent_company_group = rand() < 0.15 ? pick(PARENT_GROUPS) : null;
  dimVendor.push({
    vendor_id: pad(100000 + i, 10),
    vendor_name,
    parent_company_group,
    country,
    city,
    account_group,
    payment_terms_key: pick(PAYMENT_TERMS),
    is_active: rand() < 0.92,
  });
}
// de-dupe regional names
{
  const seen = new Map();
  for (const v of dimVendor) {
    const c = (seen.get(v.vendor_name) || 0) + 1;
    seen.set(v.vendor_name, c);
    if (c > 1) v.vendor_name = `${v.vendor_name} (${v.vendor_id.slice(-4)})`;
  }
}

// ---------- 4. dim_material ----------
const MATERIAL_TEMPLATES = {
  "Raw Materials": ["Zinc Concentrate 52% Zn", "Lead Concentrate 60% Pb", "Copper Concentrate 28% Cu", "Bauxite Ore Grade A", "Calcined Alumina", "Iron Ore Fines 62% Fe"],
  "MRO & Spares": ["Ball Bearing 6205-2RS", "Roller Bearing 22218", "Mechanical Seal Type 21", "Gasket Set Spiral Wound", "Slurry Pump Impeller", "Conveyor Idler Roller", "Grinding Media Ball 90mm", "Flotation Cell Rotor", "Jaw Crusher Liner Plate", "AC Motor 75kW Spares"],
  "Capital Equipment": ["SAG Mill Complete Unit", "Reverberatory Furnace", "Cone Crusher Unit", "Overland Conveyor System", "Electrolytic Cell Assembly", "Rotary Drilling Rig"],
  "Services": ["Shutdown Maintenance Contract", "Inbound Logistics Service", "Civil Foundation Works", "Technical Consulting Engagement", "Plant Housekeeping Service", "Site Security Service"],
  "Chemicals & Reagents": ["Sodium Cyanide Technical Grade", "Xanthate Collector SIBX", "Frother MIBC", "Sulphuric Acid 98%", "Quick Lime CaO", "Polyacrylamide Flocculant"],
  "Fuel & Energy": ["Thermal Coal Grade B", "High Speed Diesel", "Furnace Oil", "Petroleum Coke (Calcined)", "Electricity Purchase Agreement", "Natural Gas (PNG)"],
  "Logistics & Transport": ["Rail Freight Wagon Booking", "Road Transport Contract", "Port Handling Service", "Ocean Freight Forwarding"],
  "IT & Telecom": ["Server Hardware Unit", "ERP Software License", "Network Switch Enterprise", "Leased Line Telecom Service"],
  "Safety & PPE": ["Safety Helmet Class E", "Fire Extinguisher CO2 Type", "Portable Gas Detector", "Steel Toe Safety Boots"],
  "Civil & Construction": ["OPC 53 Grade Cement", "Structural Steel Section", "Ready Mix Concrete M30", "Civil Construction Package"],
  "Electrical": ["XLPE Power Cable 11kV", "Distribution Transformer 500kVA", "HT Switchgear Panel", "Variable Frequency Drive 110kW"],
  "Instrumentation": ["Electromagnetic Flow Meter", "Online Process Analyzer", "Control Valve Globe Type", "PLC Rack Assembly"],
  "Packaging": ["HDPE Woven Sack 50kg", "Steel Drum 200L", "Wooden Pallet Standard", "Corrugated Crate"],
};
const MATERIAL_TYPE_BY_L1 = {
  "Raw Materials": "ROH", "MRO & Spares": "ERSA", "Capital Equipment": "ERSA", "Services": "DIEN",
  "Chemicals & Reagents": "HIBE", "Fuel & Energy": "HIBE", "Logistics & Transport": "DIEN", "IT & Telecom": "HIBE",
  "Safety & PPE": "HIBE", "Civil & Construction": "HIBE", "Electrical": "ERSA", "Instrumentation": "ERSA", "Packaging": "HIBE",
};

const MATERIAL_COUNT = 600;
const dimMaterial = [];
for (let i = 1; i <= MATERIAL_COUNT; i++) {
  const l1 = weightedPick(L1_LIST.map((l1) => ({ v: l1, w: L1_COUNT_WEIGHT[l1] })));
  const category = pick(categoriesByL1.get(l1));
  const template = pick(MATERIAL_TEMPLATES[l1]);
  dimMaterial.push({
    material_number: pad(200000 + i, 8),
    material_description: `${template} - Spec ${String.fromCharCode(65 + (i % 6))}${ri(10, 99)}`,
    material_type: MATERIAL_TYPE_BY_L1[l1],
    category_code: category.category_code,
  });
}

// ---------- 5. fact_po_items ----------
const START_DATE = new Date("2023-01-01");
const END_DATE = new Date("2025-12-31");
const TOTAL_DAYS = Math.round((END_DATE - START_DATE) / 86400000);

const SEASONAL_MULTIPLIER = {
  "Chemicals & Reagents": (month) => (month >= 5 && month <= 8 ? 1.35 : 1.0), // Jun-Sep (0-indexed 5-8)
  "Fuel & Energy": (month) => (month === 10 || month === 11 || month === 0 || month === 1 ? 1.3 : 1.0), // Nov-Feb
};

function randomPoDate() {
  // Slight YoY growth (~10%/yr): weight later days more heavily via a mild power-law skew.
  const t = Math.pow(rand(), 0.85);
  let day = Math.floor(t * TOTAL_DAYS);
  let date = addDays(START_DATE, day);
  // Reject/reshuffle lightly for seasonality using rejection sampling per L1 is expensive;
  // seasonality is instead applied to which L1 gets picked for a given month (see PO generation loop).
  return date;
}

const activeVendors = dimVendor.filter((v) => v.is_active);
const vendorsByAccountGroup = {
  ZDOM: dimVendor.filter((v) => v.account_group === "ZDOM"),
  ZIMP: dimVendor.filter((v) => v.account_group === "ZIMP"),
  ZSER: dimVendor.filter((v) => v.account_group === "ZSER"),
};

// Contracts: pool of (vendor, category) -> contract_number, so repeat POs against the same contract look real.
const contractPool = new Map();
let contractSeq = 1;
function getOrCreateContract(vendorId, categoryCode) {
  const key = `${vendorId}|${categoryCode}`;
  if (!contractPool.has(key)) {
    // ~73% of (vendor, category) pairs operate under a standing contract.
    if (rand() < 0.73) contractPool.set(key, `46${pad(contractSeq++, 6)}`);
    else contractPool.set(key, null);
  }
  return contractPool.get(key);
}

const DOC_TYPE_WEIGHTS = [{ v: "NB", w: 70 }, { v: "FO", w: 10 }, { v: "MK", w: 10 }, { v: "UB", w: 10 }];

const PO_LINE_TARGET = 10_000;
const factPoItems = [];
let poSeq = 1;
let linesRemaining = PO_LINE_TARGET;
while (linesRemaining > 0) {
  const poDate = randomPoDate();
  const month = poDate.getUTCMonth();
  const plant = weightedPick(plantWeighted);
  const linesOnThisPo = Math.min(ri(1, 5), linesRemaining);
  const poNumber = pad(4500000000 + poSeq, 10);
  poSeq++;

  for (let item = 1; item <= linesOnThisPo; item++) {
    // Seasonality: bias L1 selection toward in-season categories for this month.
    const weighted = L1_LIST.map((l1) => {
      const seasonal = SEASONAL_MULTIPLIER[l1] ? SEASONAL_MULTIPLIER[l1](month) : 1.0;
      return { v: l1, w: L1_COUNT_WEIGHT[l1] * seasonal };
    });
    const l1 = weightedPick(weighted);
    const category = pick(categoriesByL1.get(l1));
    const accountGroup = rand() < 0.75 ? "ZDOM" : rand() < 0.7 ? "ZIMP" : "ZSER";
    const vendorPool = vendorsByAccountGroup[accountGroup].length ? vendorsByAccountGroup[accountGroup] : activeVendors;
    const vendor = pick(vendorPool);

    const [lo, hi] = L1_VALUE_RANGE[l1];
    const net_value_inr = sampleAroundTarget(lo, hi, L1_TARGET_AVG[l1]);
    const uom = pick(UOM_BY_L1[l1]);
    const quantity = uom === "MT" || uom === "KG" || uom === "L" ? ri(1, 500) : ri(1, 50);
    const currency = vendor.account_group === "ZIMP" ? pick(["USD", "EUR", "INR"]) : "INR";
    const doc_type = weightedPick(DOC_TYPE_WEIGHTS);
    const pairContract = getOrCreateContract(vendor.vendor_id, category.category_code);
    // Even a contracted (vendor, category) pair occasionally sees a genuine spot/off-contract buy.
    const contract_number = pairContract && rand() < 0.95 ? pairContract : null;

    factPoItems.push({
      po_number: poNumber,
      po_item: item * 10,
      vendor_id: vendor.vendor_id,
      category_code: category.category_code,
      plant_code: plant.plant_code,
      po_date: dateStr(poDate),
      net_value_inr,
      quantity,
      unit: uom,
      currency,
      doc_type,
      contract_number,
      is_deleted: false,
    });
  }
  linesRemaining -= linesOnThisPo;
}

// ---------- 6. fact_invoices ----------
const INVOICE_TARGET = 9_000;
const NON_PO_SHARE = 0.15;
const nonPoCount = Math.round(INVOICE_TARGET * NON_PO_SHARE);
const poLinkedCount = INVOICE_TARGET - nonPoCount;

const factInvoices = [];
let invSeq = 1;

// PO-linked invoices: sample from PO lines (not all POs are invoiced yet)
const shuffledPoIndices = factPoItems.map((_, i) => i);
for (let i = shuffledPoIndices.length - 1; i > 0; i--) {
  const j = ri(0, i);
  [shuffledPoIndices[i], shuffledPoIndices[j]] = [shuffledPoIndices[j], shuffledPoIndices[i]];
}
for (let i = 0; i < poLinkedCount && i < shuffledPoIndices.length; i++) {
  const po = factPoItems[shuffledPoIndices[i]];
  const invoiceDate = addDays(new Date(po.po_date), ri(5, 45));
  if (invoiceDate > END_DATE) continue;
  const variance = rf(0.9, 1.05);
  factInvoices.push({
    invoice_number: pad(5100000000 + invSeq, 10),
    invoice_date: dateStr(invoiceDate),
    po_number: po.po_number,
    vendor_id: po.vendor_id,
    category_code: po.category_code,
    plant_code: po.plant_code,
    invoice_value_inr: Math.round(po.net_value_inr * variance),
    currency: po.currency,
  });
  invSeq++;
}

// Non-PO invoices: service-type spend rendered without a PO
const NON_PO_L1_WEIGHTS = [
  { v: "Services", w: 40 }, { v: "IT & Telecom", w: 20 }, { v: "Logistics & Transport", w: 15 },
  { v: "Safety & PPE", w: 10 }, { v: "Packaging", w: 10 }, { v: "Civil & Construction", w: 5 },
];
for (let i = 0; i < nonPoCount; i++) {
  const l1 = weightedPick(NON_PO_L1_WEIGHTS);
  const category = pick(categoriesByL1.get(l1));
  const plant = weightedPick(plantWeighted);
  const vendor = pick(vendorsByAccountGroup.ZSER.length ? vendorsByAccountGroup.ZSER : activeVendors);
  const invoiceDate = randomPoDate();
  const [lo, hi] = L1_VALUE_RANGE[l1];
  factInvoices.push({
    invoice_number: pad(5100000000 + invSeq, 10),
    invoice_date: dateStr(invoiceDate),
    po_number: null,
    vendor_id: vendor.vendor_id,
    category_code: category.category_code,
    plant_code: plant.plant_code,
    invoice_value_inr: sampleAroundTarget(lo, hi, L1_TARGET_AVG[l1]),
    currency: "INR",
  });
  invSeq++;
}

// ---------- write files ----------
const files = {
  "dimVendor.json": dimVendor,
  "dimCategory.json": dimCategory,
  "dimPlant.json": PLANTS,
  "dimMaterial.json": dimMaterial,
  "factPoItems.json": factPoItems,
  "factInvoices.json": factInvoices,
};
for (const [name, data] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2));
}

// ---------- sanity checks ----------
// net_value_inr / invoice_value_inr are already INR-denominated per the schema (EKPO.NETWR "in INR");
// `currency` is purely the descriptive original-transaction currency, not a conversion instruction.
const totalPoSpend = factPoItems.reduce((s, p) => s + p.net_value_inr, 0);
const totalInvSpend = factInvoices.reduce((s, p) => s + p.invoice_value_inr, 0);
const byL1 = new Map();
const catByCode = new Map(dimCategory.map((c) => [c.category_code, c]));
for (const p of factPoItems) {
  const l1 = catByCode.get(p.category_code).category_l1;
  byL1.set(l1, (byL1.get(l1) || 0) + p.net_value_inr);
}
console.log("=== Sanity ===");
console.log("vendors:", dimVendor.length, "categories(L2):", dimCategory.length, "materials:", dimMaterial.length);
console.log("PO lines:", factPoItems.length, "distinct POs:", poSeq - 1, "invoices:", factInvoices.length);
console.log("Total PO spend (Cr, INR-normalized):", round2(totalPoSpend / 1e7));
console.log("Total Invoice spend (Cr, INR-normalized):", round2(totalInvSpend / 1e7));
console.log("Off-contract PO share:", round2((factPoItems.filter((p) => !p.contract_number).length / factPoItems.length) * 100), "%");
console.log("Non-PO invoice share:", round2((factInvoices.filter((p) => !p.po_number).length / factInvoices.length) * 100), "%");
console.log("--- Spend by L1 (Cr) ---");
for (const [l1, v] of [...byL1.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(l1.padEnd(24), round2(v / 1e7), "Cr", round2((v / totalPoSpend) * 100) + "%");
}
const byPlant = new Map();
for (const p of factPoItems) byPlant.set(p.plant_code, (byPlant.get(p.plant_code) || 0) + p.net_value_inr);
console.log("--- Spend by Plant (Cr) ---");
for (const [code, v] of [...byPlant.entries()].sort((a, b) => b[1] - a[1])) {
  const name = PLANTS.find((p) => p.plant_code === code).plant_name;
  console.log(name.padEnd(28), round2(v / 1e7), "Cr");
}
console.log("Done ->", OUT_DIR);
