// 環境に応じて適切なloggerをエクスポート
export const logger =
  typeof window === "undefined"
    ? require("./server").logger
    : require("./client").logger;
