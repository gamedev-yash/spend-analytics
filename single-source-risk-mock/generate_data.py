#!/usr/bin/env python3
"""
Mock data generator for the SAP Spend Control Tower - "Spend Assessment: Single
Source Risk" dashboard.

Independent of payment-terms-mock/generate_data.py (different seed, own copies
of the shared reference dimensions) so regenerating one never shifts the other
dashboard's numbers. Categories, plants, and source systems are reused
verbatim from payment-terms-mock's dimension files since they represent the
same company's stable reference data; global ultimates/suppliers are
regenerated with a distinct name bank so the two mocks never coin the same
company under a different id.

Row-per-invoice fact table + dimension tables. Every KPI / widget / table in
the target dashboard derives from invoices.json alone.

Planted pattern (the point of the dashboard):
  - Every category is pre-assigned a fixed pool of eligible Global-Ultimate
    suppliers before any invoices are generated. ~17 of 38 categories get
    exactly 1 supplier (true single source), ~6 get exactly 2, the rest 3-9.
  - 8 "critical" GUs are reused as the sole supplier across several of the
    17 single-source categories -- the "if this one fails" concentration
    story (Suppliers (Global Ultimate) stays small even as Categories grows).
  - Category spend weight scales with its supplier-count tier (more eligible
    suppliers -> usually more spend), but each category's raw weight is still
    an independent random draw, so a handful of single-source categories
    randomly land high-spend outliers -- the "small slice of suppliers,
    disproportionate exposure" story.
"""

import json
import os
import random
from datetime import date, timedelta

SEED = 7
random.seed(SEED)

OUTDIR = os.path.dirname(os.path.abspath(__file__))
DATADIR = os.path.join(OUTDIR, "data")
os.makedirs(DATADIR, exist_ok=True)

N_GLOBAL_ULT = 45
N_INVOICES = 2200
TARGET_TOTAL = 620_000_000
CURRENCY = "USD"

REF_TODAY = date(2026, 7, 20)
START = date(2025, 7, 1)
END = date(2026, 6, 30)

# --------------------------------------------------------------------------------------
# Reference dimensions shared with payment-terms-mock (copied, not imported --
# each mock owns its own data/ so the two never drift against each other).
# --------------------------------------------------------------------------------------

CATEGORIES = [
    {"code": "40140000", "name": "Fluid handling pumps", "segment_code": "40000000", "segment_name": "Distribution and Conditioning Systems and Equipment", "level": 3},
    {"code": "40150000", "name": "Industrial valves", "segment_code": "40000000", "segment_name": "Distribution and Conditioning Systems and Equipment", "level": 3},
    {"code": "40160000", "name": "HVAC equipment", "segment_code": "40000000", "segment_name": "Distribution and Conditioning Systems and Equipment", "level": 3},
    {"code": "40170000", "name": "Compressors and blowers", "segment_code": "40000000", "segment_name": "Distribution and Conditioning Systems and Equipment", "level": 3},
    {"code": "31160000", "name": "Hardware and fasteners", "segment_code": "31000000", "segment_name": "Manufacturing Components and Supplies", "level": 3},
    {"code": "31170000", "name": "Bearings and bushings", "segment_code": "31000000", "segment_name": "Manufacturing Components and Supplies", "level": 3},
    {"code": "31200000", "name": "Adhesives and sealants", "segment_code": "31000000", "segment_name": "Manufacturing Components and Supplies", "level": 3},
    {"code": "31350000", "name": "Machined castings", "segment_code": "31000000", "segment_name": "Manufacturing Components and Supplies", "level": 3},
    {"code": "39120000", "name": "Electrical wire and cable", "segment_code": "39000000", "segment_name": "Electrical Systems and Lighting and Components", "level": 3},
    {"code": "39110000", "name": "Lighting fixtures", "segment_code": "39000000", "segment_name": "Electrical Systems and Lighting and Components", "level": 3},
    {"code": "39130000", "name": "Electrical hardware", "segment_code": "39000000", "segment_name": "Electrical Systems and Lighting and Components", "level": 3},
    {"code": "27110000", "name": "Hand tools", "segment_code": "27000000", "segment_name": "Tools and General Machinery", "level": 3},
    {"code": "27130000", "name": "Power tools", "segment_code": "27000000", "segment_name": "Tools and General Machinery", "level": 3},
    {"code": "27140000", "name": "Hydraulic machinery", "segment_code": "27000000", "segment_name": "Tools and General Machinery", "level": 3},
    {"code": "43210000", "name": "Computer equipment", "segment_code": "43000000", "segment_name": "Information Technology Broadcasting and Telecommunications", "level": 3},
    {"code": "43220000", "name": "Networking equipment", "segment_code": "43000000", "segment_name": "Information Technology Broadcasting and Telecommunications", "level": 3},
    {"code": "43230000", "name": "Software licenses", "segment_code": "43000000", "segment_name": "Information Technology Broadcasting and Telecommunications", "level": 3},
    {"code": "43190000", "name": "Communications devices", "segment_code": "43000000", "segment_name": "Information Technology Broadcasting and Telecommunications", "level": 3},
    {"code": "44120000", "name": "Office supplies", "segment_code": "44000000", "segment_name": "Office Equipment and Accessories and Supplies", "level": 3},
    {"code": "44100000", "name": "Office machines", "segment_code": "44000000", "segment_name": "Office Equipment and Accessories and Supplies", "level": 3},
    {"code": "44110000", "name": "Desk accessories", "segment_code": "44000000", "segment_name": "Office Equipment and Accessories and Supplies", "level": 3},
    {"code": "80100000", "name": "Management consulting", "segment_code": "80000000", "segment_name": "Management and Business Professionals and Admin Services", "level": 3},
    {"code": "80110000", "name": "HR services", "segment_code": "80000000", "segment_name": "Management and Business Professionals and Admin Services", "level": 3},
    {"code": "80160000", "name": "Business administration services", "segment_code": "80000000", "segment_name": "Management and Business Professionals and Admin Services", "level": 3},
    {"code": "78100000", "name": "Freight transport", "segment_code": "78000000", "segment_name": "Transportation and Storage and Mail Services", "level": 3},
    {"code": "78130000", "name": "Warehousing and storage", "segment_code": "78000000", "segment_name": "Transportation and Storage and Mail Services", "level": 3},
    {"code": "78180000", "name": "Courier and postal services", "segment_code": "78000000", "segment_name": "Transportation and Storage and Mail Services", "level": 3},
    {"code": "84120000", "name": "Banking and finance services", "segment_code": "84000000", "segment_name": "Financial and Insurance Services", "level": 3},
    {"code": "84130000", "name": "Insurance", "segment_code": "84000000", "segment_name": "Financial and Insurance Services", "level": 3},
    {"code": "76110000", "name": "Cleaning services", "segment_code": "76000000", "segment_name": "Industrial Cleaning Services", "level": 3},
    {"code": "76120000", "name": "Waste management", "segment_code": "76000000", "segment_name": "Industrial Cleaning Services", "level": 3},
    {"code": "72100000", "name": "Facility maintenance", "segment_code": "72000000", "segment_name": "Building and Facility Maintenance Services", "level": 3},
    {"code": "72150000", "name": "Building repair services", "segment_code": "72000000", "segment_name": "Building and Facility Maintenance Services", "level": 3},
    {"code": "47130000", "name": "Cleaning supplies", "segment_code": "47000000", "segment_name": "Cleaning Equipment and Supplies", "level": 3},
    {"code": "90100000", "name": "Catering and restaurants", "segment_code": "90000000", "segment_name": "Travel and Food and Lodging and Entertainment Services", "level": 3},
    {"code": "90120000", "name": "Travel services", "segment_code": "90000000", "segment_name": "Travel and Food and Lodging and Entertainment Services", "level": 3},
    {"code": "25170000", "name": "Vehicle components and accessories", "segment_code": "25000000", "segment_name": "Commercial and Private Vehicles and Components", "level": 3},
    {"code": "25100000", "name": "Motor vehicles", "segment_code": "25000000", "segment_name": "Commercial and Private Vehicles and Components", "level": 3},
]
assert len(CATEGORIES) == 38

PLANTS = [
    {"plant_id": "PLT-PUN", "name": "Pune Plant", "country": "India", "country_code": "IN", "region": "APAC"},
    {"plant_id": "PLT-CHN", "name": "Chennai Plant", "country": "India", "country_code": "IN", "region": "APAC"},
    {"plant_id": "PLT-SHA", "name": "Shanghai Plant", "country": "China", "country_code": "CN", "region": "APAC"},
    {"plant_id": "PLT-SNG", "name": "Singapore Hub", "country": "Singapore", "country_code": "SG", "region": "APAC"},
    {"plant_id": "PLT-DET", "name": "Detroit Plant", "country": "United States", "country_code": "US", "region": "NAMER"},
    {"plant_id": "PLT-HOU", "name": "Houston Plant", "country": "United States", "country_code": "US", "region": "NAMER"},
    {"plant_id": "PLT-CLT", "name": "Charlotte Plant", "country": "United States", "country_code": "US", "region": "NAMER"},
    {"plant_id": "PLT-TOR", "name": "Toronto Plant", "country": "Canada", "country_code": "CA", "region": "NAMER"},
    {"plant_id": "PLT-STU", "name": "Stuttgart Plant", "country": "Germany", "country_code": "DE", "region": "EMEA"},
    {"plant_id": "PLT-MAN", "name": "Manchester Plant", "country": "United Kingdom", "country_code": "GB", "region": "EMEA"},
    {"plant_id": "PLT-LYO", "name": "Lyon Plant", "country": "France", "country_code": "FR", "region": "EMEA"},
    {"plant_id": "PLT-ROT", "name": "Rotterdam DC", "country": "Netherlands", "country_code": "NL", "region": "EMEA"},
    {"plant_id": "PLT-MTY", "name": "Monterrey Plant", "country": "Mexico", "country_code": "MX", "region": "LATAM"},
    {"plant_id": "PLT-SAO", "name": "Sao Paulo Plant", "country": "Brazil", "country_code": "BR", "region": "LATAM"},
]

SOURCE_SYSTEMS = [
    {"id": "SAP_S4HANA", "name": "SAP S/4HANA"},
    {"id": "SAP_ECC", "name": "SAP ERP (ECC)"},
    {"id": "ARIBA", "name": "SAP Ariba"},
    {"id": "FIELDGLASS", "name": "SAP Fieldglass"},
    {"id": "CONCUR", "name": "SAP Concur"},
]

REGIONS = ["APAC", "NAMER", "EMEA", "LATAM"]
PLANTS_BY_REGION = {r: [p for p in PLANTS if p["region"] == r] for r in REGIONS}

# --------------------------------------------------------------------------------------
# Global Ultimates (parent suppliers) -- own name bank, distinct from
# payment-terms-mock's, so no company name/id pair collides across the two
# synthetic datasets.
# --------------------------------------------------------------------------------------

GU_PREFIXES = [
    "Meridian", "Cascade", "Ironwood", "Solstice", "Granite", "Beacon", "Sierra",
    "Crestline", "Ashford", "Brightwater", "Palisade", "Stonebridge", "Hillcrest",
    "Larkspur", "Driftwood", "Amberline", "Thornfield", "Coralwave", "Northgate",
    "Fernbrook", "Waverly", "Millbrook", "Ridgemont", "Ashgrove", "Blackthorn",
]
GU_TRADES = [
    "Industrial Supply", "Manufacturing", "Components Group", "Fabrication",
    "Materials Group", "Engineering", "Systems", "Logistics", "Technologies",
    "Machinery", "Electricals", "Chemicals", "Packaging Solutions", "Automation",
    "Controls", "Tooling", "Freight Services", "Consulting Group",
    "Facilities Services", "Instruments",
]
GU_SUFFIXES = ["Inc.", "Holdings", "International", "Group", "Corporation", "Global", "Industries", "Co."]

def make_gu_name(used_names):
    for _ in range(200):
        name = f"{random.choice(GU_PREFIXES)} {random.choice(GU_TRADES)} {random.choice(GU_SUFFIXES)}"
        if name not in used_names:
            used_names.add(name)
            return name
    raise RuntimeError("exhausted GU name combinations")

_used_gu_names = set()
GLOBAL_ULTIMATES = []
for i in range(1, N_GLOBAL_ULT + 1):
    GLOBAL_ULTIMATES.append({
        "gu_id": f"GU-{i:04d}",
        "gu_name": make_gu_name(_used_gu_names),
        "region": random.choice(REGIONS),
        "n_entities": random.randint(1, 5),
    })

LEGAL_SUFFIX_BY_REGION = {
    "APAC": ["Pte. Ltd.", "Ltd.", "Co. Ltd."],
    "NAMER": ["Inc.", "LLC", "Co."],
    "EMEA": ["GmbH", "Ltd.", "S.A."],
    "LATAM": ["S.A. de C.V.", "Ltda.", "S.A."],
}
CITY_BY_REGION = {
    "APAC": ["Pune", "Chennai", "Shanghai", "Singapore", "Bengaluru", "Osaka"],
    "NAMER": ["Detroit", "Houston", "Charlotte", "Toronto", "Chicago", "Dallas"],
    "EMEA": ["Stuttgart", "Manchester", "Lyon", "Rotterdam", "Milan", "Warsaw"],
    "LATAM": ["Monterrey", "Sao Paulo", "Bogota", "Santiago"],
}

SUPPLIERS = []
supplier_seq = 1
suppliers_by_gu = {}
for gu in GLOBAL_ULTIMATES:
    entities = []
    for _ in range(gu["n_entities"]):
        city = random.choice(CITY_BY_REGION[gu["region"]])
        suffix = random.choice(LEGAL_SUFFIX_BY_REGION[gu["region"]])
        trade_word = gu["gu_name"].split(" ")[1] if len(gu["gu_name"].split(" ")) > 2 else gu["gu_name"].split(" ")[0]
        supplier_id = f"SUP-{supplier_seq:05d}"
        supplier_seq += 1
        entity = {
            "supplier_id": supplier_id,
            "supplier_name": f"{gu['gu_name'].split(' ')[0]} {trade_word} {city} {suffix}",
            "gu_id": gu["gu_id"],
        }
        entities.append(entity)
        SUPPLIERS.append(entity)
    suppliers_by_gu[gu["gu_id"]] = entities

# --------------------------------------------------------------------------------------
# Products -- hand-authored per category (new dimension; payment-terms-mock has
# no equivalent). Cost Centers -- new dimension, department x region.
# --------------------------------------------------------------------------------------

PRODUCTS_BY_CATEGORY = {
    "40140000": ["Centrifugal Pump 5HP", "Diaphragm Pump", "Submersible Pump 2HP", "Positive Displacement Pump", "Pump Seal Kit"],
    "40150000": ["Ball Valve 2-inch", "Gate Valve 4-inch", "Butterfly Valve", "Check Valve", "Solenoid Valve"],
    "40160000": ["Rooftop AC Unit 10-Ton", "Split System AC Unit", "Air Handling Unit", "Chiller Unit", "Ventilation Fan"],
    "40170000": ["Rotary Screw Compressor", "Reciprocating Compressor", "Centrifugal Blower", "Compressor Air Filter"],
    "31160000": ["Hex Bolt M12", "Stainless Steel Washer Set", "Anchor Bolt Kit", "Threaded Rod", "Lock Nut Assortment"],
    "31170000": ["Ball Bearing 6203", "Roller Bearing Set", "Thrust Bearing", "Bronze Bushing", "Pillow Block Bearing"],
    "31200000": ["Epoxy Adhesive", "Silicone Sealant", "Industrial Glue", "Gasket Sealant", "Thread Locker"],
    "31350000": ["Iron Casting Housing", "Aluminum Casting Bracket", "Steel Casting Flange", "Cast Pump Housing"],
    "39120000": ["Copper Wire 10AWG", "Armored Cable", "Control Cable", "Fiber Optic Cable", "Power Cable Reel"],
    "39110000": ["LED High Bay Fixture", "Floodlight Fixture", "Emergency Exit Light", "Panel Light Fixture"],
    "39130000": ["Circuit Breaker 30A", "Terminal Block", "Cable Gland", "Junction Box", "Electrical Conduit"],
    "27110000": ["Adjustable Wrench Set", "Claw Hammer", "Screwdriver Kit", "Pliers Set", "Socket Wrench Set"],
    "27130000": ["Cordless Drill", "Angle Grinder", "Impact Wrench", "Bench Grinder", "Circular Saw"],
    "27140000": ["Hydraulic Pump Unit", "Hydraulic Cylinder", "Hydraulic Hose Assembly", "Hydraulic Power Pack"],
    "43210000": ["Laptop 14-inch", "Desktop Workstation", "Monitor 27-inch", "Docking Station", "Server Rack Unit"],
    "43220000": ["Network Switch 24-Port", "Wireless Router", "Firewall Appliance", "Ethernet Cable Bundle", "Wi-Fi Access Point"],
    "43230000": ["ERP User License", "Antivirus License", "CAD Software License", "Cloud Storage Subscription"],
    "43190000": ["VoIP Desk Phone", "Two-Way Radio", "Video Conferencing Unit", "Headset Kit"],
    "44120000": ["Copy Paper Ream Case", "Ballpoint Pen Box", "Sticky Notes Pack", "Toner Cartridge", "Stapler Set"],
    "44100000": ["Laser Printer", "Photocopier", "Paper Shredder", "Fax Machine", "Label Printer"],
    "44110000": ["Office Chair", "Desk Organizer", "Monitor Stand", "Filing Cabinet", "Desk Lamp"],
    "80100000": ["Strategy Advisory Engagement", "Process Improvement Study", "Org Design Review", "Market Entry Study"],
    "80110000": ["Payroll Processing Service", "Recruitment Services", "Employee Training Program", "Benefits Administration"],
    "80160000": ["Document Management Service", "Records Archiving Service", "Office Support Services"],
    "78100000": ["LTL Freight Shipment", "Full Truckload Shipment", "Air Freight Booking", "Rail Freight Booking"],
    "78130000": ["Pallet Storage Service", "Bonded Warehouse Service", "Cold Storage Service"],
    "78180000": ["Express Courier Delivery", "Bulk Mail Service", "Same-Day Courier Service"],
    "84120000": ["Trade Finance Facility", "Corporate Banking Service", "FX Hedging Service"],
    "84130000": ["Property Insurance Policy", "Cargo Insurance Policy", "Liability Insurance Policy"],
    "76110000": ["Office Cleaning Service", "Industrial Deep Cleaning", "Window Cleaning Service"],
    "76120000": ["Hazardous Waste Disposal", "Scrap Metal Recycling", "General Waste Collection"],
    "72100000": ["HVAC Maintenance Contract", "Electrical Maintenance Service", "Plumbing Maintenance Service"],
    "72150000": ["Roof Repair Service", "Structural Repair Service", "Flooring Repair Service"],
    "47130000": ["Industrial Degreaser", "Floor Cleaner Concentrate", "Disinfectant Spray", "Cleaning Cloths Bulk Pack"],
    "90100000": ["Corporate Catering Package", "Cafeteria Meal Service", "Event Catering Service"],
    "90120000": ["Corporate Travel Booking", "Hotel Accommodation Package", "Airport Transfer Service"],
    "25170000": ["Truck Tire Set", "Vehicle Battery", "Brake Pad Set", "Vehicle Filter Kit"],
    "25100000": ["Light Commercial Truck", "Forklift Unit", "Utility Van", "Pickup Truck"],
}
assert set(PRODUCTS_BY_CATEGORY.keys()) == {c["code"] for c in CATEGORIES}

PRODUCTS = []
product_seq = 1
products_by_category = {}
for cat in CATEGORIES:
    entries = []
    for name in PRODUCTS_BY_CATEGORY[cat["code"]]:
        product_id = f"PRD-{product_seq:05d}"
        product_seq += 1
        entry = {"product_id": product_id, "product_name": name, "category_code": cat["code"]}
        entries.append(entry)
        PRODUCTS.append(entry)
    products_by_category[cat["code"]] = entries

DEPARTMENTS = ["Procurement", "Manufacturing", "Maintenance", "IT Operations", "R&D", "Finance", "Facilities", "Logistics", "HR", "Sales & Marketing"]
DEPT_REGION_PAIRS = [
    ("Procurement", "APAC"), ("Procurement", "NAMER"), ("Procurement", "EMEA"),
    ("Manufacturing", "APAC"), ("Manufacturing", "NAMER"), ("Manufacturing", "EMEA"), ("Manufacturing", "LATAM"),
    ("Maintenance", "APAC"), ("Maintenance", "NAMER"), ("Maintenance", "EMEA"),
    ("IT Operations", "APAC"), ("IT Operations", "NAMER"), ("IT Operations", "EMEA"),
    ("R&D", "APAC"), ("R&D", "NAMER"),
    ("Finance", "APAC"), ("Finance", "NAMER"), ("Finance", "EMEA"), ("Finance", "LATAM"),
    ("Facilities", "APAC"), ("Facilities", "NAMER"), ("Facilities", "EMEA"),
    ("Logistics", "APAC"), ("Logistics", "NAMER"), ("Logistics", "LATAM"),
    ("HR", "APAC"), ("HR", "NAMER"),
    ("Sales & Marketing", "APAC"), ("Sales & Marketing", "NAMER"),
]
COST_CENTERS = []
cc_by_region = {r: [] for r in REGIONS}
for i, (dept, region) in enumerate(DEPT_REGION_PAIRS, start=1001):
    cc = {"cost_center_id": f"CC-{i}", "name": f"{dept} - {region}", "department": dept, "region": region}
    COST_CENTERS.append(cc)
    cc_by_region[region].append(cc)

# department weight per category segment -- 1.0 default, boosted for the
# departments realistically driving that kind of spend.
SEGMENT_DEPT_WEIGHTS = {
    "43000000": {"IT Operations": 6, "R&D": 2},
    "31000000": {"Manufacturing": 5, "Maintenance": 3},
    "27000000": {"Manufacturing": 4, "Maintenance": 4},
    "40000000": {"Maintenance": 5, "Manufacturing": 3},
    "39000000": {"Maintenance": 4, "Manufacturing": 3},
    "80000000": {"Finance": 3, "HR": 3, "Procurement": 3},
    "78000000": {"Logistics": 6},
    "84000000": {"Finance": 6},
    "76000000": {"Facilities": 6},
    "72000000": {"Facilities": 6},
    "47000000": {"Facilities": 5},
    "90000000": {"HR": 3, "Sales & Marketing": 3},
    "25000000": {"Logistics": 5, "Manufacturing": 3},
    "44000000": {"Procurement": 3, "Facilities": 3},
}

def pick_cost_center(plant_region, segment_code):
    weights_map = SEGMENT_DEPT_WEIGHTS.get(segment_code, {})
    candidates = cc_by_region[plant_region]
    weights = [weights_map.get(cc["department"], 1) for cc in candidates]
    return random.choices(candidates, weights=weights, k=1)[0]

# --------------------------------------------------------------------------------------
# Category -> eligible-supplier-pool assignment (the whole point of the mock).
# --------------------------------------------------------------------------------------

category_codes = [c["code"] for c in CATEGORIES]
shuffled_categories = category_codes[:]
random.shuffle(shuffled_categories)

SINGLE_SOURCE_CATS = shuffled_categories[0:17]
DUAL_SOURCE_CATS = shuffled_categories[17:23]
THREE_SOURCE_CATS = shuffled_categories[23:29]
DIVERSE_CATS_4_5 = shuffled_categories[29:34]
DIVERSE_CATS_6_9 = shuffled_categories[34:38]

all_gu_ids = [gu["gu_id"] for gu in GLOBAL_ULTIMATES]

# 8 "critical" GUs reused as the sole supplier across the 17 single-source
# categories (distribution sums to 17: a few critical GUs cover 2-3 categories
# each -- the concentration-risk story).
critical_gus = random.sample(all_gu_ids, 8)
single_source_load = [3, 3, 2, 2, 2, 2, 2, 1]
assert sum(single_source_load) == 17
single_source_assignment = []
for gu_id, n in zip(critical_gus, single_source_load):
    single_source_assignment.extend([gu_id] * n)
random.shuffle(single_source_assignment)

category_suppliers = {}
for cat_code, gu_id in zip(SINGLE_SOURCE_CATS, single_source_assignment):
    category_suppliers[cat_code] = [gu_id]

remaining_gus_pool = [g for g in all_gu_ids if g not in critical_gus] + critical_gus

def pick_distinct_gus(n):
    return random.sample(remaining_gus_pool, n)

for cat_code in DUAL_SOURCE_CATS:
    category_suppliers[cat_code] = pick_distinct_gus(2)
for cat_code in THREE_SOURCE_CATS:
    category_suppliers[cat_code] = pick_distinct_gus(3)
for cat_code in DIVERSE_CATS_4_5:
    category_suppliers[cat_code] = pick_distinct_gus(random.randint(4, 5))
for cat_code in DIVERSE_CATS_6_9:
    category_suppliers[cat_code] = pick_distinct_gus(random.randint(6, 9))

assert set(category_suppliers.keys()) == set(category_codes)

TIER_MULTIPLIER = {}
for c in SINGLE_SOURCE_CATS:
    TIER_MULTIPLIER[c] = 1.0
for c in DUAL_SOURCE_CATS:
    TIER_MULTIPLIER[c] = 3.0
for c in THREE_SOURCE_CATS:
    TIER_MULTIPLIER[c] = 6.0
for c in DIVERSE_CATS_4_5:
    TIER_MULTIPLIER[c] = 12.0
for c in DIVERSE_CATS_6_9:
    TIER_MULTIPLIER[c] = 25.0

category_raw_weight = {c: TIER_MULTIPLIER[c] * random.lognormvariate(0, 0.9) for c in category_codes}
weight_sum = sum(category_raw_weight.values())
category_target_spend = {c: category_raw_weight[c] / weight_sum * TARGET_TOTAL for c in category_codes}

invoice_weight = {c: (category_target_spend[c] ** 0.5) for c in category_codes}
iw_sum = sum(invoice_weight.values())
category_invoice_count = {}
allocated = 0
for c in category_codes:
    n = max(3, round(invoice_weight[c] / iw_sum * N_INVOICES))
    category_invoice_count[c] = n
    allocated += n
# nudge the largest category to absorb rounding drift so total invoices ~= N_INVOICES
drift = N_INVOICES - allocated
largest_cat = max(category_codes, key=lambda c: category_invoice_count[c])
category_invoice_count[largest_cat] = max(3, category_invoice_count[largest_cat] + drift)

# --------------------------------------------------------------------------------------
# Invoice generation
# --------------------------------------------------------------------------------------

def random_date_in_window():
    span = (END - START).days
    return START + timedelta(days=random.randint(0, span))

def gu_region(gu_id):
    return next(gu["region"] for gu in GLOBAL_ULTIMATES if gu["gu_id"] == gu_id)

gu_by_id = {gu["gu_id"]: gu for gu in GLOBAL_ULTIMATES}

def pick_plant(preferred_region):
    if random.random() < 0.7:
        return random.choice(PLANTS_BY_REGION[preferred_region])
    return random.choice(PLANTS)

invoices = []
invoice_seq = 1

for cat in CATEGORIES:
    cat_code = cat["code"]
    supplier_gu_ids = category_suppliers[cat_code]
    n_invoices = category_invoice_count[cat_code]
    product_pool = products_by_category[cat_code]

    # weight suppliers within a category so even multi-source categories have
    # a dominant supplier (realistic), but every assigned GU gets >=1 invoice.
    gu_weights = {gu_id: random.lognormvariate(0, 0.6) for gu_id in supplier_gu_ids}

    raw_rows = []
    for i in range(n_invoices):
        if i < len(supplier_gu_ids):
            gu_id = supplier_gu_ids[i]
        else:
            gu_id = random.choices(supplier_gu_ids, weights=[gu_weights[g] for g in supplier_gu_ids], k=1)[0]

        entity = random.choice(suppliers_by_gu[gu_id])
        plant = pick_plant(gu_region(gu_id))
        product = random.choice(product_pool)
        cost_center = pick_cost_center(plant["region"], cat["segment_code"])
        raw_amount = random.lognormvariate(0, 1.0)

        raw_rows.append({
            "gu_id": gu_id,
            "entity": entity,
            "plant": plant,
            "product": product,
            "cost_center": cost_center,
            "raw_amount": raw_amount,
        })

    raw_total = sum(r["raw_amount"] for r in raw_rows)
    scale = category_target_spend[cat_code] / raw_total if raw_total > 0 else 0

    for r in raw_rows:
        gu = gu_by_id[r["gu_id"]]
        invoice_date = random_date_in_window()
        amount = round(r["raw_amount"] * scale, 2)
        invoices.append({
            "invoice_id": f"INV-{invoice_seq:06d}",
            "invoice_date": invoice_date.isoformat(),
            "amount": amount,
            "currency": CURRENCY,
            "supplier_id": r["entity"]["supplier_id"],
            "supplier_name": r["entity"]["supplier_name"],
            "global_ultimate_id": gu["gu_id"],
            "global_ultimate_name": gu["gu_name"],
            "category_code": cat_code,
            "category_name": cat["name"],
            "segment_code": cat["segment_code"],
            "segment_name": cat["segment_name"],
            "plant_id": r["plant"]["plant_id"],
            "plant_name": r["plant"]["name"],
            "region": r["plant"]["region"],
            "country": r["plant"]["country"],
            "source_system_id": random.choice(SOURCE_SYSTEMS)["id"],
            "product_id": r["product"]["product_id"],
            "product_name": r["product"]["product_name"],
            "cost_center_id": r["cost_center"]["cost_center_id"],
            "cost_center_name": r["cost_center"]["name"],
        })
        invoice_seq += 1

random.shuffle(invoices)
for idx, inv in enumerate(invoices, start=1):
    inv["invoice_id"] = f"INV-{idx:06d}"
invoices.sort(key=lambda inv: inv["invoice_date"])

# --------------------------------------------------------------------------------------
# Write output
# --------------------------------------------------------------------------------------

def write_json(filename, data):
    with open(os.path.join(DATADIR, filename), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

write_json("categories.json", CATEGORIES)
write_json("plants.json", PLANTS)
write_json("source_systems.json", SOURCE_SYSTEMS)
write_json("global_ultimates.json", GLOBAL_ULTIMATES)
write_json("suppliers.json", SUPPLIERS)
write_json("products.json", PRODUCTS)
write_json("cost_centers.json", COST_CENTERS)
write_json("invoices.json", invoices)

single_source_spend = sum(inv["amount"] for inv in invoices if inv["category_code"] in SINGLE_SOURCE_CATS)
single_source_gu_count = len(set(inv["global_ultimate_id"] for inv in invoices if inv["category_code"] in SINGLE_SOURCE_CATS))
single_source_product_count = len(set(inv["product_id"] for inv in invoices if inv["category_code"] in SINGLE_SOURCE_CATS))

metadata = {
    "generated_by": "generate_data.py",
    "seed": SEED,
    "currency": CURRENCY,
    "reference_today": REF_TODAY.isoformat(),
    "date_window": {
        "start": START.isoformat(),
        "end": END.isoformat(),
        "description": "last 12 completed months as of reference_today",
    },
    "counts": {
        "invoices": len(invoices),
        "global_ultimates": len(GLOBAL_ULTIMATES),
        "suppliers": len(SUPPLIERS),
        "categories": len(CATEGORIES),
        "products": len(PRODUCTS),
        "cost_centers": len(COST_CENTERS),
        "plants": len(PLANTS),
        "source_systems": len(SOURCE_SYSTEMS),
        "single_source_categories": len(SINGLE_SOURCE_CATS),
        "dual_source_categories": len(DUAL_SOURCE_CATS),
    },
    "single_source_slice": {
        "categories": len(SINGLE_SOURCE_CATS),
        "distinct_suppliers": single_source_gu_count,
        "distinct_products": single_source_product_count,
        "spend": round(single_source_spend, 2),
        "spend_share_of_total": round(single_source_spend / TARGET_TOTAL * 100, 3),
    },
    "notes": [
        "Row-per-invoice fact table; all KPIs/widgets/tables derive from invoices.json.",
        "category_code -> eligible Global-Ultimate supplier pool is fixed BEFORE invoice generation, not inferred after the fact.",
        "17 of 38 categories are true single-source (1 eligible GU); 8 critical GUs are reused as the sole supplier across several of them.",
        "Single-source categories carry a small overall share of total spend but a few land high-value outliers by chance -- the risk is exposure, not dollar volume.",
    ],
}
write_json("metadata.json", metadata)

print(f"Wrote {len(invoices)} invoices, total spend {sum(i['amount'] for i in invoices):,.2f}")
print(f"Single-source slice: {len(SINGLE_SOURCE_CATS)} categories, {single_source_gu_count} distinct suppliers, "
      f"{single_source_product_count} products, spend {single_source_spend:,.2f} "
      f"({single_source_spend / TARGET_TOTAL * 100:.2f}% of total)")
