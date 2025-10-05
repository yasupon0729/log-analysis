import { NextResponse } from "next/server";

import { logger } from "@/lib/logger/server";
import { decodeEncryptedLog, ensureLogEncryptionKey } from "@/lib/logs/decoder";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "ファイルが送信されていません" },
        { status: 400 },
      );
    }

    const encodingValue = formData.get("encoding");
    const encoding =
      typeof encodingValue === "string" && Buffer.isEncoding(encodingValue)
        ? (encodingValue as BufferEncoding)
        : "utf8";

    const decompressValue = formData.get("decompress");
    const shouldDecompress =
      decompressValue === null ? true : decompressValue !== "false";

    const overrideValue = formData.get("encryptionKey");
    const key = ensureLogEncryptionKey(
      typeof overrideValue === "string" ? overrideValue : undefined,
    );

    const arrayBuffer = await file.arrayBuffer();
    const encryptedBuffer = Buffer.from(arrayBuffer);
    const decoded = decodeEncryptedLog(encryptedBuffer, {
      key,
      encoding,
      decompress: shouldDecompress,
    });

    logger.info("Log decode completed", {
      component: "decode-route",
      encryptedSize: encryptedBuffer.byteLength,
      decryptedSize: decoded.decryptedBuffer.byteLength,
      logSize: decoded.logBuffer.byteLength,
      didDecompress: decoded.didDecompress,
    });

    return NextResponse.json({
      ok: true,
      encryptedSize: encryptedBuffer.byteLength,
      decryptedSize: decoded.decryptedBuffer.byteLength,
      logSize: decoded.logBuffer.byteLength,
      didDecompress: decoded.didDecompress,
      logText: decoded.logText,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Log decode failed", {
      component: "decode-route",
      error: message,
    });

    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
