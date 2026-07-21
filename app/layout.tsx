import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ThemeProvider } from "@/components/theme-provider";
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
    <html
      lang="en"
      className={cn("h-full", inter.variable, "font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body className="h-full font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <DashboardShell>{children}</DashboardShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
