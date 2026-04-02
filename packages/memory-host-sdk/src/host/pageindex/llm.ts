/**
 * LLM 调用模块
 *
 * 用于调用 OpenAI API (ChatGPT) 进行文本生成
 */

import { createSubsystemLogger } from "../../../../../src/logging/subsystem.js";
import type { LLMCallOptions } from "./types.js";

const log = createSubsystemLogger("pageindex-llm");

const DEFAULT_MODEL = "gpt-4o-2024-11-20";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;

/**
 * 获取 OpenAI API Key
 */
function getApiKey(): string | undefined {
  // 优先从环境变量获取
  return process.env.OPENAI_API_KEY;
}

/**
 * 调用 LLM 生成文本
 *
 * @param prompt 系统提示
 * @param userMessage 用户消息
 * @param options 选项
 * @returns LLM 响应文本
 */
export async function callLLM(
  prompt: string,
  userMessage: string,
  options: LLMCallOptions = {},
): Promise<string> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = options.model || DEFAULT_MODEL;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  const response = await fetch(`${DEFAULT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    log.error(`LLM API error: ${response.status} - ${error}`);
    throw new Error(`LLM API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * 调用 LLM 生成 JSON 响应
 *
 * @param prompt 系统提示
 * @param userMessage 用户消息
 * @param options 选项
 * @returns 解析后的 JSON 对象
 */
export async function callLLMJson<T>(
  prompt: string,
  userMessage: string,
  options: LLMCallOptions = {},
): Promise<T> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = options.model || DEFAULT_MODEL;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  // 添加 JSON 格式要求到提示
  const jsonPrompt = `${prompt}\n\n请以 JSON 格式返回结果。`;

  const response = await fetch(`${DEFAULT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: jsonPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    log.error(`LLM API error: ${response.status} - ${error}`);
    throw new Error(`LLM API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";

  try {
    return JSON.parse(content) as T;
  } catch {
    log.error(`Failed to parse LLM response as JSON: ${content}`);
    throw new Error("Failed to parse LLM response as JSON");
  }
}

/**
 * 从响应中提取 JSON
 *
 * 有时候 LLM 返回的 JSON 外面包裹了 Markdown 代码块
 */
export function extractJson<T>(response: string): T {
  // 尝试直接解析
  try {
    return JSON.parse(response) as T;
  } catch {
    // 忽略错误，继续尝试其他方式
  }

  // 尝试提取 JSON 代码块
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {
      // 忽略错误
    }
  }

  // 尝试提取任何 JSON 对象
  const anyJsonMatch = response.match(/\{[\s\S]*\}/);
  if (anyJsonMatch) {
    try {
      return JSON.parse(anyJsonMatch[0]) as T;
    } catch {
      // 忽略错误
    }
  }

  throw new Error("Failed to extract JSON from response");
}
