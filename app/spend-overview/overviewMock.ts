export interface MonthlySpend {
  month: string;
  totalSpend: number;
  poSpend: number;
  nonPoSpend: number;
}

export interface SpendOverviewData {
  totalSpendYtd: number;
  totalSpendPriorYtd: number;
  currency: string;
  monthlyTrend: MonthlySpend[];
}

export const overviewMock: SpendOverviewData = {
  totalSpendYtd: 184_500_000,
  totalSpendPriorYtd: 171_200_000,
  currency: "USD",
  monthlyTrend: [
    { month: "Jan", totalSpend: 14_200_000, poSpend: 11_100_000, nonPoSpend: 3_100_000 },
    { month: "Feb", totalSpend: 15_050_000, poSpend: 11_800_000, nonPoSpend: 3_250_000 },
    { month: "Mar", totalSpend: 16_300_000, poSpend: 12_950_000, nonPoSpend: 3_350_000 },
    { month: "Apr", totalSpend: 15_780_000, poSpend: 12_500_000, nonPoSpend: 3_280_000 },
    { month: "May", totalSpend: 16_900_000, poSpend: 13_400_000, nonPoSpend: 3_500_000 },
    { month: "Jun", totalSpend: 17_450_000, poSpend: 13_900_000, nonPoSpend: 3_550_000 },
  ],
};
