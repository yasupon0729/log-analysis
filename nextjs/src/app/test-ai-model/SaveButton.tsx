"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button"; // 既存のButtonコンポーネントをインポート
import { saveJsonToServer } from "./actions";

interface SaveButtonProps {
  jsonData: unknown;
  fileName: string;
}

export function SaveButton({ jsonData, fileName }: SaveButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = () => {
    setMessage(null);
    const jsonString = JSON.stringify(jsonData, null, 4);

    startTransition(async () => {
      const result = await saveJsonToServer(jsonString, `${fileName}`);
      setMessage(result.message);
    });
  };

  return (
    <div style={{ marginTop: "20px" }}>
      <Button
        type="button"
        onClick={handleSave}
        isLoading={isPending} // isLoading propを使用
        variant="solid" // 適切なvariantを設定 (例: primary)
        size="md" // 適切なsizeを設定 (例: md)
      >
        {isPending ? "保存中..." : "サーバーに保存 (tmp/)"}
      </Button>
      {message && (
        <p style={{ marginTop: "10px", fontSize: "0.9em", color: "#ccc" }}>
          {message}
        </p>
      )}
    </div>
  );
}
