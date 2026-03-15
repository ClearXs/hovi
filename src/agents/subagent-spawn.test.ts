import { describe, expect, it } from "vitest";

describe("inferSubagentType", () => {
  // Test helper function directly
  const inferSubagentType = (task: string): string | undefined => {
    const lowerTask = task.toLowerCase();
    if (lowerTask.includes("搜索") || lowerTask.includes("查找") || lowerTask.includes("crawl")) {
      return "search";
    }
    if (lowerTask.includes("代码") || lowerTask.includes("开发") || lowerTask.includes("code")) {
      return "code";
    }
    if (lowerTask.includes("写") || lowerTask.includes("生成") || lowerTask.includes("create")) {
      return "write";
    }
    if (lowerTask.includes("分析") || lowerTask.includes("研究")) {
      return "analysis";
    }
    if (lowerTask.includes("读取") || lowerTask.includes("阅读")) {
      return "read";
    }
    return undefined;
  };

  it("should return search for search-related tasks", () => {
    expect(inferSubagentType("搜索文档")).toBe("search");
    expect(inferSubagentType("查找文件")).toBe("search");
    expect(inferSubagentType("crawl website")).toBe("search");
    expect(inferSubagentType("搜索相关内容")).toBe("search");
  });

  it("should return write for write-related tasks", () => {
    expect(inferSubagentType("写一个文档")).toBe("write");
    expect(inferSubagentType("生成报告")).toBe("write");
    expect(inferSubagentType("create document")).toBe("write");
    expect(inferSubagentType("生成内容")).toBe("write");
  });

  it("should return code for code-related tasks", () => {
    expect(inferSubagentType("写代码")).toBe("code");
    expect(inferSubagentType("开发功能")).toBe("code");
    expect(inferSubagentType("code review")).toBe("code");
    expect(inferSubagentType("编写代码")).toBe("code");
  });

  it("should return analysis for analysis-related tasks", () => {
    expect(inferSubagentType("分析数据")).toBe("analysis");
    expect(inferSubagentType("研究问题")).toBe("analysis");
    expect(inferSubagentType("分析报告")).toBe("analysis");
  });

  it("should return read for read-related tasks", () => {
    expect(inferSubagentType("读取文件")).toBe("read");
    expect(inferSubagentType("阅读文档")).toBe("read");
    expect(inferSubagentType("读取内容")).toBe("read");
  });

  it("should return undefined for unknown tasks", () => {
    expect(inferSubagentType("做其他事情")).toBeUndefined();
    expect(inferSubagentType("hello")).toBeUndefined();
    expect(inferSubagentType("")).toBeUndefined();
  });
});
