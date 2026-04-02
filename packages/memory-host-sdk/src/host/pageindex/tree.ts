/**
 * 树结构构建模块
 *
 * 将 TOC 项转换为树形结构
 */

import type { PageNode, TOCItem } from "./types.js";

/**
 * 将扁平的 TOC 列表转换为树形结构
 */
export function buildTree(tocItems: TOCItem[]): PageNode {
  if (tocItems.length === 0) {
    // 如果没有 TOC 项，创建一个根节点
    return {
      title: "Document",
      nodeId: "0001",
      startPage: 1,
      endPage: 1,
      nodes: [],
    };
  }

  // 按层级组织
  const root: PageNode = {
    title: "Document",
    nodeId: "0000",
    startPage: 1,
    endPage: tocItems[tocItems.length - 1].page || 1,
    nodes: [],
  };

  const stack: { node: PageNode; level: number }[] = [{ node: root, level: 0 }];

  for (const item of tocItems) {
    const newNode: PageNode = {
      title: item.title,
      nodeId: generateNodeId(item),
      startPage: item.page || item.physicalIndex || 1,
      endPage: item.page || item.physicalIndex || 1,
      nodes: [],
    };

    // 找到正确的父节点
    while (stack.length > 1 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;

    // 更新父节点的 endPage
    if (newNode.endPage > parent.endPage) {
      parent.endPage = newNode.endPage;
    }

    // 添加到父节点
    if (!parent.nodes) {
      parent.nodes = [];
    }
    parent.nodes.push(newNode);

    // 入栈
    stack.push({ node: newNode, level: item.level });
  }

  // 清理空节点
  return cleanTree(root);
}

/**
 * 生成节点 ID
 */
function generateNodeId(item: TOCItem): string {
  // 使用标题的简写作为 ID
  const prefix = item.title
    .slice(0, 3)
    .toUpperCase()
    .replace(/[^A-Z]/g, "X");

  const level = item.level.toString().padStart(2, "0");
  return `${level}${prefix}`;
}

/**
 * 清理树 - 移除空节点
 */
function cleanTree(node: PageNode): PageNode {
  if (!node.nodes || node.nodes.length === 0) {
    return node;
  }

  // 递归清理子节点
  const cleanedNodes = node.nodes.map(cleanTree).filter((n) => n.title.trim() !== "");

  return {
    ...node,
    nodes: cleanedNodes,
  };
}

/**
 * 处理大节点 - 递归分割过大的章节
 */
export function processLargeNodes(node: PageNode, maxPagesPerNode: number = 10): PageNode {
  if (!node.nodes || node.nodes.length === 0) {
    return node;
  }

  const processedNodes: PageNode[] = [];

  for (const child of node.nodes) {
    const pageCount = child.endPage - child.startPage + 1;

    if (pageCount <= maxPagesPerNode) {
      // 节点足够小，直接保留
      processedNodes.push(processLargeNodes(child, maxPagesPerNode));
    } else {
      // 节点太大，需要分割
      const splitNodes = splitNode(child, maxPagesPerNode);
      processedNodes.push(...splitNodes);
    }
  }

  return {
    ...node,
    nodes: processedNodes,
  };
}

/**
 * 分割大节点
 */
function splitNode(node: PageNode, maxPages: number): PageNode[] {
  const results: PageNode[] = [];
  const pageCount = node.endPage - node.startPage + 1;
  const numSplits = Math.ceil(pageCount / maxPages);

  for (let i = 0; i < numSplits; i++) {
    const startPage = node.startPage + i * maxPages;
    const endPage = Math.min(startPage + maxPages - 1, node.endPage);

    results.push({
      ...node,
      nodeId: `${node.nodeId}_${i}`,
      title: `${node.title} (Part ${i + 1})`,
      startPage,
      endPage,
      // 子节点也需要处理
      nodes: node.nodes
        ? processLargeNodes({ ...node, startPage, endPage }, maxPages).nodes
        : undefined,
    });
  }

  return results;
}

/**
 * 获取树的叶节点（用于检索）
 */
export function getLeafNodes(node: PageNode): PageNode[] {
  if (!node.nodes || node.nodes.length === 0) {
    return [node];
  }

  const leaves: PageNode[] = [];
  for (const child of node.nodes) {
    leaves.push(...getLeafNodes(child));
  }

  return leaves;
}

/**
 * 打印树结构（用于调试）
 */
export function printTree(node: PageNode, indent: number = 0): string {
  const prefix = "  ".repeat(indent);
  let result = `${prefix}- ${node.title} (${node.startPage}-${node.endPage})\n`;

  if (node.nodes) {
    for (const child of node.nodes) {
      result += printTree(child, indent + 1);
    }
  }

  return result;
}
