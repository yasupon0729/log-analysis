"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { syncAiModelJson } from "./actions";

interface SyncButtonProps {
  modelName: string;
}

export function SyncButton({ modelName }: SyncButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    results?: Record<string, { success: boolean; message: string }>;
  } | null>(null);

  const handleSync = () => {
    setResult(null);
    startTransition(async () => {
      const res = await syncAiModelJson(modelName);
      setResult(res);
    });
  };

  if (result?.success) {
    return <span style={{ color: "green", fontSize: "0.9em" }}>{result.message}</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleSync}
          isLoading={isPending}
        >
          生成・送信
        </Button>
      </div>
      {result && !result.success && (
        <div style={{ fontSize: "0.8em", color: "red" }}>
          <p>{result.message}</p>
          {result.results && (
            <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0 0" }}>
              {Object.entries(result.results).map(([target, res]) => (
                !res.success && (
                  <li key={target}>
                    {target}: {res.message}
                  </li>
                )
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}