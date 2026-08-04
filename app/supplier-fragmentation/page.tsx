import type { Metadata } from "next";
import { FragmentationDashboard } from "./components/FragmentationDashboard";

export const metadata: Metadata = {
  title: "Supplier Fragmentation — Spend Assessment",
  description:
    "HHI-based supplier fragmentation analysis: where too many suppliers do the same thing, and where to consolidate.",
};

export default function SupplierFragmentationPage() {
  return <FragmentationDashboard />;
}
