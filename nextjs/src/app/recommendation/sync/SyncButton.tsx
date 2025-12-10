"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { SshTarget } from "@/lib/ssh/client";
import { deleteAiModelJson, syncAiModelJson } from "./actions";

interface SyncButtonProps {
  modelName: string;
  target?: SshTarget; // 指定がない場合は全ターゲット対象（一括）
  isExists: boolean; // 存在するかどうか
}

export function SyncButton({ modelName, target, isExists }: SyncButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleAction = () => {
    setResult(null);
    startTransition(async () => {
      // biome-ignore lint/suspicious/noImplicitAnyLet: <>
      let res;
      const targets = target ? [target] : undefined; // undefinedならアクション側でデフォルト(全ターゲット)を使用

      if (isExists) {
        // 存在する場合は削除
        res = await deleteAiModelJson(modelName, targets);
      } else {
        // 存在しない場合は生成・送信
        res = await syncAiModelJson(modelName, targets);
      }

      setResult({ success: res.success, message: res.message });

      // 成功メッセージは数秒で消す
      if (res.success) {
        setTimeout(() => setResult(null), 3000);
      }
    });
  };

  // メッセージ表示 (エラー時または成功直後)
  if (result) {
    if (result.success) {
      // 成功時はアイコンなどで控えめに表示でもよいが、一旦テキストで
      return <span style={{ color: "green", fontSize: "0.8em" }}>完了</span>;
    }
    return (
      <span style={{ color: "red", fontSize: "0.8em" }} title={result.message}>
        エラー
      </span>
    );
  }

  return (
    <Button
      type="button"
      size="sm" // 小さめのボタン
      variant={isExists ? "link" : "outline"} // 存在すれば削除(赤)、なければ送信(青)
      onClick={handleAction}
      isLoading={isPending}
      title={isExists ? "削除する" : "生成して送信する"}
    >
      {isExists ? "削除" : "送信"}
    </Button>
  );
}
