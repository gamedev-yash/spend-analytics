"use client";

import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

/**
 * Bound to the `plotly.js-dist-min` build (not the full `plotly.js`) to keep
 * the client bundle smaller — this file is only ever loaded via a
 * `next/dynamic(..., { ssr: false })` import from plotly-chart.tsx, since
 * Plotly touches `document`/`window` and can't run during SSR.
 */
const Plot = createPlotlyComponent(Plotly);

export default Plot;
