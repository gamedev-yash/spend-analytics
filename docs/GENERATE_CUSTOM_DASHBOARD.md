# Generate Custom Dashboard — How It Actually Works

A beginner-friendly walkthrough of the **Generate Custom Dashboard** feature as
it exists in this codebase today.

> **Who this is for:** anyone who understands the product idea but not the code.
> No prior knowledge of this repo's architecture is assumed. Every technical
> term is explained the first time it appears.
>
> **Scope:** this document describes the code as it is *right now*. Where the
> code doesn't make something explicit, this document says so rather than
> guessing. Section 12 is the only forward-looking section, and it is clearly
> marked as such.
>
> **Related:** [`ARCHITECTURE.md`](ARCHITECTURE.md) covers the six *fixed*
> dashboards (Spend Overview, Payment Terms, and so on). This document covers
> only the *generated* dashboards feature, which is deliberately separate from
> them. Note that `ARCHITECTURE.md`'s Appendix B describes this pipeline as
> CSV-upload-only — that was accurate before the data-source picker was added,
> and this document supersedes it.

---

## Table of contents

1. [What we just built](#1-what-we-just-built)
2. [The complete user flow](#2-the-complete-user-flow)
3. [What happens when I click "Generate Custom Dashboard"?](#3-what-happens-when-i-click-generate-custom-dashboard)
4. [Spend Analytics Data flow](#4-spend-analytics-data-flow)
5. [CSV upload flow](#5-csv-upload-flow)
6. [Dimensions and measures](#6-dimensions-and-measures)
7. [How a dashboard is actually created](#7-how-a-dashboard-is-actually-created)
8. [What is real vs mocked](#8-what-is-real-vs-mocked)
9. [Important files](#9-important-files)
10. [Data flow in code](#10-data-flow-in-code)
11. [One complete example](#11-one-complete-example)
12. [What will change later when real data exists](#12-what-will-change-later-when-real-data-exists)
13. [Glossary](#13-glossary)

---

# 1. What We Just Built

## The problem

The app has six **fixed dashboards** — Spend Overview, Compliance, Payment
Terms, Tail Spend, Supplier Fragmentation, Single Source Risk. Each one was
designed and coded by hand. If you want to look at the data a different way,
you can't: someone has to build a new page.

**Generate Custom Dashboard** is the escape hatch. You describe what data you
care about, and the app builds a dashboard for it automatically.

## What it did before

Before this change, clicking **Generate Custom Dashboard** did exactly one
thing: it opened a file picker and asked you to upload a CSV file from your
computer.

That had two problems:

1. **The company's own spend data had no way in.** The app is *full* of
   procurement data — suppliers, categories, purchase orders, invoices — but
   the generate feature couldn't touch any of it. You'd have to export a CSV
   and re-upload it, which is absurd.
2. **You couldn't see or control which columns were used.** You handed over a
   file, and a dashboard came back. What it decided to chart was a black box.

## What it does now

Clicking **Generate Custom Dashboard** now opens a **choice screen** with two
options:

### Option 1 — Spend Analytics Data

> *Use existing platform spend data to create a custom dashboard.*

Pick one of five procurement tables the app already ships with (Purchase
Orders, Supplier Invoices, Vendor Payments, Vendor Annual Spend, Vendor
Contracts). No file needed.

### Option 2 — Upload CSV

> *Bring your own dataset and build a dashboard from its columns.*

Drag a CSV file in (or click to browse). Works with any CSV, on any subject —
it doesn't have to be procurement data at all.

## And then, for both options: a field picker

Whichever option you choose, you land on the **same** configuration screen. It
shows you every column in the data, sorted into groups you can actually reason
about:

- **Measures** — numbers (Spend, Quantity, PO Count)
- **Dimensions** — categories (Supplier, Category, Plant)
- **Time** — dates (PO Date)
- **Other columns** — IDs and free text, collapsed by default

You tick the ones you want, see a preview of the actual rows, and click
**Generate**.

> **The key design decision:** both options share one configuration screen and
> one generation pipeline. The *only* thing that differs between them is where
> the rows come from. Everything after that — profiling, planning, charting,
> saving — is literally the same code. This is why the two options can't drift
> apart or behave inconsistently.

---

# 2. The Complete User Flow

```text
                Generate Custom Dashboard
                  (button in the sidebar)
                            │
                            ▼
                   ┌─────────────────┐
                   │ Choose Data     │   step = "source"
                   │ Source          │
                   └────────┬────────┘
                     ↙             ↘
        ┌──────────────────┐   ┌──────────────────┐
        │ Spend Analytics  │   │ Upload CSV       │   step = "upload"
        │ Data             │   │ (drag & drop)    │
        └────────┬─────────┘   └────────┬─────────┘
                 │                      │
      fetch rows from the app  │  parse the file in
      (GET /api/spend-datasets)│  the browser (PapaParse)
                 │                      │
                 └──────────┬───────────┘
                            ▼
                   ┌─────────────────┐
                   │ Field selection │   step = "configure"
                   │ + row preview   │
                   └────────┬────────┘
                            │  click "Generate"
                            ▼
                   ┌─────────────────┐
                   │ Dashboard       │   Claude plans the charts
                   │ generation      │
                   └────────┬────────┘
                            ▼
                   ┌─────────────────┐
                   │ Generated       │   /generated/[id]
                   │ Dashboard       │
                   └─────────────────┘
```

## Explaining each box

### Box 1 — Choose Data Source

A modal (a pop-up window that sits over the page) with two cards. Clicking a
card decides which branch you take. Nothing has loaded yet.

### Box 2a — Spend Analytics Data

There is **no separate "pick a table" screen**. Clicking this card takes you
straight to the configuration screen with **Purchase Orders** already selected
and loading. A dropdown at the top of that screen lets you switch tables.

Why merged? Because the table choice is one dropdown, and making someone click
through a whole extra screen for one dropdown is friction with no payoff.

### Box 2b — Upload CSV

A drag-and-drop area. Drop a file (or click **Browse files**). The file is read
**inside your browser** — it is never uploaded to a server.

### Box 3 — Field selection

The shared configuration screen. Shows the columns grouped into Measures /
Dimensions / Time / Other, with sensible ones already ticked, plus a preview
table of the first five rows.

### Box 4 — Dashboard generation

Clicking **Generate** starts a four-stage process with a progress panel:

1. **Profiling the fields you picked** — computing statistics about your columns
2. **Planning the dashboard** — an AI call that decides *what story the data can tell*
3. **Designing the widgets** — a second AI call that turns that story into specific charts
4. **Checking it against your columns** — validating that every chart actually works

### Box 5 — Generated Dashboard

You land on a new page at `/generated/<some-id>` showing the finished charts.
The dashboard is saved in your browser and appears in the sidebar list.

---

# 3. What Happens When I Click "Generate Custom Dashboard"?

Here is the actual chain of code, using real file and component names.

```text
Sidebar button
  components/layout/sidebar.tsx  (line ~309)
        │
        │  renders  <GenerateDashboardButton variant="nav" />
        ▼
GenerateDashboardButton
  components/generated-dashboard/generate-dashboard-dialog.tsx
        │
        │  this is the "shell": it owns the modal, its width and its title
        │  React state: open, busy, step
        ▼
Dialog.Popup   (from the @base-ui/react library)
        │
        │  renders  {open && <GenerateDashboardFlow ... />}
        ▼
GenerateDashboardFlow
  (same file — this is the "brain": it owns every step of the flow)
        │
        │  React state: step, sourceKind, spendDatasetId, loaded,
        │               selected, loading, loadError, busy, stage
        ▼
step === "source"  →  <DataSourceStep />
  components/generated-dashboard/data-source-step.tsx
```

## What "component" means

A **component** is a reusable piece of user interface, written as a function
that returns what should appear on screen. `GenerateDashboardButton` is a
component. So is `DataSourceStep`. Components can contain other components,
which is how the whole screen gets assembled.

## Why there are two components, not one

`GenerateDashboardButton` (the shell) and `GenerateDashboardFlow` (the brain)
are split deliberately:

- The **shell** needs to know which step you're on, but only to decide how wide
  the modal should be and what the title says. The configuration screen needs
  more room (`50rem`) than the source picker (`38rem`).
- The **brain** owns all the real state — which file you picked, which rows
  loaded, which fields are ticked.

The brain tells the shell which step it's on via a callback called
`onStepChange`. Information flows **one way**: the shell never tells the brain
what to do. This means the brain's own state can never get out of sync with a
step change coming from somewhere else.

## The `open &&` trick

Look at this line in the shell:

```tsx
{open && <GenerateDashboardFlow ... />}
```

This means the flow component only exists while the modal is open. When you
close the modal, React destroys it completely — and with it, every piece of
state inside. When you re-open, a brand-new one is created, starting fresh at
`step = "source"` with no file, no selection, no errors. This is why you never
see leftovers from a previous attempt.

---

# 4. Spend Analytics Data Flow

## Step 1 — You click the card

`DataSourceStep` calls `onSelect("spend")`, which runs `chooseSource("spend")`
inside `GenerateDashboardFlow`:

```tsx
function chooseSource(kind: GeneratedDashboardSourceKind) {
  setSourceKind(kind);
  setLoadError(null);
  if (kind === "csv") {
    goTo("upload");
    return;
  }
  goTo("configure");
  void loadSpendDataset(spendDatasetId);   // spendDatasetId starts as "fact_po_items"
}
```

So two things happen at once: the screen switches to `"configure"`, and a fetch
for the default table begins.

## Step 2 — Where the list of tables comes from

The five tables are a **hand-written list** in
`lib/generated-dashboard/spend-sources.ts`:

```ts
export const SPEND_SOURCES: SpendSource[] = [
  {
    id: "fact_po_items",
    label: "Purchase Orders",
    description: "One row per PO line — committed spend, quantities and contract coverage.",
    highlights: ["Supplier", "Category", "Plant", "PO Date", "Net Order Value", "Quantity"],
  },
  { id: "fact_invoices",     label: "Supplier Invoices",   /* ... */ },
  { id: "fact_payments",     label: "Vendor Payments",     /* ... */ },
  { id: "agg_vendor_annual", label: "Vendor Annual Spend", /* ... */ },
  { id: "dim_contract",      label: "Vendor Contracts",    /* ... */ },
];
```

**Why hand-written?** The app has an internal catalogue of tables in
`lib/server/metadata-registry.ts`, but it lists *seven*, and two of them
(`dim_material`, `dim_payment_terms`) are configuration lookups — lists of
material codes and payment-term definitions. There's no spend to total and no
trend to plot, so offering them would only produce disappointing dashboards.
This file is the curated subset, plus the plain-English descriptions the
technical registry doesn't carry.

This same file is also the **allowlist** — the server route rejects any table
id not in it.

## Step 3 — Fetching the rows

`loadSpendDataset(datasetId)` calls:

```
GET /api/spend-datasets?datasetId=fact_po_items
```

That endpoint lives at `app/api/spend-datasets/route.ts`. It does three things:

1. Checks the id against `SPEND_SOURCES` (rejects anything else with a `400`).
2. Calls `getSampleDataset(id)` from `lib/server/sample-data-source.ts`.
3. Cuts the rows down to at most 4,000 and returns them as JSON.

### What `getSampleDataset` gives you

This is the app's existing, shared way of reading its bundled data. It reads
the CSV files in `public/sample-data/` and **denormalizes** them — meaning it
joins in the human-readable names that live in separate files.

The raw `fact_po_items.csv` has a `vendor_id` column full of codes like
`V000123`. `getSampleDataset` looks each one up in `dim_vendor.csv` and adds
`vendor_name: "Tata Steel BSL Ltd"`. Same for categories, plants and payment
terms. So what arrives in the browser is already readable.

> This is not a new mechanism invented for this feature. Three existing
> dashboards (Payment Terms, Single Source Risk, Supplier Fragmentation) each
> have their own `api/master/route.ts` doing exactly this. Our route follows
> the same established pattern.

### Why rows are sampled to 4,000

This is the most important technical constraint in the whole feature.

A finished dashboard is saved in **localStorage** — a small storage area the
browser gives each website, usually capped around 5–10 megabytes. And a saved
dashboard includes **its own copy of the rows**, so it can redraw its charts
without re-fetching anything.

`fact_po_items` has **50,000 rows**. Saving all of them would blow past the
storage limit, and `lib/generated-dashboard/store.ts` would respond by deleting
your older dashboards one at a time trying to make room.

So the route takes an evenly-spaced sample:

```ts
function strideSample<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const stride = rows.length / max;
  const sampled: T[] = [];
  for (let i = 0; i < max; i++) sampled.push(rows[Math.floor(i * stride)]);
  return sampled;
}
```

**Why evenly-spaced and not just "the first 4,000"?** Taking the first 4,000
rows of a date-ordered file would give you only the first few weeks of data —
your trend chart would cover January and stop. Taking every 12th row keeps the
whole time range. Measured against the real file, the 4,000-row sample still
covers all 36 months, all 13 top-level categories, and 351 of the 385 suppliers.

The UI states this plainly rather than hiding it:

> *4,000 rows · 24 columns · an even sample of this table's 50,000 rows, so a
> dashboard stays small enough to store*

Three of the five tables are under 4,000 rows anyway (Vendor Annual Spend has
1,076, Vendor Contracts has 200), so they are returned complete and no message
appears.

## Step 4 — Where dimensions and measures come from

**This is the part most people expect to be hand-written, and isn't.**

There is no list anywhere in the code saying "Supplier is a dimension, Spend is
a measure." Instead, the browser looks at the actual data and works it out.

`loadSpendDataset` calls `buildDatasetProfile(rows)` from
`lib/ai/profile/build-profile.ts`. This function walks every column and every
row and produces a **profile** — a statistical description of the data. For each
column it works out:

- What type of thing is in it (numbers? dates? text?)
- How many distinct values it has
- How many are empty
- For numbers: min, max, average, median, total
- For dates: earliest, latest, how regularly spaced
- For categories: the ten most common values

From those statistics it assigns each column a **role**:

| Role | Rule (simplified) | Example |
|---|---|---|
| `temporal` | The values parse as dates | `po_date` |
| `identifier` | Named like an ID (`_id`, `_code`, `_key`, `_number`), or nearly every value is unique | `po_number` |
| `measure` | The values are numbers | `net_order_value_inr` |
| `dimension` | Text, with between 2 and 200 distinct values | `category_l1_name` |
| `text` | Text that didn't fit the dimension rule | long descriptions |
| `constant` | Every row has the same value | — |

It then ranks the best candidates in each role — that ranked list is what drives
the default tick marks.

### Turning the profile into the picker

`describeFields(profile)` in `lib/generated-dashboard/fields.ts` converts the
profile into what the screen shows:

```ts
export interface FieldOption {
  name: string;         // "net_order_value_inr"
  group: FieldGroup;    // "measure" | "dimension" | "temporal" | "other"
  detail: string;       // "5K – 188Cr · totals 2.1KCr"
  recommended: boolean; // was it in the profile's ranked candidates?
}
```

The `detail` line is written by `describeColumn()`, which picks a phrasing
based on what the column contains:

```text
net_order_value_inr   →  "5K – 188Cr · totals 2.1KCr"
po_date               →  "2023-01-01 → 2025-12-31 · day grain"
category_l1_name      →  "13 values · MRO & Spares, Packaging, Services…"
po_number             →  "Looks like a key · 3,499 distinct values"
```

### One deliberate exception you should know about

There is exactly one place where the display **disagrees** with the profile.

`build-profile` caps the `dimension` role at 200 distinct values, because past
that a column stops being a sensible default to group a chart by. On Purchase
Orders there are **351 suppliers** — so `vendor_name` gets the `text` role and
would land in the collapsed "Other columns" group.

That would bury *Supplier*, the single field a procurement dashboard is most
likely to be about, where nobody would look for it.

So `groupFor()` in `fields.ts` makes one adjustment:

```ts
function groupFor(col: ColumnProfile): FieldGroup {
  if (col.role === "text" && col.categorical) return "dimension";
  return GROUP_BY_ROLE[col.role] ?? "other";
}
```

A text column that still has category-like statistics is **listed** under
Dimensions — but `recommended` still comes straight from the profile, so it
stays **unticked**. The field is findable; the default selection is unchanged.
Nothing about the profiling logic itself was touched.

This behaviour is locked in by tests in
`tests/generated-dashboard-fields.test.ts`.

## Step 5 — What state stores your selections

Two pieces of React state inside `GenerateDashboardFlow`:

```tsx
const [loaded, setLoaded] = useState<LoadedSource | null>(null);
const [selected, setSelected] = useState<string[]>([]);
```

**`loaded`** holds everything about the data source:

```ts
interface LoadedSource {
  kind: "csv" | "spend";
  label: string;                        // "Purchase Orders" or "my-file.csv"
  rows: Record<string, unknown>[];      // the actual data
  profile: DatasetProfile;              // the statistics
  fields: FieldOption[];                // what the picker shows
  totalRows?: number;                   // set only when sampled
}
```

**`selected`** is just an array of column names:

```ts
["category_l1_name", "vendor_name", "po_date", "net_order_value_inr"]
```

Both are set together by `applyLoaded()`, so the fields and the default ticks
can never disagree:

```tsx
function applyLoaded(next: Omit<LoadedSource, "fields">) {
  const fields = describeFields(next.profile);
  setLoaded({ ...next, fields });
  setSelected(defaultFieldSelection(fields));
}
```

Ticking a checkbox calls `FieldSelection`'s `toggle()`, which rebuilds the array
**in column order** (not click order), so the saved dashboard's columns come out
in the same order as the source.

### Guarding against a stale response

If you switch tables quickly, an earlier, slower fetch could finish *after* a
later one and overwrite it with the wrong data. `loadToken` (a `useRef`, a value
that survives re-renders without causing one) prevents this:

```tsx
const token = ++loadToken.current;
// ... await the fetch ...
if (token !== loadToken.current) return;   // a newer load started — discard this one
```

## Step 6 — What happens when you click Generate

`generate()` runs. It hands everything to one shared function:

```tsx
const dashboard = await generateDashboard({
  rows: loaded.rows,          // all 4,000 rows, all columns
  fields: selected,           // just the ticked column names
  sourceLabel: loaded.label,  // "Purchase Orders"
  sourceKind: loaded.kind,    // "spend"
  onStage: setStage,          // so the progress panel can update
});
```

`generateDashboard` lives in `lib/generated-dashboard/generate.ts` and is
**identical for both data sources**. Here is what it does.

### 6a. Narrow the data, then re-profile it

```ts
onStage("profile");
const projected = projectRows(rows, fields);
const profile = buildDatasetProfile(projected);
```

`projectRows` throws away every column you didn't tick. This is what keeps the
dashboard small enough to save — Purchase Orders drops from about 2.5 MB to
about 1.8 MB with the default selection, and much less if you tick fewer fields.

Note it **re-profiles** rather than filtering the earlier profile. That matters:
the candidate rankings are relative to which columns exist, so a profile
describing columns that were removed would have the AI planning charts over data
it will never receive.

### 6b. Ask Claude to plan the dashboard

```ts
onStage("plan");
const response = await fetch("/api/generate-dashboard", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ profile, sourceFileName: sourceLabel }),
});
```

**Only the profile is sent. The rows never leave your browser.** The AI sees
statistics — "this column holds values from 5,000 to 1.88 billion, totalling
21 billion, and its top values are these" — never actual records.

The endpoint at `app/api/generate-dashboard/route.ts` makes **two** AI calls:

**Call 1 — the analyst.** System prompt: `lib/ai/skills/dashboard-planning.md`.
Produces a `DashboardPlan` — a written plan with a title, the business domain,
what one row represents, and a list of **sections** each with a heading and a
reason it matters. No charts yet, just the story.

**Call 2 — the charting engineer.** System prompt:
`lib/ai/skills/widget-planning.md`. Receives the profile *and* Call 1's plan.
Produces `WidgetSpec[]` — concrete chart specifications. This prompt carries
strict rules: never draw two different measures on two different y-axes (it
invents correlations that aren't real), cap donut charts at 6 slices, never use
a line chart for unordered categories, use only column names that literally
appear in the profile.

Both calls use the Anthropic SDK's structured-output mode, so the reply is
guaranteed to match a JSON schema (`lib/ai/schemas/plan-schema.ts` and
`widget-schema.ts`) rather than free text someone has to parse.

> The progress panel shows "Planning" and "Designing the widgets" as separate
> stages, but both happen inside that single POST, which reports nothing until
> both finish. The panel steps from one to the other on a 35-second timer
> (`PLAN_STAGE_MS`), which is an estimate, **not** a real signal. This is why
> the panel deliberately shows a moving bar rather than a percentage — a
> percentage would be inventing precision the request can't provide. The file's
> own comments say exactly this.

### 6c. Validate what came back

```ts
const validatedWidgets = validateWidgets(payload.widgets ?? [], profile);
```

`lib/generated-dashboard/validate.ts` never trusts the AI's output. For every
proposed chart it checks that each referenced column actually exists. It
tolerates small drift — `"Site Name"`, `"site_name"` and `" SiteName "` all
resolve to the same real column — and repairs out-of-range values (a donut
asking for 20 slices gets clamped to 6). Anything it can't make work is
**dropped**, not rendered broken.

If *nothing* survives, the whole thing throws an error you can read.

### 6d. Split into "show now" and "available later"

```ts
const { initial, library } = splitInitialWidgets(payload.plan, validatedWidgets);
```

The AI is asked to plan generously — often 15–20 widgets. Showing all of them
would be overwhelming. `lib/generated-dashboard/select-initial.ts` splits them:

- Every KPI tile goes on screen (up to 6)
- Charts flagged `essential` go on screen (4 to 6 of them)
- Everything else goes to a **library** — reachable later through the
  **Add Widget** button, at no extra AI cost since the specs already exist

It also spreads the chosen charts across sections round-robin, so the opening
screen shows the plan's structure instead of six charts from one section.

### 6e. Save it

```ts
return createGeneratedDashboard({
  title: payload.plan.title,
  sourceFileName: sourceLabel,
  sourceKind,                  // "spend" or "csv"
  profile, plan: payload.plan,
  widgets: initial, library,
  rows: projected,             // the narrowed rows
  columns: fields,
});
```

`lib/generated-dashboard/store.ts` writes the whole thing to localStorage under
the key `app_generated_dashboards` and gives it a unique id.

## Step 7 — Rendering

Back in the dialog:

```tsx
onDone();                                  // close the modal
router.push(`/generated/${dashboard.id}`); // navigate to the new page
```

`app/generated/[id]/page.tsx` reads the saved dashboard back out of
localStorage and hands it to `DashboardGrid`, which lays out the sections and
renders each widget through `GeneratedWidget`. See [§7](#7-how-a-dashboard-is-actually-created).

---

# 5. CSV Upload Flow

Same destination, different first mile.

## Step 1 — Choosing the file

`chooseSource("csv")` moves you to `step = "upload"`, which renders
`CsvDropzone` (`components/generated-dashboard/csv-dropzone.tsx`).

It supports both drag-and-drop and click-to-browse. The drag handling has one
small trick worth knowing:

```tsx
<div className="pointer-events-none ...">
```

The contents of the drop zone ignore the mouse entirely. Without this, dragging
across the icon would fire a "you left the zone" event and the highlight would
flicker on and off.

The dropzone itself is **presentational** — it just hands the parent a `File`
object. It does no validation and no parsing. That's deliberate: the same checks
must apply whether you dropped the file or browsed for it, and the parent is the
only place that sees both paths.

## Step 2 — Parsing

`loadCsvFile(file)` in `GenerateDashboardFlow` runs the checks, then parses:

```tsx
if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
  setLoadError(`"${file.name}" isn't a CSV. Pick a .csv file instead.`);
  return;
}
const rows = await parseCsvFile(file);
```

`parseCsvFile` (`lib/generated-dashboard/parse-csv.ts`) wraps **PapaParse**, a
well-known CSV-reading library:

```ts
Papa.parse(file, {
  header: true,                    // first row = column names
  dynamicTyping: true,             // "123" becomes the number 123
  skipEmptyLines: "greedy",        // ignore blank lines
  transformHeader: (h) => h.trim() // " Supplier " becomes "Supplier"
});
```

It rejects with a readable error if the file has no data rows or if the
separator can't be detected.

**This all happens in your browser.** The file is never sent anywhere.

## Step 3 — Column detection

Exactly the same function as the spend path:

```tsx
const profile = buildDatasetProfile(rows);
applyLoaded({ kind: "csv", label: file.name, rows, profile });
goTo("configure");
```

`buildDatasetProfile` has no idea whether it's looking at procurement data or a
list of pizza orders. It reads the values and classifies from what it finds.
This is why both branches can share one picker.

For performance on large files, it classifies types from the first 2,000 rows
(`SAMPLE_CAP`) but counts distinct values across every row.

## Step 4 — How columns are represented

Identically to the spend path: `FieldOption[]`, produced by `describeFields()`.
There is **no separate CSV representation**. A parsed CSV and a fetched spend
table become the same shape as soon as they're profiled — which is the whole
reason the shared configuration screen works.

## Steps 5–7 — Selection, generation, rendering

**Byte-for-byte the same code as the spend path.** `FieldSelection`,
`checkFieldSelection`, `generateDashboard` — none of them know or care which
branch the data came from. The only difference is `sourceKind: "csv"`, which
only affects the small badge shown on the finished dashboard.

## Actually implemented vs simulated

| Part | Status |
|---|---|
| Drag-and-drop | **Real** — standard browser drag events |
| File-type check | **Real** — extension and MIME type |
| CSV parsing | **Real** — PapaParse, a production library |
| Column type detection | **Real** — statistical analysis in `build-profile.ts` |
| Preview table | **Real** — actual parsed rows, first 5, first 6 selected columns |
| Field selection | **Real** — really does narrow what gets used |
| Dashboard generation | **Real** — a genuine AI API call |
| Chart rendering | **Real** — Recharts, computing from your actual rows |

**Nothing in the CSV path is simulated.** The one thing to be aware of is the
`PLAN_STAGE_MS` timer in the progress panel — the *stage labels* advance on an
estimate because the underlying request reports nothing mid-flight. The work
itself is entirely real; only the visual pacing between stages 2 and 3 is
guessed.

---

# 6. Dimensions and Measures

These two words appear everywhere in this feature. Here is what they mean.

## Dimension — how you slice the data

A **dimension** is a field used to **split data into groups**. Dimensions are
usually text, and you'd naturally use them to finish the sentence *"…broken down
by ___"*.

```text
Supplier          →  "spend broken down by supplier"
Category          →  "spend broken down by category"
Business Unit     →  "spend broken down by business unit"
Month             →  "spend broken down by month"
```

On a chart, a dimension is almost always the **axis with the labels**.

## Measure — what you actually count

A **measure** is a **number you add up, average, or otherwise calculate**. It
finishes the sentence *"total ___"*.

```text
Spend             →  "total spend"
Quantity          →  "total quantity"
PO Count          →  "how many purchase orders"
Invoice Amount    →  "total invoice amount"
```

On a chart, a measure is the **axis with the numbers**, or the length of the bar.

## The simplest test

> Would you ever add two of these together?
>
> - Two spend amounts? **Yes** → measure
> - Two supplier names? **No** → dimension

## Putting them together

```text
Supplier + Category + Spend

Supplier   = how we group        (dimension)
Category   = how we group again  (dimension)
Spend      = the number          (measure)
```

Read as a sentence: *"total **spend**, broken down by **supplier**, and broken
down again by **category**."*

## How this becomes a chart

Start with rows:

```text
Supplier | Category | Spend
---------|----------|-------
Tata     | Steel    |   100
Tata     | Copper   |    50
Ashok    | Steel    |    80
Ashok    | Steel    |    20
```

Group by the dimension `Supplier`, and add up the measure `Spend` within each
group:

```text
Tata   → 100 + 50 = 150
Ashok  →  80 + 20 = 100
```

Draw it:

```text
Tata   ████████████████  150
Ashok  ███████████       100
```

Bring in the second dimension `Category`, and each bar splits into segments:

```text
Tata   ███████████[Steel 100]█████[Copper 50]
Ashok  ██████████████[Steel 100]
```

That's a **stacked bar chart** — `kind: "stackedBar"` in this codebase.

## Where this happens in our code

The grouping-and-adding-up is `computeWidgetSeries()` in
`lib/generated-dashboard/compute.ts`. It's pure arithmetic — no React, no
network — which is what makes it easy to reason about and reuse.

It groups by `widget.dimension`, and if that column holds dates it buckets them
by calendar month (`"2025-03"`) rather than by exact day, so a three-year daily
trend stays readable.

## A crucial clarification

**In this implementation, ticking "Supplier" and "Spend" does not directly
create a chart.**

Your selection decides **which columns Claude is allowed to see**. Claude then
decides which charts to build from them. So:

```text
You tick:   Supplier, Category, PO Date, Spend
                        ↓
Claude receives:  statistics about exactly those four columns
                        ↓
Claude decides:   "Total Spend" KPI
                  "Spend by Supplier" — bar chart, top 10
                  "Spend by Category" — donut chart
                  "Monthly Spend Trend" — line chart
                  "Spend by Supplier and Category" — stacked bar
                  ...and ~12 more, parked in the library
```

You control the **ingredients**; the AI writes the **recipe**. If you want
precise control over each individual chart, that isn't what this feature does —
though you can add and remove widgets afterwards from the library.

---

# 7. How a Dashboard Is Actually Created

Three different things get confused with each other constantly. Keeping them
apart makes the whole feature easy to follow.

## The three layers

### 1. Data — the actual rows and numbers

```text
vendor_name | category_l1_name | net_order_value_inr
------------|------------------|--------------------
Tata Steel  | Raw Materials    |             6074838
Tata Steel  | Raw Materials    |              950618
Ashok Bear. | MRO & Spares     |             3916545
```

In our code: `GeneratedDashboard.rows`, a plain array of JavaScript objects.

### 2. Dashboard specification — the *instructions*

Not a chart. A **description** of a chart, as data:

```json
{
  "id": "w-spend-by-supplier",
  "sectionId": "sec-suppliers",
  "title": "Top Suppliers by Spend",
  "kind": "bar",
  "dimension": "vendor_name",
  "series": {
    "type": "measures",
    "items": [{ "column": "net_order_value_inr", "aggregation": "sum", "label": "Spend" }]
  },
  "sort": "value-desc",
  "limit": 10,
  "colSpan": 6,
  "formatHint": "currency",
  "essential": true
}
```

In our code: the `WidgetSpec` type in `types/generated-dashboard.ts`. This is
what Claude produces — **it never produces charts, only these descriptions.**

Read in plain English: *"Draw a bar chart called 'Top Suppliers by Spend'.
Group by `vendor_name`. Add up `net_order_value_inr`. Sort biggest first, show
the top 10. Take up half the page width. Format numbers as currency. This one
matters enough to show immediately."*

### 3. Rendered dashboard — the pixels

The actual bars on screen, drawn by Recharts.

## How the three connect

```text
DATA                          rows: Record<string, unknown>[]
  │
  │   computeWidgetSeries(widget, rows)
  │   lib/generated-dashboard/compute.ts
  ▼
SERIES POINTS                 [{ label: "Tata Steel", value: 7025456, count: 2,
                                 breakdown: [{ key: "Spend", value: 7025456 }] }, ...]
  │
  │   GeneratedWidget reads widget.kind and picks a renderer
  │   components/generated-dashboard/generated-widget.tsx
  ▼
RENDERED CHART                <BarChart> from Recharts
```

## Worked example

```text
Data
↓
Supplier | Category | Spend
A        | Steel    | 100
A        | Copper   |  50
B        | Steel    |  80
↓
Dashboard specification (WidgetSpec)
{ kind: "bar", dimension: "Supplier",
  series: { type: "measures",
            items: [{ column: "Spend", aggregation: "sum", label: "Spend" }] },
  sort: "value-desc" }
↓
computeWidgetSeries() groups and sums
[ { label: "A", value: 150, count: 2, breakdown: [{ key: "Spend", value: 150 }] },
  { label: "B", value:  80, count: 1, breakdown: [{ key: "Spend", value:  80 }] } ]
↓
Rendered chart
A  ████████████████  150
B  █████████          80
```

## Why the separation matters

Because the specification is **just data**, four useful things follow:

1. **It can be saved.** The dashboard survives a page refresh, and redrawing
   costs no AI call.
2. **It can be checked.** `validateWidgets` inspects and repairs it before
   anything renders.
3. **It can be filtered.** The page filters the *rows* and re-runs
   `computeWidgetSeries` — the specification never changes.
4. **The library is free.** Widgets parked in `library` are already fully
   specified; adding one is moving an object between two arrays.

## Which renderer draws what

`GeneratedWidget` is a single `switch` on `widget.kind`:

| `kind` | Renderer | What you see |
|---|---|---|
| `kpi` | `KpiWidget` | A single big number |
| `bar`, `groupedBar` | `BarLikeWidget` | Bars side by side |
| `stackedBar` | `BarLikeWidget` (stacked) | Bars split into segments |
| `stackedBarWithTotalLine` | `BarLikeWidget` (stacked + line) | Stacked bars with a total line |
| `pareto` | `ParetoWidget` | Bars plus a cumulative-% line |
| `line`, `area`, `stackedArea` | `LineLikeWidget` | Trend over time |
| `donut` | `DonutWidget` | Ring chart |
| `heatmap` | `HeatmapWidget` | Coloured grid |
| `waterfall` | `WaterfallWidget` | Step-up/step-down bars |
| `table` | `TableWidget` | A data table |

One nice touch in `BarLikeWidget`: if there are more than 5 bars or any label is
longer than 10 characters, it flips to **horizontal** bars automatically, since
long labels don't fit under a vertical axis.

---

# 8. What Is Real vs Mocked

Every row below was checked against the actual code and the actual `.env` file.

| Part | Current status | Explanation |
|---|---|---|
| **SAP integration** | **Does not exist** | There is no SAP connection anywhere in this repo. No SAP BTP, no Integration Suite, no extractors. The `fact_*` / `dim_*` naming *imitates* SAP's shape, but the data is a generated sample extract. |
| **Azure SQL database** | **Supported, not configured** | The code to query a real Azure SQL warehouse is fully written (`lib/server/query-builder.ts`, `query-engine.ts`, `sql-client.ts`, `db/schema.sql`). It activates when `AZURE_SQL_READONLY_CONNECTION_STRING` is set. **It is not set in `.env`**, so nothing queries a database today. Note this feature wouldn't use it anyway — see the limitation below. |
| **ETL pipeline** | **Script exists, not run** | `scripts/seed-azure-sql.ts` (`npm run seed:sql`) loads the CSVs into a star schema. Only run intentionally against a real database; not part of normal development. |
| **Spend data itself** | **Real data, sample-sized** | The rows are genuine, internally consistent procurement records in `public/sample-data/*.csv` — 50,000 PO lines, 45,000 invoices, 45,000 payments, 800 vendors, three years. Real joins, real totals. It is **sample data, not live data**: it never changes and doesn't come from a production system. |
| **The spend rows endpoint** | **Fully real** | `GET /api/spend-datasets` genuinely reads the CSVs through `getSampleDataset()` and returns real rows. Verified live: `fact_po_items` returns 4,000 rows of 24 real columns. |
| **Row sampling** | **Real, and deliberate** | 4,000-row cap is a real constraint driven by localStorage, not a placeholder. Stated in the UI. |
| **CSV upload** | **Fully real** | PapaParse, in the browser. Any valid CSV works. |
| **Column type detection** | **Fully real** | `build-profile.ts` computes genuine statistics — types, cardinality, quantiles, date ranges, top values. ~650 lines of real analysis. |
| **Dimension/measure classification** | **Fully real** | Derived from those statistics by rule. No hardcoded field list anywhere. |
| **Field selection** | **Fully real** | Unticking a column genuinely removes it from what's profiled, sent, stored and charted. |
| **Dashboard generation (AI)** | **Fully real** | Two genuine API calls to Claude. `.env` has a working **Azure AI Foundry** deployment configured (endpoint + key + model). Not stubbed, not canned. |
| **Widget validation** | **Fully real** | `validate.ts` really does resolve column names and drop unrenderable widgets. |
| **Dashboard rendering** | **Fully real** | Recharts, computing from your actual rows via `compute.ts`. |
| **Dashboard persistence** | **Real, browser-only** | localStorage under `app_generated_dashboards`. **Not** a server database — see the limitation below. |
| **Filtering on the generated page** | **Fully real** | Plain in-memory filtering of the stored rows (`app/generated/[id]/filters.ts`). |
| **Add Widget catalogue** | **Fully real** | Widgets Claude planned but parked. Adding one costs no AI call. |
| **Progress panel stage timing** | **Partly estimated** | The work is real; the step from "Planning" to "Designing widgets" is a 35-second timer, because the single POST reports nothing until it finishes. Deliberately shows no percentage. |

## The short version

> **Almost nothing in this feature is mocked.** The AI is real, the parsing is
> real, the charts are real, the spend data is real (just sample-sized rather
> than live).
>
> What's absent is the **upstream data pipeline** — SAP, the Integration Suite,
> ETL, and a live warehouse. The app reads a fixed CSV extract instead of a
> system of record that updates.

---

# 9. Important Files

## New in this feature

| File | What it does |
|---|---|
| `lib/generated-dashboard/spend-sources.ts` | The curated list of five spend tables offered, with product descriptions. Also the allowlist the server route validates against. |
| `app/api/spend-datasets/route.ts` | `GET` endpoint returning real spend rows via `getSampleDataset()`, stride-sampled to 4,000. |
| `lib/generated-dashboard/fields.ts` | Turns a profile into the picker's model (`describeFields`), picks defaults (`defaultFieldSelection`), narrows rows (`projectRows`), enforces the minimum (`checkFieldSelection`). |
| `lib/generated-dashboard/generate.ts` | The shared pipeline both sources run: project → profile → AI call → validate → split → save. Also defines `GenerationStage`. |
| `lib/generated-dashboard/parse-csv.ts` | PapaParse wrapper with readable error messages. |
| `components/generated-dashboard/data-source-step.tsx` | The two-card choice screen. |
| `components/generated-dashboard/csv-dropzone.tsx` | Drag-and-drop file picker. Presentational only. |
| `components/generated-dashboard/field-selection.tsx` | The dimension/measure picker (`FieldSelection`) and the row preview (`DataPreview`). |
| `tests/generated-dashboard-fields.test.ts` | 14 tests covering grouping, defaults, validation and projection. |

## Changed by this feature

| File | What changed |
|---|---|
| `components/generated-dashboard/generate-dashboard-dialog.tsx` | Rewritten from a single upload form into a three-step flow. Holds `GenerateDashboardButton` (shell) and `GenerateDashboardFlow` (brain). |
| `components/generated-dashboard/generation-progress.tsx` | Dropped the "Reading your CSV" stage, which now happens earlier with its own spinner. |
| `types/generated-dashboard.ts` | Added `GeneratedDashboardSourceKind` and the optional `sourceKind` field. |
| `lib/generated-dashboard/store.ts` | Accepts and stores `sourceKind`, defaulting to `"csv"` for older records. |
| `app/generated/[id]/page.tsx` | Shows a small badge — "Spend Analytics Data" or "Uploaded CSV". |

## Existing files this feature builds on

| File | What it does |
|---|---|
| `components/layout/sidebar.tsx` | Renders the entry-point button and the list of saved dashboards. |
| `lib/ai/profile/build-profile.ts` | **The heart of column detection.** Computes statistics and assigns roles. |
| `lib/ai/profile/render-profile.ts` | Renders a profile into the compact text block the AI actually reads. |
| `app/api/generate-dashboard/route.ts` | The two-call Claude pipeline. |
| `lib/ai/skills/dashboard-planning.md` | System prompt for call 1 (the narrative plan). |
| `lib/ai/skills/widget-planning.md` | System prompt for call 2 (the chart specs), including the chart-quality rules. |
| `lib/ai/schemas/plan-schema.ts`, `widget-schema.ts` | JSON schemas forcing well-formed AI output. |
| `lib/generated-dashboard/validate.ts` | Resolves column references, repairs drift, drops unrenderable widgets. |
| `lib/generated-dashboard/select-initial.ts` | Splits widgets into the opening screen and the Add Widget library. |
| `lib/generated-dashboard/store.ts` | localStorage persistence, with quota handling. |
| `lib/generated-dashboard/compute.ts` | **Pure aggregation** — turns a spec plus rows into chart-ready numbers. |
| `components/generated-dashboard/dashboard-grid.tsx` | Lays out sections and the 12-column responsive grid. |
| `components/generated-dashboard/generated-widget.tsx` | Renders one widget. The `switch` on `kind` lives here. |
| `components/generated-dashboard/add-widget-sheet.tsx` | Browse and add library widgets, with live preview. |
| `app/generated/[id]/page.tsx` | The generated dashboard page. |
| `app/generated/[id]/filters.ts` | In-memory filtering of stored rows. |
| `lib/server/sample-data-source.ts` | Reads and denormalizes the bundled CSVs. Server-only. |
| `lib/server/metadata-registry.ts` | The app's catalogue of tables and columns. Our `spend-sources.ts` ids must exist here. |
| `types/generated-dashboard.ts` | `WidgetSpec`, `DashboardPlan`, `GeneratedDashboard`. |
| `types/dataset-profile.ts` | `DatasetProfile`, `ColumnProfile`, `ColumnRole`. |

---

# 10. Data Flow in Code

Real names, in order.

```text
┌─ SPEND BRANCH ────────────────────────────────────────────────┐
│                                                               │
│  chooseSource("spend")                                        │
│      ↓                                                        │
│  loadSpendDataset(spendDatasetId)          // "fact_po_items" │
│      ↓                                                        │
│  GET /api/spend-datasets?datasetId=...                        │
│      ↓                                                        │
│  getSampleDataset(id)                      // server-side     │
│      ↓                                                        │
│  strideSample(rows, MAX_ROWS)              // 4,000           │
│      ↓                                                        │
│  { rows, totalRows, sampled }                                 │
└───────────────────────────────┬───────────────────────────────┘
                                │
┌─ CSV BRANCH ──────────────────┼───────────────────────────────┐
│                               │                               │
│  chooseSource("csv")          │                               │
│      ↓                        │                               │
│  CsvDropzone → onFile(file)   │                               │
│      ↓                        │                               │
│  loadCsvFile(file)            │                               │
│      ↓                        │                               │
│  parseCsvFile(file)           │  // PapaParse, in-browser     │
│      ↓                        │                               │
│  rows                         │                               │
└───────────────────────────────┼───────────────────────────────┘
                                │
                     ┌──────────┴──────────┐
                     │   BOTH BRANCHES     │
                     └──────────┬──────────┘
                                ▼
              buildDatasetProfile(rows)         → profile: DatasetProfile
                                ▼
              applyLoaded({ kind, label, rows, profile })
                                ▼
              ┌───────────────────────────────────────┐
              │ describeFields(profile)  → fields     │
              │ defaultFieldSelection(fields)         │
              └───────────────────┬───────────────────┘
                                  ▼
              STATE:  loaded: LoadedSource | null
                      selected: string[]
                                  ▼
              FieldSelection → onChange(next) → setSelected(next)
                                  ▼
              checkFieldSelection(loaded.fields, selected)
                      → status: { error, hint }        // gates the button
                                  ▼
              [ user clicks Generate ]  →  generate()
                                  ▼
              generateDashboard({ rows, fields, sourceLabel, sourceKind, onStage })
                                  │
                                  ├─ onStage("profile")
                                  ├─ projectRows(rows, fields)      → projected
                                  ├─ buildDatasetProfile(projected) → profile
                                  │
                                  ├─ onStage("plan")
                                  ├─ POST /api/generate-dashboard { profile, sourceFileName }
                                  │     ├─ renderDatasetProfile(profile)   → text
                                  │     ├─ CALL 1 → plan:    DashboardPlan
                                  │     └─ CALL 2 → widgets: WidgetSpec[]
                                  │
                                  ├─ onStage("finalize")
                                  ├─ validateWidgets(widgets, profile)  → validatedWidgets
                                  ├─ splitInitialWidgets(plan, validatedWidgets)
                                  │        → { initial, library }
                                  │
                                  └─ createGeneratedDashboard({...})
                                         → localStorage["app_generated_dashboards"]
                                         → returns GeneratedDashboard
                                  ▼
              router.push(`/generated/${dashboard.id}`)
                                  ▼
              useGeneratedDashboard(id)          // reads it back
                                  ▼
              applyGeneratedDashboardFilters(rows, filters, dateColumn)
                      → filteredRows
                                  ▼
              <DashboardGrid plan widgets rows={filteredRows} />
                                  ▼
              <GeneratedWidget widget rows />
                                  ▼
              computeWidgetSeries(widget, rows)  → SeriesPoint[]
                                  ▼
              Recharts  <BarChart> / <LineChart> / <PieChart> / …
```

## The state variables, all in one place

Inside `GenerateDashboardFlow`:

| Variable | Type | Purpose |
|---|---|---|
| `step` | `"source" \| "upload" \| "configure"` | Which screen is showing |
| `sourceKind` | `"csv" \| "spend" \| null` | Which branch you took |
| `spendDatasetId` | `string` | Which spend table (default `"fact_po_items"`) |
| `loaded` | `LoadedSource \| null` | Rows, profile and fields once loaded |
| `selected` | `string[]` | Ticked column names, in column order |
| `loading` | `boolean` | A fetch or parse is running |
| `loadingLabel` | `string` | What's loading, for the spinner text |
| `loadError` | `string \| null` | Loading failed |
| `busy` | `boolean` | Generation is running (locks the modal shut) |
| `stage` | `GenerationStage` | Which of the four stages |
| `generateError` | `string \| null` | Generation failed |
| `loadToken` | `useRef<number>` | Discards stale responses |

Inside `GenerateDashboardButton`:

| Variable | Purpose |
|---|---|
| `open` | Is the modal open |
| `busy` | Mirrored up, to block closing mid-generation |
| `step` | Mirrored up, to size and title the modal |

---

# 11. One Complete Example

**Goal: a dashboard showing total spend by supplier and category.**

### 1. Click "Generate Custom Dashboard"

`GenerateDashboardButton`'s `handleOpenChange(true)` sets `open = true` and
resets `step = "source"`. The modal renders at `38rem` wide, titled *"Generate
custom dashboard"*. `GenerateDashboardFlow` mounts fresh.

### 2. Click "Spend Analytics Data"

`DataSourceStep` calls `onSelect("spend")` → `chooseSource("spend")`:

- `setSourceKind("spend")`
- `goTo("configure")` — modal widens to `50rem`, title becomes *"Choose the fields to build from"*
- `loadSpendDataset("fact_po_items")` starts

You see: *"Loading Purchase Orders…"* with a spinner.

### 3. Rows arrive and get profiled

`GET /api/spend-datasets?datasetId=fact_po_items` returns 4,000 rows of 24
columns (sampled from 50,000). Then `buildDatasetProfile(rows)` runs, and
`applyLoaded` fills in `loaded` and `selected`.

The screen now shows:

```text
[Database icon] [Purchase Orders ▾]  One row per PO line — committed spend...
4,000 rows · 24 columns · an even sample of this table's 50,000 rows,
so a dashboard stays small enough to store

MEASURES  7 of 7 selected                                 [Clear]
Numbers to total or average — spend, counts, quantities.
  ☑ net_order_value_inr    5K – 188Cr · totals 2.1KCr
  ☑ po_quantity            1.7 – 5K · totals 99.3L
  ☑ unit_price             0 – 21L · totals 1.4Cr
  ☑ vendor_is_active       0 – 1 · totals 3.8K
  ☑ is_contract_backed     0 – 1 · totals 1.2K
  ☑ po_item                10 – 60 · totals 1.1L
  ☑ net_order_value_doc    55.6 – 188Cr · totals 1.8KCr

DIMENSIONS  9 of 10 selected                              [Select all]
Categories to break those numbers down by — supplier, category, plant.
  ☐ vendor_name            351 values · Tata Steel BSL Ltd, Ashok Bearings…
  ☑ parent_company_name    31 values · Group 002, Group 012, Group 004…
  ☑ category_l1_name       13 values · MRO & Spares, Packaging, Services…
  ☑ category_l2_name       75 values · Bearings, Valves & Fittings…
  ☑ plant_name             7 values · Cairn Oil & Gas (Barmer)…
  ☑ region                 6 values · Rajasthan, Tamil Nadu, Maharashtra…
  … and 4 more

TIME  1 of 1 selected
  ☑ po_date                2023-01-01 → 2025-12-31 · day grain

▸ Other columns (6)

Preview  first 5 rows · 6 of 17 selected columns
┌──────────────────┬─────────────────┬──────────┬─────────────────────┐
│ parent_company…  │ category_l1_na… │ region   │ net_order_value_inr │
├──────────────────┼─────────────────┼──────────┼─────────────────────┤
│ Group 002        │ MRO & Spares    │ Rajasthan│ 6074838             │
│ …                                                                   │
└──────────────────┴─────────────────┴──────────┴─────────────────────┘
```

Note `vendor_name` sits under **Dimensions** but is **unticked** — the exception
described in [§4](#4-spend-analytics-data-flow).

### 4. Tick "Supplier"

Click the `vendor_name` checkbox. `FieldSelection`'s `toggle("vendor_name")`
runs, rebuilding the array in column order and calling `setSelected(...)`.

To keep this example focused, also untick the noise: `po_item`,
`vendor_is_active`, `is_contract_backed`, `net_order_value_doc`, `unit_price`.

### 5. Final selection

```text
selected = [
  "vendor_name",           // dimension — Supplier
  "category_l1_name",      // dimension — Category
  "po_date",               // temporal  — Time
  "net_order_value_inr",   // measure   — Spend
  "po_quantity",           // measure   — Quantity
]
```

`checkFieldSelection` runs on every change:

- Is anything selected? Yes.
- Are there measure fields, and is at least one ticked? Yes.
- Is at least one dimension or time field ticked? Yes.

→ `{ error: null, hint: null }`. The **Generate** button is enabled.

### 6. Click Generate

`generate()` sets `busy = true` (the modal can no longer be closed) and
`stage = "profile"`. The field list is replaced by the progress panel.

`generateDashboard({ rows, fields: selected, sourceLabel: "Purchase Orders", sourceKind: "spend", onStage: setStage })`

### 7. Profile stage

`projectRows(rows, selected)` narrows 4,000 rows from 24 columns to 5:

```js
// before
{ vendor_id: "V000123", vendor_name: "Tata Steel BSL Ltd", parent_company_name: "Group 002",
  vendor_country: "IN", /* …20 more… */ }

// after
{ vendor_name: "Tata Steel BSL Ltd", category_l1_name: "Raw Materials",
  po_date: "2024-03-14", net_order_value_inr: 6074838, po_quantity: 120 }
```

`buildDatasetProfile(projected)` then re-profiles those five columns.

### 8. Plan stage

`POST /api/generate-dashboard`, body `{ profile, sourceFileName: "Purchase Orders" }`.
`renderDatasetProfile` turns the profile into text like:

```text
DATASET: rows=4000, columns=5, sampled=true, truncated=false
COLUMNS:
- vendor_name [text] | null=0.0% | distinct=351 (8.8%) | top-values: Tata Steel BSL Ltd (0.9%), …
- category_l1_name [dimension] | distinct=13 (0.3%) | top-values: MRO & Spares (18.2%), …
- po_date [temporal] | span=2023-01-01..2025-12-31 (1095d) | granularity=day | periods=1095
- net_order_value_inr [measure] | range=[5000..1884000000] | mean=… | sum=… | p95=…
- po_quantity [measure] | range=[1.7..5000] | …
CANDIDATE COLUMNS (ranked, most relevant first):
measures: net_order_value_inr, po_quantity
dimensions: category_l1_name
temporal: po_date
```

**Call 1** returns a plan — perhaps titled *"Procurement Spend Analysis"*, with
sections like *"Spend Overview"*, *"Supplier Concentration"*, *"Category
Breakdown"*, *"Spend Over Time"*.

After 35 seconds the panel steps to "Designing the widgets" (the timer, not a
real signal). **Call 2** returns roughly 15–20 `WidgetSpec` objects.

### 9. Finalize stage

`validateWidgets` checks each spec's columns against the profile and drops
anything unresolvable. `splitInitialWidgets` then divides them:

- KPI tiles → shown (up to 6)
- Essential charts → shown (4–6), spread across sections
- The rest → `library`

`createGeneratedDashboard` saves everything to localStorage and returns a record
with a fresh id.

### 10. Dashboard appears

```tsx
onDone();                                   // modal closes
router.push(`/generated/${dashboard.id}`);
```

`app/generated/[id]/page.tsx` reads it back and renders:

```text
Procurement Spend Analysis   [Spend Analytics Data]
Generated from Purchase Orders · 4,000 rows · 14 Aug 2026, 3:42 pm
                                       [+ Add Widget 12] [Delete Dashboard]

Spend Overview
┌────────────┬────────────┬────────────┬────────────┐
│ Total      │ Suppliers  │ Categories │ Avg PO     │
│ ₹2.1K Cr   │ 351        │ 13         │ ₹52.3 L    │
└────────────┴────────────┴────────────┴────────────┘

Supplier Concentration
┌───────────────────────────┬───────────────────────────┐
│ Top 10 Suppliers by Spend │ Supplier Pareto (80/20)   │
│ Tata Steel   ████████ 180 │      ╱‾‾‾‾‾‾‾‾            │
│ Ashok Bear.  ██████   140 │    ╱                      │
└───────────────────────────┴───────────────────────────┘

Category Breakdown
┌───────────────────────────┬───────────────────────────┐
│ Spend by Category (donut) │ Spend: Supplier × Category│
└───────────────────────────┴───────────────────────────┘

Spend Over Time
┌───────────────────────────────────────────────────────┐
│ Monthly Spend Trend            ╱╲    ╱╲               │
└───────────────────────────────────────────────────────┘
```

Each chart drew its numbers by calling `computeWidgetSeries(widget, rows)` on
the stored rows. The sidebar now lists the dashboard, and the filter bar offers
dropdowns for up to three dimension columns plus a date range.

> The exact titles, sections and chart choices vary between runs — the AI is not
> deterministic. The *pipeline* is fixed; the specific dashboard it plans is not.

---

# 12. What Will Change Later When Real Data Exists

> **This section is explanatory only. Nothing here is implemented, and this
> document does not propose implementing it.**

## Current state

```text
public/sample-data/*.csv          (a fixed extract, committed to the repo)
        ↓
getSampleDataset()                (server-side, denormalizes and caches)
        ↓
GET /api/spend-datasets           (stride-sampled to 4,000 rows)
        ↓
Browser: profile → field selection
        ↓
POST /api/generate-dashboard      → Claude (Azure AI Foundry)
        ↓
localStorage                      (the dashboard, rows included)
        ↓
Rendered dashboard
```

## The eventual system

```text
SAP (ECC / S/4HANA)
        ↓
SAP BTP Integration Suite
        ↓
Azure SQL — staging tables
        ↓
Transformation / cleansing / classification
        ↓
Azure SQL — star schema
        ↓
Query API
        ↓
Browser: profile → field selection
        ↓
Dashboard
```

## What stays and what changes

| Layer | Fate |
|---|---|
| `data-source-step.tsx` | **Unchanged.** The choice screen doesn't know where data comes from. |
| `csv-dropzone.tsx`, `parse-csv.ts` | **Unchanged.** User uploads stay browser-side regardless. |
| `build-profile.ts` | **Unchanged.** Works on any array of rows. |
| `fields.ts` (grouping, defaults, projection, validation) | **Unchanged.** Operates on a profile, not a data source. |
| `field-selection.tsx` | **Unchanged.** |
| `generate.ts` | **Unchanged.** Takes rows and field names. |
| `/api/generate-dashboard` | **Unchanged.** Only ever sees a profile. |
| `validate.ts`, `select-initial.ts`, `compute.ts` | **Unchanged.** Pure functions over specs and rows. |
| `generated-widget.tsx`, `dashboard-grid.tsx` | **Unchanged.** |
| `/api/spend-datasets` | **This is the seam.** Swap `getSampleDataset()` for a warehouse query. Its response shape (`{ rows, totalRows, sampled }`) stays the same. |
| `spend-sources.ts` | **Grows.** More tables as the warehouse grows. Could become dynamic. |
| Row sampling | **Needs rethinking.** Stride-sampling 4,000 rows out of millions gets statistically thin, and the localStorage limit doesn't move. Likely answer: push aggregation server-side rather than shipping rows. |
| `store.ts` (localStorage) | **Likely replaced.** See the limitation below. |

**In short: one file is the seam.** Everything downstream of
`/api/spend-datasets` is source-agnostic already, because both branches were
built to converge on a plain array of row objects.

## About the diagram in the brief

The forward architecture sketched in the request mentions **FastAPI**. This
repo has no Python and no FastAPI — its API layer is **Next.js route handlers**
(`app/api/*/route.ts`), and the existing warehouse query path
(`/api/v1/query` → `lib/server/query-builder.ts` → `lib/server/sql-client.ts`)
is already written in TypeScript against Azure SQL. Whether a separate Python
service eventually fronts the warehouse is a decision the codebase doesn't
record. **The current implementation does not make this explicit.**

## Known architectural limitations

These are worth knowing now, not discovering later.

**1. Generated dashboards are per-browser and cannot be shared.**
They live in localStorage. Sending someone a `/generated/abc-123` link shows
them *"Dashboard not found"* — the page says so explicitly. Clearing site data
deletes them. Sharing requires server-side persistence.

**2. Storage is capped, and the cap is close.**
localStorage is roughly 5–10 MB. One Purchase Orders dashboard is ~1.8 MB. So
you can hold a handful. `store.ts` handles overflow by deleting the **oldest**
dashboard and retrying — silently, apart from a console warning.

**3. This feature bypasses the app's provider abstraction.**
The six fixed dashboards read through `IDataProvider` (`types/data-provider.ts`)
and honour the `[ CSV | Azure ]` toggle. `/api/spend-datasets` calls
`getSampleDataset()` directly instead. That's deliberate — the generator needs
row-level data, and `queryWidgetData()` returns grouped aggregates capped at
1,000 rows — and it matches what three existing dashboards already do with
their `api/master` routes. But it does mean **the toggle has no effect on this
feature**, and pointing it at a real warehouse means changing this route, not
flipping a provider.

**4. Field selection controls the ingredients, not the charts.**
Ticking Supplier and Spend doesn't guarantee a "Spend by Supplier" chart. It
guarantees Claude *can* build one. The same selection can produce different
dashboards on different runs.

**5. Generation requires a working AI key.**
No key or model configured → `/api/generate-dashboard` returns `503` and the
dialog shows the error. There is no offline or fallback mode.

**6. The 4,000-row sample means totals are estimates.**
A KPI reading "Total Spend ₹2.1K Cr" is the total of the *sample*, not the
50,000-row table. Proportions hold up well; absolute totals do not. **The
current UI does not label individual KPI values as sampled** — the row-count
line above the field picker is the only place this is stated, and it isn't
carried onto the generated dashboard.

---

# 13. Glossary

**Dimension** — A field used to split data into groups. Usually text. Examples:
Supplier, Category, Business Unit, Month. On a chart, it's the axis with labels.

**Measure** — A number you calculate or add up. Examples: Spend, Quantity, PO
Count. On a chart, it's the axis with numbers, or the length of the bar.

**Dashboard definition / specification** — Instructions describing what charts
should exist, stored as plain data rather than code. In this codebase, a
`WidgetSpec` (one chart) and a `DashboardPlan` (the narrative structure). This
is what the AI produces — it never produces charts directly.

**Widget** — One item on a dashboard: a chart, a KPI tile, or a table. Every
widget on a generated dashboard comes from a `WidgetSpec`.

**Chart** — The drawn, visual result. Produced by Recharts from a `WidgetSpec`
plus the rows.

**KPI** — Key Performance Indicator. A single headline number with a label, such
as "Total Spend: ₹2.1K Cr". `kind: "kpi"` in this codebase.

**Profile** — A statistical description of a dataset: for each column, its type,
how many distinct values, its range, its most common values. Computed by
`buildDatasetProfile`. **The AI only ever sees this, never your rows.**

**Role** — What `build-profile` decides a column *is*: `measure`, `dimension`,
`temporal` (dates), `identifier` (IDs), `text`, or `constant`.

**Mock data** — Fake data standing in for real data. In this feature the spend
data is better described as **sample data**: genuine, internally consistent
records that simply don't update and don't come from a live system.

**Sample data** — The 10 CSV files in `public/sample-data/`. Real-shaped
procurement records — 50,000 PO lines, 800 vendors, three years — generated for
development.

**State** — Values a component remembers between redraws. Changing state redraws
the screen. In this feature, `selected` is state: tick a box, state changes, the
list redraws.

**Component** — A reusable piece of user interface, written as a function.
`FieldSelection` is a component.

**Props** — Values passed *into* a component from its parent, like function
arguments. `FieldSelection` receives `fields`, `selected` and `onChange` as props.

**Hook** — A React function starting with `use` that gives a component extra
abilities. `useState` remembers a value; `useRef` remembers one without
redrawing; `useEffect` runs code after rendering.

**API** — Application Programming Interface. Here, a URL the browser can call to
get data or trigger work. `/api/spend-datasets` is one.

**Route handler** — The server-side file behind an API URL. In Next.js,
`app/api/spend-datasets/route.ts` handles `/api/spend-datasets`.

**CSV** — Comma-Separated Values. A plain-text table where the first line names
the columns and each following line is a row.

**PapaParse** — The library this app uses to read CSV text into JavaScript
objects.

**localStorage** — A small storage area (usually 5–10 MB) the browser gives each
website. Survives refreshes and restarts. Belongs to one browser on one machine
— nothing is shared with anyone else.

**Projection** — Keeping only some columns and discarding the rest.
`projectRows(rows, columns)` does this.

**Stride sample** — Taking every *n*th row instead of the first *n* rows, so the
sample spans the whole dataset rather than just its beginning.

**Denormalize** — Joining separate reference tables into one wide table so each
row carries readable names instead of codes. `getSampleDataset()` does this,
turning `vendor_id: "V000123"` into `vendor_name: "Tata Steel BSL Ltd"`.

**Staging** — In a data pipeline, the first landing area where raw source data
arrives before being cleaned. **This app has no staging layer today.**

**Star schema** — A warehouse layout with central *fact* tables (the events —
purchase orders, invoices) surrounded by *dimension* tables (the descriptions —
vendors, categories). Facts store short keys; dimensions store the text once.
Named for its diagram shape. `db/schema.sql` defines one; it is not in use.

**ETL** — Extract, Transform, Load. Moving data from a source system, reshaping
it, and loading it into a warehouse. `scripts/seed-azure-sql.ts` is an ETL
script; it isn't part of normal development.

**Aggregation** — Combining many rows into one number: `sum`, `avg`, `count`,
`distinct`, `min`, `max`. Which one a chart uses is set in its `WidgetSpec`.

**Cardinality** — How many distinct values a column has. `category_l1_name` has
13; `vendor_name` has 351. Drives which columns make sensible chart groupings.
