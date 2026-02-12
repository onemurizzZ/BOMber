export type ConversionStatus = "converted" | "already_bom" | "error";

export type ConversionErrorCode =
  | "FILE_TOO_LARGE"
  | "NON_TEXT_OR_INVALID_UTF8"
  | "READ_ERROR";

export interface ConversionResult {
  fileName: string;
  status: ConversionStatus;
  originalSize: number;
  outputSize?: number;
  errorCode?: ConversionErrorCode;
  message?: string;
}

export interface BatchConversionResult {
  results: ConversionResult[];
  zipBlob?: Blob;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}
