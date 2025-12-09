# ColumnDef 型不整合エラー

## エラー内容
`src/app/system-logs/page-client.tsx` で以下のTypeScriptエラーが発生しました。

```
Type '((AccessorKeyColumnDefBase<NormalizedLogEntry, string> & Partial<IdIdentifier<NormalizedLogEntry, string>>) | ...)' is not assignable to type 'ColumnDef<NormalizedLogEntry, unknown>[]'.
```

**原因:** `createColumnHelper` を使用して作成されたカラム定義の配列は、TypeScriptによって非常に厳密な型（例: `AccessorKeyColumnDefBase<NormalizedLogEntry, string>`）として推論されます。一方、汎用的な `TanstackTable` コンポーネントは、より緩やかな `ColumnDef<T, unknown>[]` 型を期待しているため、型の互換性がなくエラーとなります。

## 解決方法
`TanstackTable` コンポーネントに渡す前に、カラム定義の配列を `ColumnDef<NormalizedLogEntry, any>[]` にキャストします。

```typescript
const columns = useMemo(() => [
  // ... カラム定義
] as ColumnDef<NormalizedLogEntry, any>[], []);
```

`columnHelper` を使用する場合、このように明示的なキャストを行うのが一般的で実用的な解決策です。
