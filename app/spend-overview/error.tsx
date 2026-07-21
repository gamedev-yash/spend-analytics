"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-[#d03b3b]" />
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load this dashboard</p>
        <p className="text-xs text-muted-foreground">{error.message || "An unexpected error occurred while aggregating the data."}</p>
        <Button size="sm" onClick={reset}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
