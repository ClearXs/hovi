/**
 * Knowledge Graph Prompt Templates
 * Based on LightRAG's extraction prompts
 */

export const KG_PROMPTS = {
  /** Default delimiter for tuple fields */
  DEFAULT_TUPLE_DELIMITER: "<|#|>",
  DEFAULT_COMPLETION_DELIMITER: "<|COMPLETE|>",

  /** Entity extraction system prompt */
  entity_extraction_system_prompt: `---Role---
You are a Knowledge Graph Specialist responsible for extracting entities and relationships from the input text.

---Instructions---
1. **Entity Extraction & Output:**
   * **Identification:** Identify clearly defined and meaningful entities in the input text.
   * **Entity Details:** For each identified entity, extract the following information:
       * \`entity_name\`: The name of the entity. If the entity name is case-insensitive, capitalize the first letter of each significant word (title case). Ensure **consistent naming** across the entire extraction process.
       * \`entity_type\`: Categorize the entity using one of the following types: {entity_types}. If none of the provided entity types apply, classify it as \`Other\` (do NOT add new entity type).
       * \`entity_description\`: Provide a concise yet comprehensive description of the entity's attributes and activities, based *solely* on the information present in the input text.
   * **Output Format - Entities:** Output a total of 4 fields for each entity, delimited by \`{tuple_delimiter}\`, on a single line. The first field *must* be the literal string \`entity\`.
       * Format: \`entity{tuple_delimiter}entity_name{tuple_delimiter}entity_type{tuple_delimiter}entity_description\`

2. **Relationship Extraction & Output:**
   * **Identification:** Identify direct, clearly stated, and meaningful relationships between previously extracted entities.
   * **N-ary Relationship Decomposition:** If a single statement describes a relationship involving more than two entities (an N-ary relationship), decompose it into multiple binary (two-entity) relationship pairs for separate description.
   * **Relationship Details:** For each binary relationship, extract the following fields:
       * \`source_entity\`: The name of the source entity. Ensure **consistent naming** with entity extraction.
       * \`target_entity\`: The name of the target entity. Ensure **consistent naming** with entity extraction.
       * \`relationship_keywords\`: One or more high-level keywords summarizing the nature of the relationship. Multiple keywords must be separated by a comma \`,\`. **DO NOT use \`{tuple_delimiter}\`** for separating multiple keywords.
       * \`relationship_description\`: A concise explanation of the nature of the relationship between the source and target entities.
   * **Output Format - Relationships:** Output a total of 5 fields for each relationship, delimited by \`{tuple_delimiter}\`, on a single line. The first field *must* be the literal string \`relation\`.
       * Format: \`relation{tuple_delimiter}source_entity{tuple_delimiter}target_entity{tuple_delimiter}relationship_keywords{tuple_delimiter}relationship_description\`

3. **Delimiter Usage Protocol:**
   * The \`{tuple_delimiter}\` is a complete, atomic marker and **must not be filled with content**. It serves strictly as a field separator.

4. **Relationship Direction & Duplication:**
   * Treat all relationships as **undirected** unless explicitly stated otherwise. Avoid outputting duplicate relationships.

5. **Output Order & Prioritization:**
   * Output all extracted entities first, followed by all extracted relationships.
   * Prioritize relationships that are most significant to the core meaning of the input text.

6. **Context & Objectivity:**
   * Ensure all entity names and descriptions are written in the **third person**.
   * Avoid pronouns such as \`this article\`, \`this paper\`, \`our company\`, \`I\`, \`you\`, and \`he/she\`.

7. **Language:**
   * The entire output (entity names, keywords, and descriptions) must be written in **{language}**.

8. **Completion Signal:** Output the literal string \`{completion_delimiter}\` only after all entities and relationships have been completely extracted.
`,

  /** Entity extraction user prompt */
  entity_extraction_user_prompt: `---Task---
Extract entities and relationships from the input text in Data to be Processed below.

---Instructions---
1. Strictly adhere to all format requirements for entity and relationship lists, including output order, field delimiters, and proper noun handling.
2. Output *only* the extracted list of entities and relationships. Do not include any introductory or concluding remarks.
3. Output \`{completion_delimiter}\` as the final line after all relevant entities and relationships have been extracted.
4. Ensure the output language is {language}. Proper nouns should be kept in their original language.

---Entity Types---
[{entity_types}]

---Input Text---
{input_text}

---Output---
`,

  /** Continue extraction prompt for missed/incorrect items */
  entity_continue_extraction_user_prompt: `---Task---
Based on the last extraction task, identify and extract any **missed or incorrectly formatted** entities and relationships from the input text.

---Instructions---
1. Do NOT re-output entities and relationships that were correctly extracted in the last task.
2. If an entity or relationship was missed, extract and output it now.
3. If an entity or relationship was incorrectly formatted, re-output the corrected version.
4. Output format must follow: entity{tuple_delimiter}name{...} or relation{tuple_delimiter}source{...}
5. Output \`{completion_delimiter}\` when done.

---Input Text---
{input_text}

---Output---
`,

  /** Entity description summarization prompt */
  summarize_entity_descriptions: `---Role---
You are a Knowledge Graph Specialist, proficient in data curation and synthesis.

---Task---
Your task is to synthesize a list of descriptions of a given entity into a single, comprehensive, and cohesive summary.

---Instructions---
1. The description list is provided in JSON format, each on a new line.
2. Output the merged description as plain text, in multiple paragraphs.
3. Integrate all key information from every provided description. Do not omit important facts.
4. Write from an objective, third-person perspective. Explicitly mention the entity name at the beginning.
5. In cases of conflicting descriptions, attempt to reconcile them or present both viewpoints.
6. The summary's total length must not exceed {summary_length} tokens.

---Input---
Entity Name: {description_name}

Description List:
{description_list}

---Output---
`,

  /** Keywords extraction for RAG query */
  keywords_extraction: `---Role---
You are an expert keyword extractor for RAG system.

---Task---
From the user query, extract two types of keywords:
1. **high_level_keywords**: overarching concepts/themes (user's core intent, subject area)
2. **low_level_keywords**: specific entities/details (proper nouns, technical terms, concrete items)

---Instructions---
1. Output MUST be a valid JSON object and nothing else.
2. All keywords must be explicitly derived from the user query.
3. Keywords should be concise words or meaningful phrases. Prioritize multi-word phrases.
4. For queries that are too simple or vague, return a JSON object with empty lists.
5. All extracted keywords MUST be in {language}.

---Output Format---
Return:
{
  "high_level_keywords": [...],
  "low_level_keywords": [...]
}

---Examples---
Query: "特斯拉自动驾驶技术和苹果公司有什么关系？"
Output: {{"high_level_keywords": ["自动驾驶技术", "科技公司"], "low_level_keywords": ["特斯拉", "苹果公司", "自动驾驶"]}}

Query: "2024年发布的新能源汽车有哪些？"
Output: {{"high_level_keywords": ["新能源汽车", "2024年发布"], "low_level_keywords": ["新能源汽车", "2024"]}}

---Real Data---
Query: {query}

---Output---
`,

  /** RAG response synthesis prompt */
  rag_response: `---Role---
You are an expert AI assistant specializing in synthesizing information from a provided knowledge base.

---Goal---
Generate a comprehensive, well-structured answer to the user query.
The answer must integrate relevant facts from the Knowledge Graph and Document Chunks found in the **Context**.

---Instructions---
1. Carefully determine the user's query intent to understand the user's information need.
2. Scrutinize both \`Knowledge Graph Data\` and \`Document Chunks\` in the **Context**. Identify information relevant to the query.
3. Weave extracted facts into a coherent response. Use your knowledge only to formulate fluent sentences, NOT to introduce external information.
4. Track the reference_id of the document chunk which directly support the facts presented.
5. Generate a references section at the end of the response.
6. Strictly adhere to the provided context; DO NOT invent information not explicitly stated.
7. The response MUST be in the same language as the user query.

---Context---
{context_data}

---Output---
`,
};

/** Default entity types for extraction */
export const DEFAULT_ENTITY_TYPES = [
  "人物", // Person
  "组织", // Organization
  "地点", // Location
  "事件", // Event
  "概念", // Concept
  "产品", // Product
  "技术", // Technology
  "方法", // Method
  "数据", // Data
  "文档", // Document
  "其他", // Other
];

// English variants
export const DEFAULT_ENTITY_TYPES_EN = [
  "Person",
  "Organization",
  "Location",
  "Event",
  "Concept",
  "Product",
  "Technology",
  "Method",
  "Data",
  "Document",
  "Other",
];

/** Parse LLM extraction output into structured data */
export function parseExtractionOutput(
  output: string,
  tupleDelimiter: string = KG_PROMPTS.DEFAULT_TUPLE_DELIMITER,
  completionDelimiter: string = KG_PROMPTS.DEFAULT_COMPLETION_DELIMITER,
): {
  entities: Array<{ name: string; type: string; description: string }>;
  relations: Array<{ source: string; target: string; keywords: string[]; description: string }>;
} {
  const entities: Array<{ name: string; type: string; description: string }> = [];
  const relations: Array<{
    source: string;
    target: string;
    keywords: string[];
    description: string;
  }> = [];

  const lines = output.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    if (line.includes(completionDelimiter)) {
      break;
    }

    const parts = line.split(tupleDelimiter);
    if (parts.length < 1) {
      continue;
    }

    const type = parts[0].trim().toLowerCase();

    if (type === "entity" && parts.length >= 4) {
      entities.push({
        name: parts[1].trim(),
        type: parts[2].trim(),
        description: parts[3].trim(),
      });
    } else if (type === "relation" && parts.length >= 5) {
      const keywords = parts[4]
        .trim()
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      relations.push({
        source: parts[1].trim(),
        target: parts[2].trim(),
        keywords,
        description: parts[4]?.trim() || "",
      });
    }
  }

  return { entities, relations };
}

/** Parse keywords extraction output */
export function parseKeywordsOutput(output: string): {
  high_level_keywords: string[];
  low_level_keywords: string[];
} {
  try {
    // Try to extract JSON from the output
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        high_level_keywords: parsed.high_level_keywords || [],
        low_level_keywords: parsed.low_level_keywords || [],
      };
    }
  } catch {
    // If parsing fails, return empty
  }
  return { high_level_keywords: [], low_level_keywords: [] };
}
