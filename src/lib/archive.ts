import JSZip from "jszip";

import type { ZipEntry } from "./types";

export async function buildZip(files: ZipEntry[]): Promise<Blob> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.data);
  }

  return zip.generateAsync({ type: "blob" });
}
