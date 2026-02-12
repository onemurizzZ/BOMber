import { convertBytesToBom } from "./encoding";

export const WEB_MCP_TOOL_NAME = "convert_utf8_text_to_bom";

export interface WebMcpToolTextContent {
  type: "text";
  text: string;
}

export interface WebMcpToolExecutionResult {
  isError?: boolean;
  content: WebMcpToolTextContent[];
  structuredContent?: Record<string, unknown>;
}

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    input: unknown
  ) => WebMcpToolExecutionResult | Promise<WebMcpToolExecutionResult>;
}

interface ModelContextLike {
  registerTool?: (tool: WebMcpToolDefinition) => unknown;
  unregisterTool?: (name: string) => unknown;
  provideContext?: (context: { tools: WebMcpToolDefinition[] }) => unknown;
}

export type WebMcpRegistrationMethod = "registerTool" | "provideContext";

export interface WebMcpRegistrationResult {
  status: "registered" | "unsupported" | "failed";
  message: string;
  method?: WebMcpRegistrationMethod;
  cleanup?: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function asTextContent(text: string): WebMcpToolTextContent {
  return { type: "text", text };
}

export function executeConvertUtf8TextTool(
  input: unknown
): WebMcpToolExecutionResult {
  if (!isRecord(input)) {
    return {
      isError: true,
      content: [asTextContent("入力が不正です。fileName と text が必要です。")]
    };
  }

  const fileName = Reflect.get(input, "fileName");
  const text = Reflect.get(input, "text");

  if (typeof fileName !== "string" || fileName.trim().length === 0) {
    return {
      isError: true,
      content: [asTextContent("fileName は1文字以上の文字列で指定してください。")]
    };
  }

  if (typeof text !== "string") {
    return {
      isError: true,
      content: [asTextContent("text は文字列で指定してください。")]
    };
  }

  const inputBytes = new TextEncoder().encode(text);
  const conversion = convertBytesToBom(inputBytes, {
    fileName,
    originalSize: inputBytes.byteLength
  });

  if (!conversion.output) {
    return {
      isError: true,
      content: [
        asTextContent(conversion.result.message ?? "BOM付与に失敗しました。")
      ],
      structuredContent: {
        result: conversion.result
      }
    };
  }

  const outputBase64 = bytesToBase64(conversion.output);
  const outputText = new TextDecoder("utf-8").decode(conversion.output);

  return {
    isError: false,
    content: [asTextContent("UTF-8 BOM付きテキストを生成しました。")],
    structuredContent: {
      result: conversion.result,
      outputText,
      outputBase64
    }
  };
}

export function createBomWebMcpTool(): WebMcpToolDefinition {
  return {
    name: WEB_MCP_TOOL_NAME,
    description:
      "テキストを受け取り、UTF-8 BOM付きテキストへ変換して返します。",
    inputSchema: {
      type: "object",
      properties: {
        fileName: {
          type: "string",
          minLength: 1,
          description: "元ファイル名。結果にも同じ名前を使います。"
        },
        text: {
          type: "string",
          description: "BOMを付けたいテキスト。"
        }
      },
      required: ["fileName", "text"],
      additionalProperties: false
    },
    execute: executeConvertUtf8TextTool
  };
}

function resolveModelContext(modelContextOverride?: unknown): ModelContextLike | null {
  if (modelContextOverride) {
    return isRecord(modelContextOverride)
      ? (modelContextOverride as ModelContextLike)
      : null;
  }

  if (typeof navigator === "undefined") {
    return null;
  }

  const maybeModelContext = Reflect.get(navigator as object, "modelContext");
  return isRecord(maybeModelContext) ? (maybeModelContext as ModelContextLike) : null;
}

function createCleanupFromRegistration(
  registration: unknown,
  modelContext: ModelContextLike
): (() => void) | undefined {
  if (isRecord(registration)) {
    const unregister = Reflect.get(registration, "unregister");
    if (typeof unregister === "function") {
      return () => {
        unregister.call(registration);
      };
    }
  }

  if (typeof modelContext.unregisterTool === "function") {
    return () => {
      modelContext.unregisterTool?.(WEB_MCP_TOOL_NAME);
    };
  }

  return undefined;
}

export async function registerBomToolWithBrowserApi(
  modelContextOverride?: unknown
): Promise<WebMcpRegistrationResult> {
  const modelContext = resolveModelContext(modelContextOverride);

  if (!modelContext) {
    return {
      status: "unsupported",
      message:
        "このブラウザでは WebMCP API が利用できません (navigator.modelContext 未検出)。"
    };
  }

  const tool = createBomWebMcpTool();

  try {
    if (typeof modelContext.registerTool === "function") {
      const registration = modelContext.registerTool(tool);
      return {
        status: "registered",
        method: "registerTool",
        message: "WebMCP registerTool でBOM変換ツールを登録しました。",
        cleanup: createCleanupFromRegistration(registration, modelContext)
      };
    }

    if (typeof modelContext.provideContext === "function") {
      await Promise.resolve(modelContext.provideContext({ tools: [tool] }));
      return {
        status: "registered",
        method: "provideContext",
        message: "WebMCP provideContext でBOM変換ツールを提供しました。"
      };
    }

    return {
      status: "unsupported",
      message:
        "navigator.modelContext は検出されましたが、tool登録メソッドが見つかりません。"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      message: `WebMCPツール登録に失敗しました: ${message}`
    };
  }
}
