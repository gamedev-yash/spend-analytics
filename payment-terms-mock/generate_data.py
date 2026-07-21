#!/usr/bin/env python3
"""
Mock data generator for the SAP Spend Control Tower – "Spend Assessment: Payment Terms" dashboard.

Design goals
------------
1. Deterministic (fixed seed) so the demo is 100% reproducible.
2. One row-per-invoice fact table + small dimension tables. Every KPI / widget / table
   in the target dashboard is derived from this single fact table so nothing can drift.
3. Patterns are *planted* (not random noise) so the dashboard tells a story:
     - Pareto spend concentration (top ~10 global-ultimate suppliers ~= 75-80% of spend)
     - Payment-behaviour clusters: chronic-late payers, early payers (wasted working
       capital), discount capturers vs. discount missers  -> the gap between a term's
       NOMINAL days and the ACTUAL paid days is the whole point of this dashboard
     - Term fragmentation hotspots: a few suppliers/categories using 10-15 distinct
       payment terms (a governance red flag) while most use 1-3
     - ~45-50 distinct term codes, heavily concentrated on NET30/45/60 with a long tail
4. Faithful-to-SAP quirks: "(No Value)" rows (null category / null term) and open
   (unpaid) invoices excluded from Average Paid Days.

Output: normalized dimension JSON + a denormalized invoices.json (FKs + display fields
+ paid_days) so a Next.js app can chart directly without joins.
"""

import json
import os
import random
from datetime import date, timedelta
from collections import defaultdict, Counter

# --------------------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------------------
SEED = 42
random.seed(SEED)

N_INVOICES      = 1500
N_GLOBAL_ULT    = 50          # number of enriched parent suppliers (Global Ultimate)
PARETO_ALPHA    = 1.10        # Zipf exponent controlling spend concentration
TARGET_TOTAL    = 950_000_000 # headline Total Spend (USD) after uniform rescale
CURRENCY        = "USD"

# Last 12 COMPLETED months as of the reference "today" (20 Jul 2026) -> Jul 2025..Jun 2026
REF_TODAY = date(2026, 7, 20)
START     = date(2025, 7, 1)
END       = date(2026, 6, 30)

OUTDIR  = "/mnt/user-data/outputs/payment-terms-mock"
DATADIR = os.path.join(OUTDIR, "data")
os.makedirs(DATADIR, exist_ok=True)


# --------------------------------------------------------------------------------------
# Dimension: Payment Terms  (~50 codes; nominal_days + optional early-pay discount)
# w = relative popularity used when picking a supplier's dominant term
# --------------------------------------------------------------------------------------
def term(code, name, nominal, w, disc_pct=0.0, disc_days=0, kind="standard"):
    return {"code": code, "name": name, "nominal_days": nominal,
            "discount_pct": disc_pct, "discount_days": disc_days, "kind": kind, "w": w}

PAYMENT_TERMS = [
    # ---- standard net terms (the bulk of volume) ----
    term("NET00", "Immediate / Due on receipt", 0, 6, kind="immediate"),
    term("NET07", "Net 7",   7,   4),
    term("NET10", "Net 10",  10,  6),
    term("NET14", "Net 14",  14,  5),
    term("NET15", "Net 15",  15,  22),
    term("NET21", "Net 21",  21,  6),
    term("NET30", "Net 30",  30,  60),   # dominant term
    term("NET45", "Net 45",  45,  34),
    term("NET60", "Net 60",  60,  26),
    term("NET75", "Net 75",  75,  7),
    term("NET90", "Net 90",  90,  12),
    term("NET120","Net 120", 120, 4),
    # ---- early-payment discount terms ----
    term("D2N10N30",  "2% 10 Net 30",   30, 10, 2.0, 10, "discount"),
    term("D1N10N30",  "1% 10 Net 30",   30, 6,  1.0, 10, "discount"),
    term("D15N10N30", "1.5% 10 Net 30", 30, 4,  1.5, 10, "discount"),
    term("D2N15N45",  "2% 15 Net 45",   45, 6,  2.0, 15, "discount"),
    term("D1N15N45",  "1% 15 Net 45",   45, 4,  1.0, 15, "discount"),
    term("D2N10N45",  "2% 10 Net 45",   45, 3,  2.0, 10, "discount"),
    term("D3N10N60",  "3% 10 Net 60",   60, 3,  3.0, 10, "discount"),
    term("D2N20N60",  "2% 20 Net 60",   60, 2,  2.0, 20, "discount"),
    term("D5N10N30",  "5% 10 Net 30",   30, 1,  5.0, 10, "discount"),
    # ---- end-of-month / monthly cycle terms (nominal = approx avg days) ----
    term("EOM15",  "End of month + 15", 30,  4, kind="eom"),
    term("EOM30",  "End of month + 30", 45,  5, kind="eom"),
    term("EOM45",  "EOM Net 45",        60,  2, kind="eom"),
    term("EOM60",  "End of month + 60", 75,  3, kind="eom"),
    term("EOM90",  "End of month + 90", 105, 1, kind="eom"),
    term("MP10",   "Monthly, paid 10th",25,  2, kind="eom"),
    term("MP25",   "Monthly, paid 25th",40,  2, kind="eom"),
    term("WEEKLY", "Weekly settlement",  7,  1, kind="eom"),
    # ---- special / advance / milestone / retention ----
    term("CIA",       "Cash in advance",            0,  2, kind="special"),
    term("COD",       "Cash on delivery",           0,  2, kind="special"),
    term("ADV5050",   "50% advance / 50% Net 30",   30, 2, kind="special"),
    term("MILESTONE", "Milestone based",            45, 2, kind="special"),
    term("RET10N60",  "10% retention / Net 60",     60, 1, kind="special"),
    # ---- long tail of oddball net terms (drive fragmentation) ----
    term("NET02", "Net 2",   2,   1),
    term("NET04", "Net 4",   4,   1),
    term("NET05", "Net 5",   5,   1),
    term("NET08", "Net 8",   8,   1),
    term("NET11", "Net 11",  11,  1),
    term("NET13", "Net 13",  13,  1),
    term("NET20", "Net 20",  20,  2),
    term("NET25", "Net 25",  25,  2),
    term("NET35", "Net 35",  35,  1),
    term("NET40", "Net 40",  40,  2),
    term("NET50", "Net 50",  50,  2),
    term("NET55", "Net 55",  55,  1),
    term("NET70", "Net 70",  70,  1),
    term("NET100","Net 100", 100, 1),
    term("NET150","Net 150", 150, 1),
    term("NET180","Net 180", 180, 1),
]
TERM_BY_CODE = {t["code"]: t for t in PAYMENT_TERMS}
COMMON_TERM_CODES = [t["code"] for t in PAYMENT_TERMS]           # for weighted repertoire
COMMON_TERM_W     = [t["w"] for t in PAYMENT_TERMS]


# --------------------------------------------------------------------------------------
# Dimension: Categories (UNSPSC-style: segment 8-digit -> class leaf). level 3 = leaf.
# --------------------------------------------------------------------------------------
SEGMENTS = {
    "40000000": ("Distribution and Conditioning Systems and Equipment", [
        ("40140000", "Fluid handling pumps"), ("40150000", "Industrial valves"),
        ("40160000", "HVAC equipment"),       ("40170000", "Compressors and blowers")]),
    "31000000": ("Manufacturing Components and Supplies", [
        ("31160000", "Hardware and fasteners"), ("31170000", "Bearings and bushings"),
        ("31200000", "Adhesives and sealants"), ("31350000", "Machined castings")]),
    "39000000": ("Electrical Systems and Lighting and Components", [
        ("39120000", "Electrical wire and cable"), ("39110000", "Lighting fixtures"),
        ("39130000", "Electrical hardware")]),
    "27000000": ("Tools and General Machinery", [
        ("27110000", "Hand tools"), ("27130000", "Power tools"),
        ("27140000", "Hydraulic machinery")]),
    "43000000": ("Information Technology Broadcasting and Telecommunications", [
        ("43210000", "Computer equipment"), ("43220000", "Networking equipment"),
        ("43230000", "Software licenses"),  ("43190000", "Communications devices")]),
    "44000000": ("Office Equipment and Accessories and Supplies", [
        ("44120000", "Office supplies"), ("44100000", "Office machines"),
        ("44110000", "Desk accessories")]),
    "80000000": ("Management and Business Professionals and Admin Services", [
        ("80100000", "Management consulting"), ("80110000", "HR services"),
        ("80160000", "Business administration services")]),
    "78000000": ("Transportation and Storage and Mail Services", [
        ("78100000", "Freight transport"), ("78130000", "Warehousing and storage"),
        ("78180000", "Courier and postal services")]),
    "84000000": ("Financial and Insurance Services", [
        ("84120000", "Banking and finance services"), ("84130000", "Insurance")]),
    "76000000": ("Industrial Cleaning Services", [
        ("76110000", "Cleaning services"), ("76120000", "Waste management")]),
    "72000000": ("Building and Facility Maintenance Services", [
        ("72100000", "Facility maintenance"), ("72150000", "Building repair services")]),
    "47000000": ("Cleaning Equipment and Supplies", [
        ("47130000", "Cleaning supplies")]),
    "90000000": ("Travel and Food and Lodging and Entertainment Services", [
        ("90100000", "Catering and restaurants"), ("90120000", "Travel services")]),
    "25000000": ("Commercial and Private Vehicles and Components", [
        ("25170000", "Vehicle components and accessories"), ("25100000", "Motor vehicles")]),
}

CATEGORIES = []
for seg_code, (seg_name, leaves) in SEGMENTS.items():
    for leaf_code, leaf_name in leaves:
        CATEGORIES.append({
            "code": leaf_code, "name": leaf_name,
            "segment_code": seg_code, "segment_name": seg_name, "level": 3,
        })
CAT_BY_CODE = {c["code"]: c for c in CATEGORIES}

# Categories that attract many suppliers & many terms (classic maverick-spend hotspots).
# Each gets a FIXED pool of ~12-16 terms so its distinct-term count is controlled
# (a count metric would otherwise just grow with invoice volume).
SPRAWL_CATEGORIES = {"72100000", "44120000", "31160000"}
SPRAWL_CAT_POOL = {code: random.sample(COMMON_TERM_CODES, random.randint(12, 16))
                   for code in sorted(SPRAWL_CATEGORIES)}
# popularity weight -> how many suppliers touch each category
CAT_POP = {c["code"]: (5.0 if c["code"] in SPRAWL_CATEGORIES else 1.0) for c in CATEGORIES}
# rough relative invoice-size factor by segment (services/IT big, supplies small)
SEG_SIZE_FACTOR = {
    "80000000": 2.4, "43000000": 2.0, "78000000": 1.8, "84000000": 1.9,
    "40000000": 1.4, "25000000": 1.6, "39000000": 1.1, "27000000": 1.0,
    "31000000": 0.9, "72000000": 1.2, "76000000": 0.9, "90000000": 0.8,
    "44000000": 0.5, "47000000": 0.5,
}


# --------------------------------------------------------------------------------------
# Dimension: Plants / Sites  (Pune included; a few large plants dominate volume)
# --------------------------------------------------------------------------------------
PLANTS = [
    {"plant_id": "PLT-PUN", "name": "Pune Plant",     "country": "India",          "country_code": "IN", "region": "APAC",  "w": 14},
    {"plant_id": "PLT-CHN", "name": "Chennai Plant",  "country": "India",          "country_code": "IN", "region": "APAC",  "w": 6},
    {"plant_id": "PLT-SHA", "name": "Shanghai Plant", "country": "China",          "country_code": "CN", "region": "APAC",  "w": 8},
    {"plant_id": "PLT-SNG", "name": "Singapore Hub",  "country": "Singapore",      "country_code": "SG", "region": "APAC",  "w": 4},
    {"plant_id": "PLT-DET", "name": "Detroit Plant",  "country": "United States",  "country_code": "US", "region": "NAMER", "w": 13},
    {"plant_id": "PLT-HOU", "name": "Houston Plant",  "country": "United States",  "country_code": "US", "region": "NAMER", "w": 9},
    {"plant_id": "PLT-CLT", "name": "Charlotte Plant","country": "United States",  "country_code": "US", "region": "NAMER", "w": 6},
    {"plant_id": "PLT-TOR", "name": "Toronto Plant",  "country": "Canada",         "country_code": "CA", "region": "NAMER", "w": 4},
    {"plant_id": "PLT-STU", "name": "Stuttgart Plant","country": "Germany",        "country_code": "DE", "region": "EMEA",  "w": 11},
    {"plant_id": "PLT-MAN", "name": "Manchester Plant","country": "United Kingdom","country_code": "GB", "region": "EMEA",  "w": 6},
    {"plant_id": "PLT-LYO", "name": "Lyon Plant",     "country": "France",         "country_code": "FR", "region": "EMEA",  "w": 5},
    {"plant_id": "PLT-ROT", "name": "Rotterdam DC",   "country": "Netherlands",    "country_code": "NL", "region": "EMEA",  "w": 4},
    {"plant_id": "PLT-MTY", "name": "Monterrey Plant","country": "Mexico",         "country_code": "MX", "region": "LATAM", "w": 5},
    {"plant_id": "PLT-SAO", "name": "Sao Paulo Plant","country": "Brazil",         "country_code": "BR", "region": "LATAM", "w": 4},
]
PLANTS_BY_REGION = defaultdict(list)
for p in PLANTS:
    PLANTS_BY_REGION[p["region"]].append(p)
REGIONS = ["NAMER", "EMEA", "APAC", "LATAM"]


# --------------------------------------------------------------------------------------
# Dimension: Source Systems
# --------------------------------------------------------------------------------------
SOURCE_SYSTEMS = [
    {"id": "SAP_S4HANA", "name": "SAP S/4HANA",  "w": 46},
    {"id": "SAP_ECC",    "name": "SAP ERP (ECC)", "w": 30},
    {"id": "ARIBA",      "name": "SAP Ariba",     "w": 14},
    {"id": "FIELDGLASS", "name": "SAP Fieldglass","w": 6},
    {"id": "CONCUR",     "name": "SAP Concur",    "w": 4},
]
SRC_IDS = [s["id"] for s in SOURCE_SYSTEMS]
SRC_W   = [s["w"] for s in SOURCE_SYSTEMS]


# --------------------------------------------------------------------------------------
# Suppliers: 75 Global Ultimates, each with 1-6 child legal entities
# --------------------------------------------------------------------------------------
ROOTS = ["Meridian","Apex","Cardinal","Nimbus","Vanguard","Summit","Ironclad","Beacon",
    "Vertex","Keystone","Pinnacle","Atlas","Cobalt","Granite","Harbor","Orion","Sterling",
    "Titan","Zenith","Alloy","Crestline","Everest","Falcon","Highpoint","Juniper","Lattice",
    "Monarch","Northwind","Oakridge","Pacific","Quantum","Redwood","Sequoia","Trident","Union",
    "Westfield","Yellowstone","Anchor","Brightline","Copperfield","Dynamo","Emerald","Frontier",
    "Halcyon","Ironwood","Lighthouse","Cascade","Bluepeak","Silverline","Windward","Kestrel",
    "Marlin","Onyx","Pioneer","Ridgeway","Talon","Umbra","Vantage","Willow","Axiom"]
NOUNS = ["Industrial Supply","Manufacturing","Logistics","Technologies","Components","Fasteners",
    "Electricals","Fluid Systems","Automation","Materials","Bearings","Packaging","Chemicals",
    "Instruments","Machinery","Controls","Metals","Polymers","Tooling","Solutions","Services",
    "Engineering","Systems","Distribution","Fabrication","Cloud Services","Software","Consulting",
    "Facilities","Freight","Transport","Energy","Hydraulics","Sensors","Bearing Works","Supply Co"]
PARENT_SUFFIX = ["Holdings","Group","Corporation","Inc.","Global","International","Industries"]
CHILD_SUFFIX = {
    "NAMER": ["Inc.","LLC","Corp.","Co."],
    "EMEA":  ["GmbH","Ltd.","S.A.","B.V.","AG","S.p.A."],
    "APAC":  ["Pvt. Ltd.","Pte. Ltd.","Co. Ltd.","Ltd."],
    "LATAM": ["S.A. de C.V.","Ltda.","S.A."],
}
CITY_BY_CC = {"US":["Detroit","Houston","Charlotte","Cleveland"],"CA":["Toronto","Montreal"],
    "DE":["Stuttgart","Munich"],"GB":["Manchester","Leeds"],"FR":["Lyon","Lille"],
    "NL":["Rotterdam","Eindhoven"],"IT":["Milan","Turin"],"IN":["Pune","Chennai","Bengaluru"],
    "CN":["Shanghai","Shenzhen"],"JP":["Osaka","Nagoya"],"SG":["Singapore"],
    "MX":["Monterrey","Queretaro"],"BR":["Sao Paulo","Campinas"]}
COUNTRIES_BY_REGION = {
    "NAMER":[("United States","US"),("Canada","CA")],
    "EMEA":[("Germany","DE"),("United Kingdom","GB"),("France","FR"),("Netherlands","NL"),("Italy","IT")],
    "APAC":[("India","IN"),("China","CN"),("Japan","JP"),("Singapore","SG")],
    "LATAM":[("Mexico","MX"),("Brazil","BR")],
}

PAYMENT_ARCHETYPES = (
    ["on_time"]*45 + ["early_payer"]*15 + ["chronic_late"]*15 +
    ["discount_capturer"]*10 + ["discount_misser"]*8 + ["erratic"]*7
)

def weighted_sample_no_replace(items, weights, k):
    items = list(items); weights = list(weights); chosen = []
    k = min(k, len(items))
    for _ in range(k):
        i = random.choices(range(len(items)), weights=weights, k=1)[0]
        chosen.append(items.pop(i)); weights.pop(i)
    return chosen

# Zipf spend weights (rank 1 = biggest) -> drives Pareto concentration
gu_spend_weight = [1.0 / ((r + 1) ** PARETO_ALPHA) for r in range(N_GLOBAL_ULT)]

# sprawl (many-term) GUs: seed a few among the top-15 so they surface in the top-suppliers widget
SPRAWL_GU_RANKS = {2, 5, 9, 14, 25, 38}

used_name_pairs = set()
def make_name_pair():
    while True:
        root, noun = random.choice(ROOTS), random.choice(NOUNS)
        if (root, noun) not in used_name_pairs:
            used_name_pairs.add((root, noun)); return root, noun

GLOBAL_ULTIMATES = []
SUPPLIERS = []
sup_counter = 0
for rank in range(N_GLOBAL_ULT):
    root, noun = make_name_pair()
    gu_region = random.choice(REGIONS)
    gu_id = f"GU-{rank+1:04d}"
    gu_name = f"{root} {noun} {random.choice(PARENT_SUFFIX)}"
    is_sprawl = rank in SPRAWL_GU_RANKS
    archetype = random.choice(PAYMENT_ARCHETYPES)

    # --- term repertoire ---
    if is_sprawl:
        n_terms = random.randint(10, 15)
        rep = random.sample(COMMON_TERM_CODES, n_terms)       # uniform -> weird assortment + tail
        rep_w = [random.uniform(1, 2) for _ in rep]           # flat -> many terms actually used
    else:
        n_terms = random.randint(1, 3)
        rep = weighted_sample_no_replace(COMMON_TERM_CODES, COMMON_TERM_W, n_terms)
        rep_w = [6, 3, 1][:len(rep)]                          # one dominant common term

    # --- category repertoire (what this supplier sells) ---
    k_cat = random.randint(1, 6 if is_sprawl else 4)
    cat_rep = weighted_sample_no_replace(
        [c["code"] for c in CATEGORIES], [CAT_POP[c["code"]] for c in CATEGORIES], k_cat)

    GLOBAL_ULTIMATES.append({
        "gu_id": gu_id, "gu_name": gu_name, "region": gu_region,
        "_rank": rank, "_weight": gu_spend_weight[rank], "_archetype": archetype,
        "_terms": rep, "_term_w": rep_w, "_cats": cat_rep, "_is_sprawl": is_sprawl,
    })

    # --- child legal entities ---
    n_children = random.randint(1, 6)
    for _ in range(n_children):
        sup_counter += 1
        country, cc = random.choice(COUNTRIES_BY_REGION[gu_region])
        city = random.choice(CITY_BY_CC.get(cc, ["City"]))
        suffix = random.choice(CHILD_SUFFIX[gu_region])
        sup_id = f"SUP-{sup_counter:05d}"
        sup_name = f"{root} {noun} {city} {suffix}"
        SUPPLIERS.append({
            "supplier_id": sup_id, "supplier_name": sup_name,
            "global_ultimate_id": gu_id, "global_ultimate_name": gu_name,
            "region": gu_region, "country": country, "country_code": cc,
        })

SUPPLIERS_BY_GU = defaultdict(list)
for s in SUPPLIERS:
    SUPPLIERS_BY_GU[s["global_ultimate_id"]].append(s)


# --------------------------------------------------------------------------------------
# Fact table: invoices
# --------------------------------------------------------------------------------------
def random_date():
    return START + timedelta(days=random.randint(0, (END - START).days))

def pick_source_system(seg_code):
    if seg_code == "90000000" and random.random() < 0.7:      # travel -> Concur
        return "CONCUR"
    if seg_code in {"80000000", "78000000", "76000000", "72000000"} and random.random() < 0.30:
        return "FIELDGLASS"                                    # services -> Fieldglass
    return random.choices(SRC_IDS, weights=SRC_W, k=1)[0]

def sample_paid_days(t, archetype):
    """Actual days-to-pay. The gap vs. nominal days is the dashboard's core insight."""
    nd, disc = t["nominal_days"], t["discount_days"]
    if nd <= 0:
        return max(1, round(abs(random.gauss(3, 2))))
    if archetype == "on_time":
        v = nd + random.gauss(2, 3)
    elif archetype == "chronic_late":
        v = nd + random.gauss(16, 6)
    elif archetype == "early_payer":
        v = nd - abs(random.gauss(14, 5))
    elif archetype == "erratic":
        v = random.gauss(nd, max(8, nd * 0.40))
    elif archetype == "discount_capturer":
        v = (disc + random.gauss(1, 2)) if disc else (nd + random.gauss(3, 3))
    elif archetype == "discount_misser":
        v = nd + random.gauss(4, 4)                            # pays net, forfeits discount
    else:
        v = nd + random.gauss(2, 3)
    return int(max(1, min(round(v), nd + 130)))

gu_pick_ids = [g["gu_id"] for g in GLOBAL_ULTIMATES]
gu_pick_w   = [g["_weight"] for g in GLOBAL_ULTIMATES]
GU_BY_ID    = {g["gu_id"]: g for g in GLOBAL_ULTIMATES}
plant_ids_w = ([p for p in PLANTS], [p["w"] for p in PLANTS])

raw_invoices = []
for i in range(N_INVOICES):
    gu = GU_BY_ID[random.choices(gu_pick_ids, weights=gu_pick_w, k=1)[0]]
    supplier = random.choice(SUPPLIERS_BY_GU[gu["gu_id"]])

    # ---- category (small chance of "(No Value)") ----
    if random.random() < 0.04:
        cat = None; seg_code = None
    else:
        cat_code = random.choice(gu["_cats"])
        cat = CAT_BY_CODE[cat_code]; seg_code = cat["segment_code"]

    # ---- payment term selection ----
    # Priority keeps the two fragmentation stories separate and bounded:
    #   fragmented supplier -> its own wide repertoire (widget 2 story)
    #   fragmented category served by a normal supplier -> the category's fixed pool (widget 1 story)
    #   everyone else -> the supplier's 1-3 mostly-common terms
    if random.random() < 0.02:                                       # "(No Value)" term
        term_code = None
    elif gu["_is_sprawl"]:                                           # supplier-driven fragmentation
        term_code = random.choices(gu["_terms"], weights=gu["_term_w"], k=1)[0]
    elif cat is not None and cat["code"] in SPRAWL_CATEGORIES:       # category-driven fragmentation
        term_code = random.choice(SPRAWL_CAT_POOL[cat["code"]])
    else:                                                           # normal supplier repertoire
        term_code = random.choices(gu["_terms"], weights=gu["_term_w"], k=1)[0]

    timing_term = TERM_BY_CODE[term_code] if term_code else TERM_BY_CODE[
        random.choice(["NET30", "NET45", "NET60"])]

    # ---- plant (usually in supplier region) ----
    if random.random() < 0.65:
        pl_pool = PLANTS_BY_REGION[gu["region"]]
        plant = random.choices(pl_pool, weights=[p["w"] for p in pl_pool], k=1)[0]
    else:
        plant = random.choices(plant_ids_w[0], weights=plant_ids_w[1], k=1)[0]

    inv_date = random_date()

    # ---- amount (lognormal * segment size factor * mega-vendor factor) ----
    amt = random.lognormvariate(10.4, 1.05)
    amt *= SEG_SIZE_FACTOR.get(seg_code, 1.0) if seg_code else 1.0

    # ---- paid vs. open (recent invoices more likely still open) ----
    days_since = (REF_TODAY - inv_date).days
    nd = timing_term["nominal_days"]
    if days_since < nd + 5:      p_unpaid = 0.55
    elif days_since < nd + 30:   p_unpaid = 0.14
    else:                        p_unpaid = 0.02
    if random.random() < p_unpaid:
        paid_date = None; paid_days = None
    else:
        paid_days = sample_paid_days(timing_term, gu["_archetype"])
        paid_date = inv_date + timedelta(days=paid_days)

    src = pick_source_system(seg_code) if seg_code else random.choices(SRC_IDS, weights=SRC_W, k=1)[0]

    raw_invoices.append({
        "supplier": supplier, "gu": gu, "cat": cat, "plant": plant,
        "term_code": term_code, "inv_date": inv_date, "paid_date": paid_date,
        "paid_days": paid_days, "src": src, "_amt": amt,
    })

# ---- rescale amounts so Total Spend == TARGET_TOTAL exactly (shape preserved) ----
scale = TARGET_TOTAL / sum(r["_amt"] for r in raw_invoices)

invoices = []
for idx, r in enumerate(raw_invoices, start=1):
    amount = round(r["_amt"] * scale, 2)
    t = TERM_BY_CODE[r["term_code"]] if r["term_code"] else None
    cat = r["cat"]
    invoices.append({
        "invoice_id":            f"INV-{idx:06d}",
        "invoice_date":          r["inv_date"].isoformat(),
        "paid_date":             r["paid_date"].isoformat() if r["paid_date"] else None,
        "paid_days":             r["paid_days"],
        "is_paid":               r["paid_date"] is not None,
        "amount":                amount,
        "currency":              CURRENCY,
        "supplier_id":           r["supplier"]["supplier_id"],
        "supplier_name":         r["supplier"]["supplier_name"],
        "global_ultimate_id":    r["gu"]["gu_id"],
        "global_ultimate_name":  r["gu"]["gu_name"],
        "category_code":         cat["code"] if cat else None,
        "category_name":         cat["name"] if cat else None,
        "segment_code":          cat["segment_code"] if cat else None,
        "segment_name":          cat["segment_name"] if cat else None,
        "plant_id":              r["plant"]["plant_id"],
        "plant_name":            r["plant"]["name"],
        "region":                r["plant"]["region"],
        "country":               r["plant"]["country"],
        "source_system_id":      r["src"],
        "payment_term_code":     r["term_code"],
        "payment_term_name":     t["name"] if t else None,
        "nominal_days":          t["nominal_days"] if t else None,
    })


# --------------------------------------------------------------------------------------
# Write dimension + fact JSON (public dims are kept "clean" – no synthetic archetype leak)
# --------------------------------------------------------------------------------------
def dump(name, obj):
    path = os.path.join(DATADIR, name)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2)
    return path, os.path.getsize(path)

pub_terms = [{k: t[k] for k in ("code","name","nominal_days","discount_pct","discount_days","kind")}
             for t in PAYMENT_TERMS]
pub_gus = [{"gu_id": g["gu_id"], "gu_name": g["gu_name"], "region": g["region"],
            "n_entities": len(SUPPLIERS_BY_GU[g["gu_id"]])} for g in GLOBAL_ULTIMATES]
pub_src = [{k: s[k] for k in ("id","name")} for s in SOURCE_SYSTEMS]
pub_plants = [{k: p[k] for k in ("plant_id","name","country","country_code","region")} for p in PLANTS]

metadata = {
    "generated_by": "generate_data.py",
    "seed": SEED,
    "currency": CURRENCY,
    "reference_today": REF_TODAY.isoformat(),
    "date_window": {"start": START.isoformat(), "end": END.isoformat(),
                    "description": "last 12 completed months as of reference_today"},
    "counts": {
        "invoices": len(invoices), "global_ultimates": len(GLOBAL_ULTIMATES),
        "suppliers": len(SUPPLIERS), "categories": len(CATEGORIES),
        "plants": len(PLANTS), "source_systems": len(SOURCE_SYSTEMS),
        "payment_terms_defined": len(PAYMENT_TERMS),
    },
    "notes": [
        "Row-per-invoice fact table; all KPIs/widgets/tables derive from invoices.json.",
        "Patterns are planted: Pareto spend concentration, payment-behaviour clusters, term fragmentation.",
        "'(No Value)' rows: some invoices have null category and/or null payment_term_code.",
        "Open invoices have paid_date=null and paid_days=null and are excluded from Average Paid Days.",
    ],
}

files = []
files.append(dump("payment_terms.json", pub_terms))
files.append(dump("global_ultimates.json", pub_gus))
files.append(dump("suppliers.json", SUPPLIERS))
files.append(dump("categories.json", CATEGORIES))
files.append(dump("plants.json", pub_plants))
files.append(dump("source_systems.json", pub_src))
files.append(dump("metadata.json", metadata))
files.append(dump("invoices.json", invoices))


# --------------------------------------------------------------------------------------
# Profile (printed + saved) so the dataset can be sanity-checked before building the UI
# --------------------------------------------------------------------------------------
def money(x): return f"${x:,.0f}"

total_spend = sum(i["amount"] for i in invoices)
paid = [i for i in invoices if i["is_paid"]]
unpaid = [i for i in invoices if not i["is_paid"]]
avg_paid_days = sum(i["paid_days"] for i in paid) / len(paid)

# distinct terms actually used (excluding null)
terms_used = {i["payment_term_code"] for i in invoices if i["payment_term_code"]}

# KPI: distinct payment terms & avg paid days (dashboard header)
# Pareto: top-10 GU spend share
gu_spend = Counter()
for i in invoices:
    gu_spend[i["global_ultimate_name"]] += i["amount"]
top10 = gu_spend.most_common(10)
top10_share = sum(v for _, v in top10) / total_spend

# widget 4: invoices per term (Pareto)
term_inv = Counter(i["payment_term_code"] for i in invoices if i["payment_term_code"])
top_terms = term_inv.most_common(8)

# widget 3: avg paid days per term (for the biggest terms) vs nominal
term_paiddays = defaultdict(list)
for i in paid:
    if i["payment_term_code"]:
        term_paiddays[i["payment_term_code"]].append(i["paid_days"])

# widget 1: distinct terms per category
cat_terms = defaultdict(set)
for i in invoices:
    if i["category_code"] and i["payment_term_code"]:
        cat_terms[i["category_code"]].add(i["payment_term_code"])
cat_term_counts = sorted(((len(v), CAT_BY_CODE[c]["name"]) for c, v in cat_terms.items()), reverse=True)

# widget 2 / table: distinct terms per GU (fragmentation)
gu_terms = defaultdict(set)
for i in invoices:
    if i["payment_term_code"]:
        gu_terms[i["global_ultimate_name"]].add(i["payment_term_code"])
gu_term_counts = sorted(((len(v), n) for n, v in gu_terms.items()), reverse=True)

# supplier payment behaviour: avg (paid_days - nominal_days) per GU over paid invoices
gu_gap = defaultdict(list)
for i in paid:
    if i["payment_term_code"] and i["nominal_days"] is not None:
        gu_gap[i["global_ultimate_name"]].append(i["paid_days"] - i["nominal_days"])
gu_gap_avg = sorted(((sum(v) / len(v), n, len(v)) for n, v in gu_gap.items() if len(v) >= 20),
                    reverse=True)

no_val_cat  = sum(1 for i in invoices if i["category_code"] is None)
no_val_term = sum(1 for i in invoices if i["payment_term_code"] is None)

lines = []
def p(s=""): lines.append(s)

p("=" * 74)
p("  MOCK DATA PROFILE — Spend Assessment: Payment Terms")
p("=" * 74)
p(f"Window                 : {START} -> {END}  (last 12 completed months)")
p(f"Invoices               : {len(invoices):,}")
p(f"Total Spend            : {money(total_spend)}  (target {money(TARGET_TOTAL)})")
p(f"Global-ultimate suppliers : {len(GLOBAL_ULTIMATES)}   |  legal entities: {len(SUPPLIERS)}")
p(f"Categories / Plants / Sources : {len(CATEGORIES)} / {len(PLANTS)} / {len(SOURCE_SYSTEMS)}")
p("")
p("KPI ribbon (what the dashboard header will show):")
p(f"  • Payment Terms (distinct, used)   : {len(terms_used)}   (of {len(PAYMENT_TERMS)} defined)")
p(f"  • Average Number of Paid Days      : {avg_paid_days:.1f}")
p(f"  • Open (unpaid) invoices           : {len(unpaid):,}  ({len(unpaid)/len(invoices)*100:.1f}%)  [excluded from Avg Paid Days]")
p("")
p(f"Pareto check — top 10 GU spend share : {top10_share*100:.1f}%  (target ~75-80%)")
for name, val in top10[:5]:
    p(f"    {name:<42} {money(val):>16}")
p("")
p("Widget 3 — Avg Paid Days vs Nominal (biggest terms; the gap is the story):")
p(f"    {'term':<12}{'nominal':>9}{'avg_paid':>10}{'gap':>8}{'invoices':>10}")
for code, cnt in top_terms:
    nd = TERM_BY_CODE[code]["nominal_days"]
    ap = sum(term_paiddays[code]) / len(term_paiddays[code]) if term_paiddays[code] else 0
    p(f"    {code:<12}{nd:>9}{ap:>10.1f}{ap-nd:>+8.1f}{cnt:>10,}")
p("")
p("Widget 4 — invoice count concentrated on few terms (Pareto):")
for code, cnt in top_terms:
    p(f"    {code:<12}{cnt:>8,}  ({cnt/len(invoices)*100:4.1f}%)")
p("")
p("Widget 1 — distinct terms per category (fragmentation spread):")
p(f"    most fragmented : {cat_term_counts[0][0]} terms  ({cat_term_counts[0][1]})")
p(f"    median          : {cat_term_counts[len(cat_term_counts)//2][0]} terms")
p(f"    least           : {cat_term_counts[-1][0]} terms  ({cat_term_counts[-1][1]})")
p("")
p("Widget 2 / table — most term-fragmented suppliers (governance red flags):")
for cnt, name in gu_term_counts[:5]:
    p(f"    {name:<42} {cnt:>2} distinct terms")
p("")
p("Payment behaviour — avg (paid − nominal) days per supplier (the real drama):")
p("    latest payers (late-fee / relationship risk):")
for gap, name, n in gu_gap_avg[:3]:
    p(f"      {name:<40} {gap:>+6.1f} days over terms  (n={n})")
p("    earliest payers (wasted working capital):")
for gap, name, n in gu_gap_avg[-3:]:
    p(f"      {name:<40} {gap:>+6.1f} days vs terms  (n={n})")
p("")
p(f"'(No Value)' rows — null category: {no_val_cat:,}  |  null payment term: {no_val_term:,}")
p("")
p("Files written:")
total_bytes = 0
for path, size in files:
    total_bytes += size
    p(f"    {os.path.basename(path):<24} {size/1024:8.1f} KB")
p(f"    {'TOTAL':<24} {total_bytes/1024/1024:8.2f} MB")
p("=" * 74)

report = "\n".join(lines)
print(report)
with open(os.path.join(OUTDIR, "PROFILE.txt"), "w") as f:
    f.write(report + "\n")
