import "./style.css";

import { buildZip } from "./lib/archive";
import { convertFileToBom } from "./lib/encoding";
import { registerBomToolWithBrowserApi } from "./lib/webmcp";
import type {
  BatchConversionResult,
  ConversionResult,
  ConversionStatus,
  ZipEntry
} from "./lib/types";

/* -------------------------------------------------------
   DOM references
   ------------------------------------------------------- */
function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Failed to initialize UI element: ${selector}`);
  }
  return element;
}

const dropZone = requireElement<HTMLLabelElement>("#drop-zone");
const fileInput = requireElement<HTMLInputElement>("#file-input");
const convertButton = requireElement<HTMLButtonElement>("#convert-button");
const selectedFilesList = requireElement<HTMLUListElement>("#selected-files");
const statusText = requireElement<HTMLParagraphElement>("#status-text");
const resultsBody = requireElement<HTMLTableSectionElement>("#results-body");
const webMcpStatus = requireElement<HTMLParagraphElement>("#webmcp-status");
const fuseTrack = requireElement<HTMLDivElement>(".fuse-track");
const fuseFill = requireElement<HTMLDivElement>("#fuse-progress");
const fuseSparkTip = requireElement<HTMLDivElement>("#fuse-spark-tip");
const explosionOverlay = requireElement<HTMLDivElement>("#explosion-overlay");
const fileCountBadge = requireElement<HTMLSpanElement>("#file-count");

/* -------------------------------------------------------
   State
   ------------------------------------------------------- */
let selectedFiles: File[] = [];
let webMcpCleanup: (() => void) | undefined;

/* -------------------------------------------------------
   WebMCP
   ------------------------------------------------------- */
async function initializeWebMcp(): Promise<void> {
  const result = await registerBomToolWithBrowserApi();
  webMcpStatus.textContent = result.message;
  webMcpCleanup = result.cleanup;
}

/* -------------------------------------------------------
   Busy / Fuse progress
   ------------------------------------------------------- */
function setBusy(isBusy: boolean): void {
  convertButton.disabled = isBusy || selectedFiles.length === 0;
  convertButton.classList.toggle("is-converting", isBusy);
  fileInput.disabled = isBusy;
  dropZone.classList.toggle("is-disabled", isBusy);
  fuseTrack.classList.toggle("is-active", isBusy);

  if (!isBusy) {
    fuseFill.style.width = "0%";
    fuseSparkTip.style.left = "0%";
  }
}

function setFuseProgress(ratio: number): void {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  fuseFill.style.width = `${pct}%`;
  fuseSparkTip.style.left = `${pct}%`;
}

/* -------------------------------------------------------
   Explosion effect
   ------------------------------------------------------- */
function triggerExplosion(): void {
  explosionOverlay.classList.remove("is-active");
  // force reflow
  void explosionOverlay.offsetWidth;
  explosionOverlay.classList.add("is-active");

  // Shake the results panel
  const resultsPanel = document.getElementById("results-panel");
  if (resultsPanel) {
    resultsPanel.classList.add("shake");
    resultsPanel.addEventListener("animationend", () => {
      resultsPanel.classList.remove("shake");
    }, { once: true });
  }
}

/* -------------------------------------------------------
   File selection
   ------------------------------------------------------- */
function setSelectedFiles(files: File[]): void {
  selectedFiles = files;
  convertButton.disabled = files.length === 0;
  renderSelectedFiles(files);
  updateFileCount(files.length);
  setStatus(
    files.length > 0
      ? `${files.length} 件のファイルをセット完了。起爆準備OK。`
      : "ファイルを投下してください。",
    "default"
  );
}

function removeFile(index: number): void {
  selectedFiles = selectedFiles.filter((_, i) => i !== index);
  setSelectedFiles(selectedFiles);
}

function updateFileCount(count: number): void {
  fileCountBadge.textContent = count > 0 ? String(count) : "";
}

/* -------------------------------------------------------
   Status text with themed messages
   ------------------------------------------------------- */
function setStatus(message: string, type: "default" | "success" | "error" | "busy"): void {
  statusText.textContent = message;
  statusText.classList.remove("is-success", "is-error", "is-busy");
  if (type === "success") statusText.classList.add("is-success");
  if (type === "error") statusText.classList.add("is-error");
  if (type === "busy") statusText.classList.add("is-busy");
}

/* -------------------------------------------------------
   Render selected files (with bomb icons + remove buttons)
   ------------------------------------------------------- */
function renderSelectedFiles(files: File[]): void {
  selectedFilesList.innerHTML = "";

  if (files.length === 0) {
    selectedFilesList.classList.add("empty");
    const emptyItem = document.createElement("li");
    emptyItem.className = "file-list-empty";
    emptyItem.textContent = "まだファイルが選択されていません。";
    selectedFilesList.appendChild(emptyItem);
    return;
  }

  selectedFilesList.classList.remove("empty");
  files.forEach((file, index) => {
    const item = document.createElement("li");
    item.style.animationDelay = `${index * 0.05}s`;

    // Bomb icon
    const bombIcon = document.createElement("span");
    bombIcon.className = "file-bomb-icon";
    bombIcon.setAttribute("aria-hidden", "true");

    // File name
    const nameSpan = document.createElement("span");
    nameSpan.className = "file-name";
    nameSpan.textContent = file.name;

    // File size
    const sizeSpan = document.createElement("span");
    sizeSpan.className = "file-size";
    sizeSpan.textContent = formatBytes(file.size);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "file-remove";
    removeBtn.type = "button";
    removeBtn.textContent = "\u00d7";
    removeBtn.title = "ファイルを除外";
    removeBtn.setAttribute("aria-label", `${file.name} を除外`);
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeFile(index);
    });

    item.append(bombIcon, nameSpan, sizeSpan, removeBtn);
    selectedFilesList.appendChild(item);
  });
}

/* -------------------------------------------------------
   Render results (with stagger animation)
   ------------------------------------------------------- */
function renderResults(results: ConversionResult[]): void {
  resultsBody.innerHTML = "";

  if (results.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "empty-cell";
    cell.textContent = "結果がありません。";
    row.appendChild(cell);
    resultsBody.appendChild(row);
    return;
  }

  results.forEach((result, index) => {
    const row = document.createElement("tr");
    row.classList.add(`status-${result.status}`, "is-new");
    row.style.animationDelay = `${index * 0.08}s`;

    const fileCell = document.createElement("td");
    fileCell.textContent = result.fileName;

    const statusCell = document.createElement("td");
    statusCell.textContent = toStatusLabel(result.status);

    const originalSizeCell = document.createElement("td");
    originalSizeCell.textContent = formatBytes(result.originalSize);

    const outputSizeCell = document.createElement("td");
    outputSizeCell.textContent =
      typeof result.outputSize === "number" ? formatBytes(result.outputSize) : "-";

    const detailCell = document.createElement("td");
    detailCell.textContent = result.message ?? "-";

    row.append(fileCell, statusCell, originalSizeCell, outputSizeCell, detailCell);
    resultsBody.appendChild(row);
  });
}

function toStatusLabel(status: ConversionStatus): string {
  if (status === "converted") return "変換済み";
  if (status === "already_bom") return "既にBOMあり";
  return "エラー";
}

/* -------------------------------------------------------
   Utilities
   ------------------------------------------------------- */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createZipFileName(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `converted_with_bom_${yyyy}${mm}${dd}_${hh}${mi}${ss}.zip`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* -------------------------------------------------------
   CONVERSION — with fuse progress + explosion
   ------------------------------------------------------- */
async function runConversion(): Promise<void> {
  if (selectedFiles.length === 0) return;

  setBusy(true);
  setStatus("導火線に点火... 変換中です", "busy");

  try {
    const total = selectedFiles.length;
    let completed = 0;

    const convertedItems = await Promise.all(
      selectedFiles.map(async (file) => {
        const item = await convertFileToBom(file);
        completed++;
        setFuseProgress(completed / total);
        return item;
      })
    );

    // Fuse reaches 100% → trigger explosion!
    setFuseProgress(1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    triggerExplosion();

    const results = convertedItems.map((item) => item.result);
    renderResults(results);

    const zipEntries: ZipEntry[] = convertedItems.flatMap((item) => {
      if (!item.output) return [];
      return [{ name: item.result.fileName, data: item.output }];
    });

    const batchResult: BatchConversionResult = { results };

    if (zipEntries.length > 0) {
      const zipBlob = await buildZip(zipEntries);
      batchResult.zipBlob = zipBlob;
      downloadBlob(batchResult.zipBlob, createZipFileName());
    }

    const errorCount = results.filter((r) => r.status === "error").length;
    const successCount = results.length - errorCount;

    if (successCount > 0) {
      setStatus(
        `爆撃完了! ${successCount}/${results.length} 件を変換。ZIPをダウンロードしました。`,
        "success"
      );
    } else {
      setStatus("変換可能なファイルがありませんでした。", "error");
    }

    // Scroll to results
    const resultsPanel = document.getElementById("results-panel");
    resultsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    setStatus("爆発失敗... 予期せぬエラーが発生しました。", "error");
  } finally {
    setBusy(false);
  }
}

/* -------------------------------------------------------
   Event handlers
   ------------------------------------------------------- */
function preventDragDefault(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function handleIncomingFiles(fileList: FileList | null): void {
  if (!fileList) {
    setSelectedFiles([]);
    return;
  }
  setSelectedFiles(Array.from(fileList));
}

dropZone.addEventListener("dragenter", (event) => {
  preventDragDefault(event);
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragover", (event) => {
  preventDragDefault(event);
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", (event) => {
  preventDragDefault(event);
  dropZone.classList.remove("is-dragging");
});

dropZone.addEventListener("drop", (event) => {
  preventDragDefault(event);
  dropZone.classList.remove("is-dragging");
  handleIncomingFiles(event.dataTransfer?.files ?? null);
});

fileInput.addEventListener("change", () => {
  handleIncomingFiles(fileInput.files);
});

convertButton.addEventListener("click", () => {
  void runConversion();
});

window.addEventListener("beforeunload", () => {
  webMcpCleanup?.();
});

void initializeWebMcp();
