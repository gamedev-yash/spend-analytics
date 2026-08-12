import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { DatasetsProvider } from "@/context/DatasetsContext";
import { ThresholdsProvider } from "@/context/ThresholdsContext";
import { DashboardActiveFiltersProvider } from "@/context/DashboardActiveFiltersContext";
import { ExportCaptureProvider } from "@/context/ExportCaptureContext";
import { DashboardAssistant } from "@/components/ai-assistant/DashboardAssistant";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Procurement Analytics",
  description: "Enterprise procurement analytics platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="h-full font-sans antialiased transition-colors duration-200 ease-in-out">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <DatasetsProvider>
            <ThresholdsProvider>
              <DashboardActiveFiltersProvider>
                <ExportCaptureProvider>
                  <DashboardShell>{children}</DashboardShell>
                  <DashboardAssistant />
                </ExportCaptureProvider>
              </DashboardActiveFiltersProvider>
            </ThresholdsProvider>
          </DatasetsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
