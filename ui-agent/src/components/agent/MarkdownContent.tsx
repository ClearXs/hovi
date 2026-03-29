"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Markdown 内容渲染组件
 * 支持：
 * 1. GitHub Flavored Markdown（表格、任务列表、删除线等）
 * 2. 代码语法高亮
 * 3. 自定义样式
 */
export const MarkdownContent = React.memo(({ content, className = "" }: MarkdownContentProps) => {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 代码块渲染
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const inline = props.inline;
            return !inline && match ? (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={
                  {
                    margin: "0.5rem 0",
                    borderRadius: "0.375rem",
                    fontSize: "0.75rem",
                  } as any
                }
                {...props}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            ) : (
              <code
                className="px-1 py-0.5 bg-background-tertiary rounded text-xs font-mono text-primary"
                {...props}
              >
                {children}
              </code>
            );
          },

          // 链接渲染 - 添加样式和安全属性
          a({ node, children, href, ...props }) {
            return (
              <a
                href={href}
                className="text-primary hover:text-primary-hover underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            );
          },

          // 标题渲染
          h1({ node, children, ...props }) {
            return (
              <h1 className="text-lg font-semibold text-text-primary mt-md mb-sm" {...props}>
                {children}
              </h1>
            );
          },
          h2({ node, children, ...props }) {
            return (
              <h2 className="text-base font-semibold text-text-primary mt-md mb-sm" {...props}>
                {children}
              </h2>
            );
          },
          h3({ node, children, ...props }) {
            return (
              <h3 className="text-sm font-semibold text-text-primary mt-sm mb-xs" {...props}>
                {children}
              </h3>
            );
          },

          // 段落渲染
          p({ node, children, ...props }) {
            return (
              <p className="text-xs text-text-primary leading-relaxed my-xs" {...props}>
                {children}
              </p>
            );
          },

          // 列表渲染
          ul({ node, children, ...props }) {
            return (
              <ul
                className="list-disc list-inside text-xs text-text-primary my-xs space-y-xs"
                {...props}
              >
                {children}
              </ul>
            );
          },
          ol({ node, children, ...props }) {
            return (
              <ol
                className="list-decimal list-inside text-xs text-text-primary my-xs space-y-xs"
                {...props}
              >
                {children}
              </ol>
            );
          },
          li({ node, children, ...props }) {
            return (
              <li className="text-xs leading-relaxed" {...props}>
                {children}
              </li>
            );
          },

          // 表格渲染 - GitHub Flavored Markdown
          table({ node, children, ...props }) {
            return (
              <div className="overflow-x-auto scrollbar-default my-sm">
                <table className="min-w-full border border-border rounded-md text-xs" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          thead({ node, children, ...props }) {
            return (
              <thead className="bg-background-secondary" {...props}>
                {children}
              </thead>
            );
          },
          tbody({ node, children, ...props }) {
            return <tbody {...props}>{children}</tbody>;
          },
          tr({ node, children, ...props }) {
            return (
              <tr className="border-b border-border" {...props}>
                {children}
              </tr>
            );
          },
          th({ node, children, ...props }) {
            return (
              <th className="px-sm py-xs text-left font-semibold text-text-primary" {...props}>
                {children}
              </th>
            );
          },
          td({ node, children, ...props }) {
            return (
              <td className="px-sm py-xs text-text-primary" {...props}>
                {children}
              </td>
            );
          },

          // 引用块渲染
          blockquote({ node, children, ...props }) {
            return (
              <blockquote
                className="border-l-4 border-primary pl-md my-sm text-xs text-text-secondary italic"
                {...props}
              >
                {children}
              </blockquote>
            );
          },

          // 分隔线
          hr({ node, ...props }) {
            return <hr className="border-border my-md" {...props} />;
          },

          // 强调样式
          strong({ node, children, ...props }) {
            return (
              <strong className="font-semibold text-text-primary" {...props}>
                {children}
              </strong>
            );
          },
          em({ node, children, ...props }) {
            return (
              <em className="italic text-text-secondary" {...props}>
                {children}
              </em>
            );
          },

          // 删除线 - GitHub Flavored Markdown
          del({ node, children, ...props }) {
            return (
              <del className="line-through text-text-tertiary" {...props}>
                {children}
              </del>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

MarkdownContent.displayName = "MarkdownContent";
