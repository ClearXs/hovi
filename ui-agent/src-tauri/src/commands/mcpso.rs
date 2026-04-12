use regex::Regex;
use reqwest::{Client, Url};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSoItem {
    pub name: String,
    pub title: String,
    pub description: Option<String>,
    pub author_name: Option<String>,
    pub repo_url: Option<String>,
    pub server_page_url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSoSearchResult {
    pub items: Vec<McpSoItem>,
    pub page: u32,
    pub total_pages: Option<u32>,
    pub has_more: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSoDetailItem {
    pub title: String,
    pub description: Option<String>,
    pub summary: Option<String>,
    pub content: Option<String>,
    pub server_config_text: Option<String>,
    pub author_name: Option<String>,
    pub repo_url: Option<String>,
    pub server_page_url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSoImportResult {
    pub name: String,
    pub description: Option<String>,
    pub config: Value,
}

fn decode_json_string(raw: &str) -> String {
    serde_json::from_str::<String>(&format!("\"{}\"", raw)).unwrap_or_else(|_| raw.to_string())
}

fn extract_nearby_field(source: &str, key: &str) -> Option<String> {
    let plain_regex =
        Regex::new(&format!(r#""{}":"((?:\\.|[^"\\])*)""#, regex::escape(key))).ok()?;
    let escaped_regex = Regex::new(&format!(
        r#"\\"{}\\":\\"((?:\\\\.|[^"\\])*)\\""#,
        regex::escape(key)
    ))
    .ok()?;

    let captures = plain_regex
        .captures(source)
        .or_else(|| escaped_regex.captures(source))?;
    let decoded = decode_json_string(captures.get(1)?.as_str())
        .trim()
        .to_string();
    if decoded.is_empty() {
        None
    } else {
        Some(decoded)
    }
}

fn decode_token_text(value: &str) -> String {
    value
        .replace("\\u003c", "<")
        .replace("\\u003e", ">")
        .replace("\\u0026", "&")
        .replace("\\r", "")
        .replace("\\n", "\n")
        .replace("\\\"", "\"")
        .trim()
        .to_string()
}

fn extract_token_text(html: &str, reference: &str) -> Option<String> {
    let regex = Regex::new(&format!(
        r#"{}:T[0-9a-f]+,([\s\S]*?)(?=\n[0-9a-z]+:|</script>|<)"#,
        regex::escape(reference)
    ))
    .ok()?;
    let captures = regex.captures(html)?;
    Some(decode_token_text(captures.get(1)?.as_str()))
}

fn build_server_config_text(html: &str) -> Option<String> {
    let raw = extract_nearby_field(html, "server_config")?;
    match serde_json::from_str::<Value>(&raw) {
        Ok(parsed) => serde_json::to_string_pretty(&parsed).ok(),
        Err(_) => Some(raw),
    }
}

fn build_custom_mcp_config(html: &str) -> Value {
    if let Some(server_config_raw) = extract_nearby_field(html, "server_config") {
        if let Ok(parsed) = serde_json::from_str::<Value>(&server_config_raw) {
            if let Some(first) = parsed
                .get("mcpServers")
                .and_then(|value| value.as_object())
                .and_then(|servers| servers.values().next())
            {
                if let Some(command) = first.get("command").and_then(|value| value.as_str()) {
                    let mut config = serde_json::json!({
                        "transport": "stdio",
                        "command": command,
                    });
                    if let Some(args) = first.get("args") {
                        config["args"] = args.clone();
                    }
                    if let Some(env) = first.get("env") {
                        config["env"] = env.clone();
                    }
                    return config;
                }

                if let Some(transport) = first.get("type").and_then(|value| value.as_str()) {
                    let transport = transport.to_lowercase();
                    if transport == "sse" || transport == "http" || transport == "websocket" {
                        let mut config = serde_json::json!({
                            "transport": transport,
                        });
                        if let Some(url) = first.get("url") {
                            config["serverUrl"] = url.clone();
                        }
                        if let Some(headers) = first.get("headers") {
                            config["headers"] = headers.clone();
                        }
                        return config;
                    }
                }
            }
        }
    }

    let mut config = serde_json::json!({});
    if let Some(command) = extract_nearby_field(html, "server_command") {
        config["transport"] = Value::String("stdio".into());
        config["command"] = Value::String(command);
    }
    if let Some(env_raw) = extract_nearby_field(html, "server_params") {
        if let Ok(env_value) = serde_json::from_str::<Value>(&env_raw) {
            config["env"] = env_value;
        }
    }
    config
}

fn unique_by_url(items: Vec<McpSoItem>) -> Vec<McpSoItem> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();

    for item in items {
        let key = item.server_page_url.clone().unwrap_or_else(|| {
            format!(
                "{}:{}",
                item.name,
                item.repo_url.clone().unwrap_or_default()
            )
        });
        if seen.insert(key) {
            deduped.push(item);
        }
    }

    deduped
}

fn collect_search_entries(
    html: &str,
    regex: &Regex,
    unescape_slash: bool,
    server_page_by_name: &HashMap<String, String>,
) -> Vec<McpSoItem> {
    let mut parsed = Vec::new();

    for captures in regex.captures_iter(html) {
        let raw_name = captures
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let raw_title = captures
            .get(2)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let raw_desc = captures
            .get(3)
            .map(|value| value.as_str())
            .unwrap_or_default();

        let raw_name = if unescape_slash {
            raw_name.replace("\\\\", "\\")
        } else {
            raw_name.to_string()
        };
        let raw_title = if unescape_slash {
            raw_title.replace("\\\\", "\\")
        } else {
            raw_title.to_string()
        };
        let raw_desc = if unescape_slash {
            raw_desc.replace("\\\\", "\\")
        } else {
            raw_desc.to_string()
        };

        let name = decode_json_string(&raw_name).trim().to_string();
        let title = decode_json_string(&raw_title).trim().to_string();
        let description = decode_json_string(&raw_desc).trim().to_string();
        if name.is_empty() || title.is_empty() {
            continue;
        }

        let matched = captures.get(0).map(|value| value.range()).unwrap_or(0..0);
        let nearby = &html[matched.start..html.len().min(matched.start + 4_500)];
        let author_name = extract_nearby_field(nearby, "author_name");
        let repo_url = extract_nearby_field(nearby, "url");
        let server_page_url = server_page_by_name.get(&name).cloned().or_else(|| {
            author_name
                .as_ref()
                .map(|author| format!("https://mcp.so/server/{name}/{author}"))
        });

        parsed.push(McpSoItem {
            name,
            title,
            description: if description.is_empty() {
                None
            } else {
                Some(description)
            },
            author_name,
            repo_url,
            server_page_url,
        });
    }

    parsed
}

async fn fetch_html(url: &str, user_agent: &str) -> Result<String, String> {
    Client::new()
        .get(url)
        .header("User-Agent", user_agent)
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("request failed: {error}"))?
        .text()
        .await
        .map_err(|error| format!("failed to read response body: {error}"))
}

fn assert_server_page_url(raw_url: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw_url).map_err(|error| format!("invalid url: {error}"))?;
    if parsed.host_str() != Some("mcp.so") || !parsed.path().starts_with("/server/") {
        return Err("url must be a mcp.so server page".into());
    }
    Ok(parsed)
}

#[tauri::command]
pub async fn mcpso_search(
    query: String,
    limit: u32,
    page: u32,
) -> Result<McpSoSearchResult, String> {
    let query = query.trim().to_string();
    let limit = limit.clamp(1, 100);
    let page = page.max(1);

    let mut page_url = Url::parse("https://mcp.so/servers").map_err(|error| error.to_string())?;
    if !query.is_empty() {
        page_url.query_pairs_mut().append_pair("q", &query);
    }
    if page > 1 {
        page_url
            .query_pairs_mut()
            .append_pair("page", &page.to_string());
    }

    let html = fetch_html(page_url.as_str(), "OpenClaw-MCP-Search/1.0").await?;

    let mut server_page_by_name = HashMap::new();
    let page_path_regex =
        Regex::new(r#"/server/([^"/<]+)/([^"/<]+)"#).map_err(|error| error.to_string())?;
    for captures in page_path_regex.captures_iter(&html) {
        let slug = captures
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let author = captures
            .get(2)
            .map(|value| value.as_str())
            .unwrap_or_default();
        server_page_by_name
            .entry(slug.to_string())
            .or_insert_with(|| format!("https://mcp.so/server/{slug}/{author}"));
    }

    let plain_entry_regex = Regex::new(
        r#""name":"((?:\\.|[^"\\])*)","title":"((?:\\.|[^"\\])*)","description":"((?:\\.|[^"\\])*)""#,
    )
    .map_err(|error| error.to_string())?;
    let escaped_entry_regex = Regex::new(
        r#"\\"name\\":\\"((?:\\\\.|[^"\\])*)\\",\\"title\\":\\"((?:\\\\.|[^"\\])*)\\",\\"description\\":\\"((?:\\\\.|[^"\\])*)\\""#,
    )
    .map_err(|error| error.to_string())?;

    let mut parsed = collect_search_entries(&html, &plain_entry_regex, false, &server_page_by_name);
    if parsed.len() < 10 {
        parsed.extend(collect_search_entries(
            &html,
            &escaped_entry_regex,
            true,
            &server_page_by_name,
        ));
    }

    let fallback_items = if parsed.is_empty() {
        server_page_by_name
            .into_iter()
            .map(|(name, server_page_url)| McpSoItem {
                title: name.clone(),
                name,
                description: None,
                author_name: None,
                repo_url: None,
                server_page_url: Some(server_page_url),
            })
            .collect::<Vec<_>>()
    } else {
        parsed
    };

    let query_lower = query.to_lowercase();
    let filtered = if query_lower.is_empty() {
        fallback_items
    } else {
        fallback_items
            .into_iter()
            .filter(|item| {
                item.name.to_lowercase().contains(&query_lower)
                    || item.title.to_lowercase().contains(&query_lower)
                    || item
                        .description
                        .as_ref()
                        .map(|value| value.to_lowercase().contains(&query_lower))
                        .unwrap_or(false)
                    || item
                        .author_name
                        .as_ref()
                        .map(|value| value.to_lowercase().contains(&query_lower))
                        .unwrap_or(false)
            })
            .collect::<Vec<_>>()
    };

    let deduped = unique_by_url(filtered);
    let total_pages_regex = Regex::new(r#""totalPages":\s*(\d+)|\\?"totalPages\\?":\s*(\d+)"#)
        .map_err(|error| error.to_string())?;
    let total_pages = total_pages_regex
        .captures(&html)
        .and_then(|captures| captures.get(1).or_else(|| captures.get(2)))
        .and_then(|value| value.as_str().parse::<u32>().ok());
    let items = deduped.into_iter().take(limit as usize).collect::<Vec<_>>();
    let has_more = total_pages
        .map(|total_pages| page < total_pages)
        .unwrap_or_else(|| items.len() >= usize::max(20, (limit / 2).max(1) as usize));

    Ok(McpSoSearchResult {
        items,
        page,
        total_pages,
        has_more,
    })
}

#[tauri::command]
pub async fn mcpso_detail(url: String) -> Result<McpSoDetailItem, String> {
    let parsed = assert_server_page_url(url.trim())?;
    let html = fetch_html(parsed.as_str(), "OpenClaw-MCP-Detail/1.0").await?;

    let title_regex = Regex::new(r#"<title>([^<]+)</title>"#).map_err(|error| error.to_string())?;
    let meta_desc_regex = Regex::new(r#"<meta name="description" content="([^"]*)""#)
        .map_err(|error| error.to_string())?;
    let summary_ref_regex =
        Regex::new(r#""summary":"\$([0-9a-z]+)"|\\"summary\\":\\"\$([0-9a-z]+)\\""#)
            .map_err(|error| error.to_string())?;
    let content_ref_regex =
        Regex::new(r#""content":"\$([0-9a-z]+)"|\\"content\\":\\"\$([0-9a-z]+)\\""#)
            .map_err(|error| error.to_string())?;

    let title = title_regex
        .captures(&html)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().replace(" MCP Server", "").trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "MCP".into());
    let description = meta_desc_regex
        .captures(&html)
        .and_then(|captures| captures.get(1))
        .map(|value| decode_json_string(value.as_str()).trim().to_string())
        .filter(|value| !value.is_empty());
    let summary_ref = summary_ref_regex
        .captures(&html)
        .and_then(|captures| captures.get(1).or_else(|| captures.get(2)))
        .map(|value| value.as_str().to_string());
    let content_ref = content_ref_regex
        .captures(&html)
        .and_then(|captures| captures.get(1).or_else(|| captures.get(2)))
        .map(|value| value.as_str().to_string());

    Ok(McpSoDetailItem {
        title,
        description,
        summary: summary_ref
            .as_deref()
            .and_then(|reference| extract_token_text(&html, reference)),
        content: content_ref
            .as_deref()
            .and_then(|reference| extract_token_text(&html, reference)),
        server_config_text: build_server_config_text(&html),
        author_name: extract_nearby_field(&html, "author_name"),
        repo_url: extract_nearby_field(&html, "url"),
        server_page_url: Some(parsed.to_string()),
    })
}

#[tauri::command]
pub async fn mcpso_import(url: String) -> Result<McpSoImportResult, String> {
    let parsed = assert_server_page_url(url.trim())?;
    let html = fetch_html(parsed.as_str(), "OpenClaw-Connector-Importer/1.0").await?;
    let title_regex = Regex::new(r#"<title>([^<]+)</title>"#).map_err(|error| error.to_string())?;
    let meta_desc_regex = Regex::new(r#"<meta name="description" content="([^"]*)""#)
        .map_err(|error| error.to_string())?;

    let name = title_regex
        .captures(&html)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().replace(" MCP Server", "").trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| extract_nearby_field(&html, "title"))
        .or_else(|| extract_nearby_field(&html, "name"))
        .or_else(|| {
            parsed
                .path_segments()
                .and_then(|segments| segments.into_iter().nth(1))
                .map(str::to_string)
        })
        .unwrap_or_else(|| "Imported MCP".into());

    let description = meta_desc_regex
        .captures(&html)
        .and_then(|captures| captures.get(1))
        .map(|value| decode_json_string(value.as_str()).trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| extract_nearby_field(&html, "description"));

    Ok(McpSoImportResult {
        name,
        description,
        config: build_custom_mcp_config(&html),
    })
}
