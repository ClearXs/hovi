import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { Type } from "@sinclair/typebox";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { AnyAgentTool } from "./common.js";
import { readStringParam } from "./common.js";

const SetAvatarStateSchema = Type.Object({
  state: Type.String({ description: 'The avatar state to set ("idle" | "emote")' }),
  emoteId: Type.Optional(
    Type.String({ description: "The emote to play (required when state is 'emote')" }),
  ),
  expression: Type.Optional(
    Type.String({
      description:
        'Facial expression to display. Preset: "neutral" | "happy" | "angry" | "sad" | "relaxed" | "surprised" | "none". Also supports custom expressions defined in VRM model. Use "none" to clear expression.',
    }),
  ),
});

/**
 * Avatar 动作/表情控制工具
 * 用于 AI 控制虚拟角色的动作和表情
 */
export function createAvatarTool(_opts?: { agentChannel?: GatewayMessageChannel }): AnyAgentTool {
  return {
    label: "Set Avatar State",
    name: "set_avatar_state",
    description: `Set the avatar's motion, expression, and speaking state. Call this BEFORE or WHILE speaking to ensure smooth animation. Motion and expression will play immediately, voice will follow.

## When to Use
- Call BEFORE starting to speak for smooth transitions
- Call right at the beginning of your response
- Set back to "idle" after finishing

## Parameters
- state: The avatar state to set ("idle" | "emote")
  - "idle": Default待机状态，播放循环动画
  - "emote": 情感动作，播放一次性动画
- emoteId: The emote to play (required when state is "emote"). Use the emote ID from available motions list.
- expression: Facial expression to display. Preset expressions: "neutral" | "happy" | "angry" | "sad" | "relaxed" | "surprised". VRM models may also have custom expressions - use list_avatar_motions to see available expressions. Use "none" to clear expression.

## Motion Selection Guidelines
Based on conversation context, select appropriate motions:

**Greetings:**
- "hello", "hi", "hey", "你好" → greeting_wave + happy
- "bye", "goodbye", "see you", "再见" → greeting_bye + neutral

**Responses:**
- "ok", "yes", "sure", "好", "可以" → gesture_nod + happy
- "no", "nope", "disagree", "不要", "不行" → gesture_shake + sad

**Reactions:**
- "wow", "amazing", "厉害", "哇" → reaction_surprise + surprised
- "happy", "great", "开心", "太棒了" → reaction_happy + happy

## Examples:
- Before speaking: set_avatar_state(state="emote", emoteId="greeting_wave", expression="happy")
- During response: set_avatar_state(state="emote", emoteId="gesture_nod", expression="happy")
- After speaking: set_avatar_state(state="idle", expression="neutral")`,

    parameters: SetAvatarStateSchema,

    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const state = readStringParam(params, "state", { required: true });
      const emoteId = readStringParam(params, "emoteId");
      const expression = readStringParam(params, "expression");

      const payload = {
        type: "avatar_state",
        state,
        emoteId: emoteId || null,
        expression: expression || "neutral",
      };

      console.log("[AvatarTool] set_avatar_state:", payload);

      // Avatar state is sent via tool result
      // Frontend extracts this from tool events and applies to AvatarController

      return {
        content: [
          {
            type: "text",
            text: `Avatar state updated: state=${state}, emoteId=${emoteId || "none"}, expression=${expression || "neutral"}`,
          },
        ],
        details: payload,
      };
    },
  };
}

/**
 * 获取可用的动作列表工具
 */
export function createAvatarMotionsListTool(options?: { agentDir?: string }): AnyAgentTool {
  return {
    label: "List Avatar Motions",
    name: "list_avatar_motions",

    description: `Get the list of available avatar motions and expressions. Use this to see what motions and expressions can be used with set_avatar_state tool.

## Returns:
- idle: The idle motion (looping)
- emotes: List of available emotes with their IDs, descriptions, and trigger keywords
- expressions: Available facial expressions with blendshape names

## Usage Tip:
Check this list to see available emotes and their trigger keywords. Use matching keywords in conversation to select appropriate emotes for natural interactions.`,

    parameters: Type.Object({}),

    execute: async () => {
      // 尝试从 persona.json 读取实际的配置
      let motions: unknown = null;

      if (options?.agentDir) {
        const personaPath = path.join(options.agentDir, "persona.json");
        try {
          if (existsSync(personaPath)) {
            const content = await fs.readFile(personaPath, "utf-8");
            const persona = JSON.parse(content);
            if (persona.motions) {
              motions = persona.motions;
              console.log("[AvatarTool] Loaded motions from persona.json:", motions);
            }
          }
        } catch (error) {
          console.warn("[AvatarTool] Failed to load persona.json:", error);
        }
      }

      // 如果没有从 persona.json 加载到配置，返回默认值
      if (!motions) {
        motions = {
          idle: {
            file: "motions/idle_normal.vmd",
            description: "Default idle animation",
          },
          emotes: [
            {
              id: "greeting_wave",
              description: "Wave hand to greet",
              keywords: ["hello", "hi", "hey"],
            },
            {
              id: "greeting_bye",
              description: "Wave goodbye",
              keywords: ["bye", "goodbye", "see you"],
            },
            { id: "gesture_nod", description: "Nod in agreement", keywords: ["ok", "yes", "sure"] },
            { id: "gesture_shake", description: "Shake head", keywords: ["no", "disagree"] },
            {
              id: "reaction_surprise",
              description: "Surprised expression",
              keywords: ["wow", "amazing"],
            },
            { id: "reaction_happy", description: "Happy expression", keywords: ["happy", "great"] },
          ],
          expressions: [
            { name: "neutral", blendshape: "neutral", description: "Default neutral expression" },
            { name: "happy", blendshape: "happy", description: "Happy expression" },
            { name: "surprised", blendshape: "surprised", description: "Surprised expression" },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(motions, null, 2),
          },
        ],
        details: { motions },
      };
    },
  };
}
