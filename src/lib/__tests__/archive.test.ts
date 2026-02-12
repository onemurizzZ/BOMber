import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { buildZip } from "../archive";

describe("buildZip", () => {
  it("渡されたファイルだけをZIPに格納する", async () => {
    const zipBlob = await buildZip([
      { name: "ok.txt", data: new TextEncoder().encode("ok") }
    ]);

    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    const names = Object.keys(zip.files)
      .filter((name) => !zip.files[name].dir)
      .sort();

    expect(names).toEqual(["ok.txt"]);
  });

  it("ファイル名を維持してZIPエントリを作成する", async () => {
    const zipBlob = await buildZip([
      { name: "sample.csv", data: new TextEncoder().encode("a,b\n1,2") },
      { name: "readme.txt", data: new TextEncoder().encode("hello") }
    ]);

    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    const csvContent = await zip.file("sample.csv")?.async("string");
    const txtContent = await zip.file("readme.txt")?.async("string");

    expect(csvContent).toBe("a,b\n1,2");
    expect(txtContent).toBe("hello");
  });
});
