import type { ConversionErrorCode, ConversionResult } from "./types";

export const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

interface ConvertBytesOptions {
  fileName: string;
  originalSize?: number;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();

let shiftJisDecoder: TextDecoder | null = null;
try {
  shiftJisDecoder = new TextDecoder("shift_jis", { fatal: true });
} catch {
  shiftJisDecoder = null;
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === UTF8_BOM[0] &&
    bytes[1] === UTF8_BOM[1] &&
    bytes[2] === UTF8_BOM[2]
  );
}

type DetectedEncoding = "utf-8" | "shift_jis";

interface DecodedInputText {
  text: string;
  encoding: DetectedEncoding;
}

function decodeInputText(bytes: Uint8Array): DecodedInputText | null {
  if (bytes.includes(0x00)) {
    return null;
  }

  if (hasUtf8Bom(bytes)) {
    try {
      const text = utf8Decoder.decode(bytes.subarray(UTF8_BOM.byteLength));
      return { text, encoding: "utf-8" };
    } catch {
      return null;
    }
  }

  try {
    const text = utf8Decoder.decode(bytes);
    return { text, encoding: "utf-8" };
  } catch {
    // fall through
  }

  if (shiftJisDecoder) {
    try {
      const text = shiftJisDecoder.decode(bytes);
      return { text, encoding: "shift_jis" };
    } catch {
      return null;
    }
  }

  return null;
}

function buildErrorResult(
  fileName: string,
  originalSize: number,
  errorCode: ConversionErrorCode,
  message: string
): { result: ConversionResult } {
  return {
    result: {
      fileName,
      status: "error",
      originalSize,
      errorCode,
      message
    }
  };
}

export function convertBytesToBom(
  bytes: Uint8Array,
  options: ConvertBytesOptions
): { result: ConversionResult; output?: Uint8Array } {
  const originalSize = options.originalSize ?? bytes.byteLength;

  if (originalSize > MAX_FILE_SIZE_BYTES) {
    return buildErrorResult(
      options.fileName,
      originalSize,
      "FILE_TOO_LARGE",
      "1ファイル20MB以下にしてください。"
    );
  }

  const decoded = decodeInputText(bytes);

  if (!decoded) {
    return buildErrorResult(
      options.fileName,
      originalSize,
      "NON_TEXT_OR_INVALID_UTF8",
      "UTF-8/Shift_JISテキストとして読み取れませんでした。"
    );
  }

  if (hasUtf8Bom(bytes) && decoded.encoding === "utf-8") {
    return {
      result: {
        fileName: options.fileName,
        status: "already_bom",
        originalSize,
        outputSize: originalSize,
        message: "既にUTF-8 BOMが付与されています。"
      },
      output: bytes
    };
  }

  const utf8Bytes =
    decoded.encoding === "utf-8" ? bytes : utf8Encoder.encode(decoded.text);

  const output = new Uint8Array(UTF8_BOM.byteLength + utf8Bytes.byteLength);
  output.set(UTF8_BOM, 0);
  output.set(utf8Bytes, UTF8_BOM.byteLength);

  return {
    result: {
      fileName: options.fileName,
      status: "converted",
      originalSize,
      outputSize: output.byteLength,
      message:
        decoded.encoding === "shift_jis"
          ? "Shift_JISからUTF-8 (BOM付き) に変換しました。"
          : "UTF-8にBOMを付与しました。"
    },
    output
  };
}

export async function convertFileToBom(
  file: File
): Promise<{ result: ConversionResult; output?: Uint8Array }> {
  try {
    const buffer = await file.arrayBuffer();
    return convertBytesToBom(new Uint8Array(buffer), {
      fileName: file.name,
      originalSize: file.size
    });
  } catch {
    return buildErrorResult(
      file.name,
      file.size,
      "READ_ERROR",
      "ファイル読み込みに失敗しました。"
    );
  }
}
