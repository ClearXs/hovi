/**
 * 搜索模块
 *
 * 基于树结构进行 LLM 推理式检索
 */

import { callLLM, extractJson } from "./llm.js";
import { getLeafNodes } from "./tree.js";
import type { PageNode, PageIndexSearchResult, PageIndexTree } from "./types.js";

/**
 * 在 PageIndex 树结构上进行推理式检索
 *
 * 这个方法模拟人类专家阅读文档的方式：
 * 1. 从根节点开始
 * 2. LLM 判断当前节点是否相关
 * 3. 如果相关，深入子节点
 * 4. 如果不相关，跳过
 * 5. 重复直到找到最相关的叶节点
 */
export async function searchPageIndex(
  tree: PageIndexTree,
  query: string,
  limit: number = 5,
): Promise<PageIndexSearchResult[]> {
  const results: PageIndexSearchResult[] = [];
  const leafNodes = getLeafNodes(tree.structure);

  // 简化实现：直接用 LLM 评估每个叶节点的相关性
  // 后续可以优化为树搜索方式

  const evaluatedNodes = await Promise.all(
    leafNodes.map(async (node) => {
      try {
        const relevance = await evaluateRelevance(query, node);
        return { node, relevance };
      } catch (error) {
        console.error(`Failed to evaluate node: ${node.title}`, error);
        return { node, relevance: 0 };
      }
    }),
  );

  // 按相关性排序
  evaluatedNodes.sort((a, b) => b.relevance - a.relevance);

  // 取 top N
  const topNodes = evaluatedNodes.slice(0, limit);

  for (const { node, relevance } of topNodes) {
    if (relevance > 0) {
      results.push({
        documentId: tree.docName,
        filename: tree.docName,
        content: node.summary || `${node.title} (Page ${node.startPage}-${node.endPage})`,
        pageNumber: node.startPage,
        section: node.title,
        score: relevance,
      });
    }
  }

  return results;
}

/**
 * 评估节点与查询的相关性
 *
 * 返回 0-1 之间的分数
 */
async function evaluateRelevance(query: string, node: PageNode): Promise<number> {
  const prompt = `请判断以下章节内容与用户问题的相关性。

用户问题：${query}

章节标题：${node.title}
${node.summary ? `章节摘要：${node.summary}` : ""}

请返回一个 JSON 对象，包含：
- relevance: 0-1 之间的相关性分数（1表示高度相关）
- reason: 简要说明判断理由

只返回 JSON，不要其他内容。`;

  try {
    const response = await callLLM(prompt, "评估相关性", { temperature: 0.3 });
    const result = extractJson<{ relevance: number; reason?: string }>(response);

    return Math.max(0, Math.min(1, result.relevance || 0));
  } catch (error) {
    console.error("Failed to evaluate relevance:", error);
    return 0;
  }
}

/**
 * 生成节点摘要（用于检索）
 *
 * 为没有摘要的节点生成摘要
 */
export async function generateNodeSummary(node: PageNode, fullText: string): Promise<string> {
  const prompt = `请为以下章节生成一个简洁的摘要（不超过100字）。

章节标题：${node.title}
页码：${node.startPage}-${node.endPage}

章节内容片段：
${fullText.slice(0, 2000)}

只返回摘要文本，不要其他内容。`;

  try {
    return await callLLM(prompt, "生成摘要", { temperature: 0.5, maxTokens: 200 });
  } catch (error) {
    console.error("Failed to generate summary:", error);
    return "";
  }
}

/**
 * 提取相关上下文
 *
 * 从文档文本中提取与查询相关的上下文
 */
export async function extractContext(
  query: string,
  fullText: string,
  pageRange: { start: number; end: number },
): Promise<string> {
  // 简化实现：直接返回页面范围内的文本
  // 后续可以用 LLM 提取更精确的上下文

  const lines = fullText.split("\n");
  // 估算每页的行数（假设每页约 50 行）
  const linesPerPage = 50;
  const startLine = (pageRange.start - 1) * linesPerPage;
  const endLine = pageRange.end * linesPerPage;

  const pageText = lines.slice(startLine, endLine).join("\n");

  // 如果文本太长，用 LLM 提取关键内容
  if (pageText.length > 2000) {
    const prompt = `请从以下文本中提取与用户问题相关的内容。

用户问题：${query}

文本内容：
${pageText}

只返回相关的内容片段，保留关键信息。`;

    try {
      return await callLLM(prompt, "提取相关内容", { maxTokens: 1000 });
    } catch {
      return pageText.slice(0, 1000);
    }
  }

  return pageText;
}
