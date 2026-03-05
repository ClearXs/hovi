"use client";

import { MarkdownContent } from "./MarkdownContent";

interface FormattedContentProps {
  content: string;
  className?: string;
  enableMarkdown?: boolean; // 是否启用 Markdown 渲染
}

/**
 * 格式化显示内容，支持：
 * 1. Markdown 渲染（可选）
 * 2. 数字加粗：如"总页数：42页" → "总页数：**42**页"
 * 3. 关键词加粗：如"✓ 封面信息完整" → "**✓ 封面信息完整**"
 * 4. 小字显示工具调用：如"Searching xxx" 显示为灰色小字
 */
export function FormattedContent({
  content,
  className = "",
  enableMarkdown = true,
}: FormattedContentProps) {
  // 检测是否包含 Markdown 语法
  const hasMarkdownSyntax = () => {
    const markdownPatterns = [
      /^#{1,6}\s/m, // 标题: # ## ###
      /\*\*[^*]+\*\*/, // 粗体: **text** (修复：不匹配空内容)
      /```[\s\S]*?```/, // 代码块: ```code```
      /`[^`]+`/, // 内联代码: `code`
      /^\s*[-*+]\s/m, // 无序列表: - item
      /^\s*\d+\.\s/m, // 有序列表: 1. item
      /\[.*?\]\(.*?\)/, // 链接: [text](url)
      /^\|.*\|.*\|$/m, // 表格: | col1 | col2 |
      /^>\s/m, // 引用: > quote
      /~~.+?~~/, // 删除线: ~~text~~
      /^-{3,}$/m, // 分隔线: ---
    ];

    return markdownPatterns.some((pattern) => pattern.test(content));
  };

  // 如果启用 Markdown 且内容包含 Markdown 语法，使用 Markdown 渲染
  if (enableMarkdown && hasMarkdownSyntax()) {
    return <MarkdownContent content={content} className={className} />;
  }

  // 否则使用原有的格式化逻辑
  const renderContent = () => {
    const lines = content.split("\n");

    return lines.map((line, index) => {
      // 检查是否是工具调用行（以Searching, Reading, Creating等开头）
      const isToolCall =
        /^(Searching|Reading|Creating|Running|Connecting|Fetching|Querying)\s/.test(line);

      if (isToolCall) {
        return (
          <span key={index} className="block text-xs text-text-tertiary leading-relaxed">
            {line}
          </span>
        );
      }

      // 加粗数字（如：42页、128人、85%等）
      let formattedLine = line.replace(
        /(\d+(?:\.\d+)?)(页|人|个|项|万元|元|%|份|张|条|次|家|月|年|天|小时|分钟)/g,
        "<strong>$1$2</strong>",
      );

      // 加粗检查项（以✓或✗开头的行）
      if (/^[✓✗]/.test(line)) {
        formattedLine = `<strong>${formattedLine}</strong>`;
      }

      // 加粗标题行（如：核心资质：、技术方案：等）
      formattedLine = formattedLine.replace(/^([^：\n]+：)/g, "<strong>$1</strong>");

      return (
        <span key={index} className="block" dangerouslySetInnerHTML={{ __html: formattedLine }} />
      );
    });
  };

  return (
    <p className={`whitespace-pre-wrap break-all leading-relaxed ${className}`}>
      {renderContent()}
    </p>
  );
}
