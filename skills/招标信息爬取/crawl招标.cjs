#!/usr/bin/env node

/**
 * 招标信息自动爬取脚本
 * 行业：政务、智慧城市，自然资源、农业 + 信息化
 * 自动下载招标文件（PDF/Word）
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const ZB_DIR = "/Users/jiangwei/clawd/招标书";
const LOG_FILE = path.join(ZB_DIR, "crawl_log.txt");
const STATE_FILE = path.join(ZB_DIR, "tender_state.json");

const TARGET_INDUSTRIES = ["政务", "智慧城市", "自然资源", "农业"];
const TECH_KEYWORDS = [
  "信息化",
  "软件",
  "系统",
  "平台",
  "智慧",
  "数字",
  "数据",
  "网络",
  "智能化",
  "GIS",
  "遥感",
  "测绘",
  "管理",
  "OA",
  "政务服务",
  "大数据",
  "人工智能",
  "AI",
  "物联网",
];

function log(msg) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  console.log(msg);
}

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (e) {}
  return { knownUrls: [], lastCheck: null };
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
function getSafeName(t) {
  return t.replace(/[<>:"/\\|?*]/g, "_").substring(0, 35);
}

function isMatch(title) {
  const t = title.toLowerCase();
  if (!TARGET_INDUSTRIES.some((ind) => t.includes(ind.toLowerCase()))) return false;
  return TECH_KEYWORDS.some((k) => t.includes(k.toLowerCase()));
}

function downloadFile(url, filepath) {
  if (!url || !filepath) return false;
  if (fs.existsSync(filepath)) return true;
  const { execSync } = require("child_process");

  // 尝试多种下载方式
  const cmds = [
    `curl -s -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o "${filepath}" "${url}"`,
    `curl -s -L -o "${filepath}" "${url}"`,
    `wget -q -O "${filepath}" "${url}"`,
  ];

  for (const cmd of cmds) {
    try {
      execSync(cmd, { timeout: 60000 });
      if (fs.existsSync(filepath) && fs.statSync(filepath).size > 100) {
        log(
          `  下载成功: ${path.basename(filepath)} (${Math.round(fs.statSync(filepath).size / 1024)}KB)`,
        );
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function getList(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector("li a[title]", { timeout: 10000 }).catch(() => {});

  const items = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll("li a[title]").forEach((link) => {
      const title = link.title || link.textContent;
      const href = link.href;
      if (
        title &&
        href &&
        title.length > 10 &&
        (title.includes("招标") || title.includes("采购") || title.includes("项目"))
      ) {
        results.push({ title, url: href });
      }
    });
    return results.slice(0, 15);
  });
  await page.close();
  return items;
}

async function getDetail(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  const data = await page.evaluate(() => {
    const txt = document.body.innerText;

    // 提取所有可能的附件链接
    const attachments = [];

    // 方法1: 查找所有链接
    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.href;
      const text = a.textContent.trim();
      if (href && text && text.length > 2) {
        // 只要是看起来像附件的链接就收集
        if (
          href.match(/\.(pdf|doc|docx|xls|xlsx|zip|rar|7z|txt|jpg|png)/i) ||
          text.match(/附件|招标文件|采购文件|技术要求|评分|参数/) ||
          href.match(/zcy-gov|oss|upload|file|download/)
        ) {
          attachments.push({ url: href, name: text });
        }
      }
    });

    return {
      projectId: (txt.match(/项目编号[：:]*\s*([A-Z0-9\-]+)/i) || [])[1] || "",
      budget: (txt.match(/预算[金额：:]*\s*([\d,.]+\s*万元)/i) || [])[1] || "",
      buyer: (txt.match(/采购人[称：:]*\s*([^\n]{2,40})/i) || [])[1] || "",
      deadline:
        (txt.match(/截止[时间：:]*\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/i) || [])[1] || "",
      content: txt.substring(0, 8000),
      attachments: attachments.slice(0, 15),
    };
  });
  await page.close();
  return data;
}

function generateMD(t) {
  let md = `# ${t.title}\n\n`;
  md += `**项目编号:** ${t.projectId || "-"}\n`;
  md += `**预算:** ${t.budget || "-"}\n`;
  md += `**截止:** ${t.deadline || "-"}\n`;
  md += `**采购人:** ${t.buyer || "-"}\n`;
  md += `**行业:** ${t.industries?.join(", ") || "-"}\n\n`;

  if (t.attachments?.length) {
    md += `## 附件列表\n\n`;
    t.attachments.forEach((a) => {
      const fname = a.name.replace(/[<>:"/\\|?*]/g, "_").substring(0, 30);
      md += `- [${a.name}](./${fname})\n`;
    });
    md += "\n";
  }

  if (t.content) md += `## 公告内容\n\n${t.content}\n\n`;
  md += `\n---\n*来源: 中国政府采购网*\n`;
  return md;
}

async function main() {
  log("=== 招标爬取开始 ===");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const state = readState();
  let newCount = 0,
    filterCount = 0;

  const urls = [
    "https://www.ccgp.gov.cn/cggg/zygg/gkzb/",
    "https://www.ccgp.gov.cn/cggg/dfgg/gkzb/",
  ];

  for (const url of urls) {
    log(`抓取: ${url}`);
    const items = await getList(browser, url);
    log(`解析: ${items.length}条`);

    for (const item of items) {
      if (state.knownUrls.includes(item.url)) continue;
      if (!isMatch(item.title)) {
        filterCount++;
        continue;
      }

      log(`匹配: ${item.title.substring(0, 20)}`);
      const detail = await getDetail(browser, item.url);

      const tender = {
        ...item,
        ...detail,
        industries: TARGET_INDUSTRIES.filter((i) =>
          item.title.toLowerCase().includes(i.toLowerCase()),
        ),
      };

      const dir = path.join(ZB_DIR, getSafeName(item.title));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // 下载附件
      if (tender.attachments?.length) {
        log(`  发现${tender.attachments.length}个附件，尝试下载...`);
        for (const att of tender.attachments) {
          let fname = att.name.replace(/[<>:"/\\|?*]/g, "_").substring(0, 35);
          // 确保有扩展名
          if (!fname.match(/\.(pdf|doc|docx|xls|xlsx|zip)$/i)) {
            if (att.url.match(/\.pdf/i)) fname += ".pdf";
            else if (att.url.match(/\.docx?/i)) fname += ".doc";
            else if (att.url.match(/\.xls/i)) fname += ".xlsx";
            else if (att.url.match(/\.zip/i)) fname += ".zip";
          }
          const fpath = path.join(dir, fname);
          downloadFile(att.url, fpath);
        }
      }

      fs.writeFileSync(path.join(dir, "招标公告.md"), generateMD(tender));
      newCount++;
      state.knownUrls.push(item.url);
    }
  }

  await browser.close();
  state.lastCheck = new Date().toISOString();
  saveState(state);

  log(`=== 完成: 新增${newCount}条, 过滤${filterCount}条 ===`);
  if (newCount > 0) console.log(`\n📢 发现${newCount}条!`);
}

main().catch((e) => log(`失败: ${e.message}`));
