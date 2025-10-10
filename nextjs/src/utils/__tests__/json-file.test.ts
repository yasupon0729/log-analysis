import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JsonFile } from "@/utils/json-file";

const tempRootPromise = mkdtemp(join(tmpdir(), "json-file-test-"));

async function createTempFile(name: string, content: string): Promise<string> {
  const dir = await tempRootPromise;
  const filePath = join(dir, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

describe("JsonFile", () => {
  afterAll(async () => {
    const dir = await tempRootPromise;
    await rm(dir, { recursive: true, force: true });
  });

  it("reads standard JSON", async () => {
    const filePath = await createTempFile(
      "config.json",
      JSON.stringify({ foo: "bar", count: 1 }),
    );

    const jsonFile = new JsonFile(filePath);
    const result = await jsonFile.read<{
      foo: string;
      count: number;
    }>();

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error ?? new Error("JSON read failed");
    }
    expect(result.value).toEqual({ foo: "bar", count: 1 });
  });

  it("parses JSONC content with comments and trailing commas", async () => {
    const content = `{
	// comment line
	"name": "test",
	"list": [
		1,
		2,
	],
	/* block comment */
	"flag": true,
}
`;

    const filePath = await createTempFile("config.jsonc", content);
    const jsonFile = new JsonFile(filePath);
    const result = await jsonFile.read<{
      name: string;
      list: number[];
      flag: boolean;
    }>();

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error ?? new Error("JSONC parse failed");
    }
    expect(result.value).toEqual({
      name: "test",
      list: [1, 2],
      flag: true,
    });
  });

  it("writes JSON with configurable spacing", async () => {
    const filePath = await createTempFile("write.json", "{}");
    const jsonFile = new JsonFile(filePath);
    const writeResult = await jsonFile.write({ answer: 42 }, { spaces: 4 });
    expect(writeResult.success).toBe(true);
    if (!writeResult.success) {
      throw writeResult.error ?? new Error("JSON write failed");
    }

    const readResult = await jsonFile.read<{ answer: number }>();
    expect(readResult.success).toBe(true);
    if (!readResult.success) {
      throw readResult.error ?? new Error("JSON read failed");
    }
    expect(readResult.value).toEqual({ answer: 42 });
  });
});
