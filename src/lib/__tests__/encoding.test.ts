import { describe, expect, it } from "vitest";

import { MAX_FILE_SIZE_BYTES, UTF8_BOM, convertBytesToBom } from "../encoding";

describe("convertBytesToBom", () => {
  it("BOMなしUTF-8テキストにBOMを付与する", () => {
    const input = new TextEncoder().encode("hello");
    const { result, output } = convertBytesToBom(input, { fileName: "hello.txt" });

    expect(result.status).toBe("converted");
    expect(result.outputSize).toBe(input.byteLength + UTF8_BOM.byteLength);
    expect(output).toBeDefined();
    expect(output?.subarray(0, 3)).toEqual(UTF8_BOM);
    expect(output?.subarray(3)).toEqual(input);
  });

  it("Shift_JISテキストをUTF-8 BOM付きに変換する", () => {
    const shiftJisHello = new Uint8Array([
      0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd
    ]);

    const { result, output } = convertBytesToBom(shiftJisHello, {
      fileName: "sjis.txt"
    });

    expect(result.status).toBe("converted");
    expect(result.message).toContain("Shift_JIS");
    expect(output).toBeDefined();
    expect(output?.subarray(0, 3)).toEqual(UTF8_BOM);

    const decoded = new TextDecoder("utf-8").decode(output?.subarray(3));
    expect(decoded).toBe("こんにちは");
  });

  it("既にBOMがある場合は内容を変更しない", () => {
    const input = new Uint8Array([...UTF8_BOM, 0x41, 0x42, 0x43]);
    const { result, output } = convertBytesToBom(input, { fileName: "already.csv" });

    expect(result.status).toBe("already_bom");
    expect(result.outputSize).toBe(input.byteLength);
    expect(output).toEqual(input);
  });

  it("NULバイトを含む場合はエラーにする", () => {
    const input = new Uint8Array([0x41, 0x00, 0x42]);
    const { result, output } = convertBytesToBom(input, { fileName: "binary.dat" });

    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("NON_TEXT_OR_INVALID_UTF8");
    expect(output).toBeUndefined();
  });

  it("UTF-8/Shift_JISのどちらでも解釈不能な場合はエラーにする", () => {
    const input = new Uint8Array([0x80]);
    const { result, output } = convertBytesToBom(input, { fileName: "invalid.txt" });

    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("NON_TEXT_OR_INVALID_UTF8");
    expect(output).toBeUndefined();
  });

  it("20MB超過はエラーにする", () => {
    const input = new TextEncoder().encode("a");
    const { result, output } = convertBytesToBom(input, {
      fileName: "too-large.txt",
      originalSize: MAX_FILE_SIZE_BYTES + 1
    });

    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("FILE_TOO_LARGE");
    expect(output).toBeUndefined();
  });
});
