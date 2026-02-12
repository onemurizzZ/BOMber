import { describe, expect, it } from "vitest";

import {
  WEB_MCP_TOOL_NAME,
  executeConvertUtf8TextTool,
  registerBomToolWithBrowserApi
} from "../webmcp";

describe("webmcp helper", () => {
  it("テキスト入力をBOM付きへ変換できる", () => {
    const result = executeConvertUtf8TextTool({
      fileName: "hello.txt",
      text: "hello"
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      outputBase64: string;
      outputText: string;
      result: { status: string };
    };
    expect(structured.result.status).toBe("converted");
    expect(structured.outputBase64.startsWith("77u/")).toBe(true);
    expect(structured.outputText.charCodeAt(0)).toBe(0xfeff);
  });

  it("不正入力ならエラーを返す", () => {
    const result = executeConvertUtf8TextTool({
      fileName: "",
      text: "hello"
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("fileName");
  });

  it("registerToolがある場合は登録される", async () => {
    let calledToolName = "";
    const fakeModelContext = {
      registerTool: (tool: { name: string }) => {
        calledToolName = tool.name;
        return {
          unregister: () => {
            calledToolName = "";
          }
        };
      }
    };

    const registration = await registerBomToolWithBrowserApi(fakeModelContext);

    expect(registration.status).toBe("registered");
    expect(registration.method).toBe("registerTool");
    expect(calledToolName).toBe(WEB_MCP_TOOL_NAME);
    registration.cleanup?.();
    expect(calledToolName).toBe("");
  });
});
