"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { syncAiModelJson } from "./actions";

interface SyncButtonProps {
  modelName: string;
}

export function SyncButton({ modelName }: SyncButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSync = () => {
    setResult(null);
    startTransition(async () => {
      const res = await syncAiModelJson(modelName);
      setResult(res);
      if (res.success) {
        // 成功したら数秒後にメッセージを消すなどしてもよい
      }
    });
  };

  if (result?.success) {
    return <span style={{ color: "green", fontSize: "0.9em" }}>同期完了</span>;
  }

  return (
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
      {result && !result.success && (
        <span style={{ color: "red", fontSize: "0.8em" }}>{result.message}</span>
      )}
    </div>
  );
}
