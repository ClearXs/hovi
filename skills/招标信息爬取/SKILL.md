---
name: 招标信息爬取
description: 自动从中国政府网、各省公共资源交易中心等平台爬取招标信息，包括完整公告内容和招标文件附件。重点关注政务、智慧城市、自然资源、农业等行业的信息化项目。适用于：1）用户需要抓取政府采购招标信息；2）监控特定行业的新招标项目；3）下载招标文件和技术参数文档；4）设置定时任务自动监控。
---

# 招标信息爬取技能

自动从中国政府采购网等官方平台爬取招标信息，包括公告正文和招标文件附件。

## 适用场景

当用户提到以下内容时触发此技能：

- "爬取招标信息"
- "监控招标"
- "抓取政府采购"
- "查找招投标"
- "招标信息"
- "下载招标文件"
- "设置定时抓取"

## 工作流程

### 1. 数据源

- **中国政府采购网** (ccgp.gov.cn)
  - 中央采购: `/cggg/zygg/gkzb/`
  - 地方采购: `/cggg/dfgg/gkzb/`
- **各省公共资源交易中心** (可选)
- **军队采购网** (可选)

### 2. 行业过滤

目标行业（必须同时满足行业+信息化）：

| 行业     | 关键词                                              |
| -------- | --------------------------------------------------- |
| 政务     | 政务、政府、智慧城市、城市大脑、OA、电子政务        |
| 自然资源 | 自然资源、国土、测绘、GIS、遥感、林业、不动产、规划 |
| 农业     | 农业、农村振兴、智慧农业、农产品、高标准农田        |
| 智慧城市 | 智慧园区、智慧交通、智慧水利、数字孪生              |

信息化关键词（必须包含至少一个）：
`信息化、软件、系统、平台、智慧、数字、数据、网络、GIS、遥感、大数据、人工智能`

### 3. 爬取流程

```
1. 使用 Puppeteer 访问政府采购网列表页
2. 解析招标列表（标题、URL、发布时间）
3. 过滤：行业+信息化关键词同时满足
4. 访问详情页，抓取完整公告内容
5. 检测并下载附件（PDF/Word/ZIP）
6. 为每个项目创建独立目录
7. 保存为 Markdown 文件
```

### 4. 目录结构

```
招标书/
├── 项目名称1/
│   ├── 招标公告.md      # 完整公告内容
│   └── 招标文件.pdf    # 下载的附件
├── 项目名称2/
│   ├── 招标公告.md
│   └── 技术参数.docx
└── ...
```

### 5. 定时任务

使用 OpenClaw cron 设置定时执行：

```bash
clawdbot cron add \
  --name "招标信息检查" \
  --cron "*/10 * * * *" \
  --tz "Asia/Shanghai" \
  --session main \
  --message "运行 node /path/to/crawl招标.js 抓取最新招标信息" \
  --deliver \
  --channel webchat
```

## 关键代码片段

### 检测行业匹配

```javascript
const TARGET_INDUSTRIES = ["政务", "智慧城市", "自然资源", "农业"];
const TECH_KEYWORDS = ["信息化", "软件", "系统", "平台", "智慧", "数字", "数据", "GIS"];

function isMatch(title) {
  const t = title.toLowerCase();
  const hasIndustry = TARGET_INDUSTRIES.some((ind) => t.includes(ind.toLowerCase()));
  if (!hasIndustry) return false;
  return TECH_KEYWORDS.some((k) => t.includes(k.toLowerCase()));
}
```

### 结构化提取关键信息

```javascript
// 1. 提取基本信息的正则模式
const PATTERNS = {
  projectName: /项目名称[：:]\s*(.+?)(?:\n|$)/i,
  projectCode: /项目编号[：:]\s*([A-Z0-9\-]+)/i,
  budget: /(?:预算|金额|控制价)[：:]\s*(\d+(?:\.\d+)?\s*(?:万元|亿|元))/i,
  deadline:
    /(?:投标截止|截止时间|递交截止)[：:]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?\s*(?:\d{1,2}:\d{2})?)/i,
  location: /(?:开标地点|地点)[：:]\s*(.+?)(?:\n|$)/i,
  contact: /(?:联系人)[：:]\s*(.+?)(?:\n|$)/i,
  phone: /(?:联系电话|电话)[：:]\s*(\d{3,4}[-\s]?\d{7,8})/i,
};

// 2. 特定资格要求关键词
const QUALIFICATION_KEYWORDS = [
  "甲级测绘资质",
  "乙级测绘资质",
  "丙级测绘资质",
  "ISO9001",
  "ISO 9001",
  "ISO14001",
  "ISO 14001",
  "CMMI",
  "高新技术企业",
  "软件企业",
  "甲级资质",
  "乙级资质",
  "一级建造师",
  "同类业绩",
  "类似业绩",
  "项目业绩",
];

// 3. 评分办法提取
const SCORING_PATTERNS = {
  businessScore: /商务标.*?(\d+)分/i,
  techScore: /技术标.*?(\d+)分/i,
  priceScore: /价格分.*?(\d+)分/i,
  totalScore: /(?:总分|满分|合计).*?(\d+)/i,
};

// 4. 无效投标情形关键词
const INVALID_BID_KEYWORDS = [
  "视为无效投标",
  "无效投标",
  "否决投标",
  "串通投标",
  "逾期送达",
  "未密封",
  "未缴纳保证金",
  "超预算",
  "重大偏离",
];
```

### 下载附件

```javascript
function downloadFile(url, filepath) {
  const cmd = `curl -s -L -o "${filepath}" "${url}"`;
  execSync(cmd, { timeout: 60000 });
}
```

### 完整解析流程

```javascript
function parseTenderDoc(content) {
  const result = {
    basicInfo: {},
    qualifications: [],
    scoring: { business: 0, tech: 0, price: 0, details: [] },
    invalidBids: [],
  };

  // 提取基本信息
  for (const [key, pattern] of Object.entries(PATTERNS)) {
    const match = content.match(pattern);
    if (match) result.basicInfo[key] = match[1].trim();
  }

  // 提取资格要求（高亮显示）
  for (const qual of QUALIFICATION_KEYWORDS) {
    if (content.includes(qual)) {
      result.qualifications.push(qual);
    }
  }

  // 提取评分办法
  for (const [key, pattern] of Object.entries(SCORING_PATTERNS)) {
    const match = content.match(pattern);
    if (match) result.scoring[key] = parseInt(match[1]);
  }

  // 提取无效投标情形
  for (const keyword of INVALID_BID_KEYWORDS) {
    const regex = new RegExp(`[^。]*${keyword}[^。]*`, "gi");
    let match;
    while ((match = regex.exec(content)) !== null) {
      result.invalidBids.push(match[0].trim());
    }
  }

  return result;
}
```

## 输出格式

每个招标项目保存为 Markdown，包含结构化提取的信息：

```markdown
# 项目名称

## 基本信息

| 字段         | 值                       |
| ------------ | ------------------------ |
| 项目编号     | XXXXXX                   |
| 预算金额     | 500万元                  |
| 投标截止时间 | 2026-04-15 10:00         |
| 开标地点     | XX市公共资源交易中心XX楼 |
| 采购人       | XXX局                    |
| 联系人       | 张三                     |
| 联系电话     | 010-12345678             |
| 行业         | 政务/智慧城市            |

## 特定资格要求 ⚠️

> ⚡ **甲级测绘资质**
> ⚡ **ISO 9001质量管理体系认证**
> ⚡ **近三年内具有同类项目业绩**

## 评分办法

### 综合评分法

| 评审因素 | 分值权重 | 评分标准     |
| -------- | -------- | ------------ |
| 商务标   | 30分     | 详见打分细则 |
| 技术标   | 50分     | 详见打分细则 |
| 价格分   | 20分     | 详见打分细则 |

#### 商务标打分细则（30分）

- 企业资质（5分）：甲级资质5分，乙级3分...
- 业绩案例（10分）：每提供一个同类项目得2分，最高10分...
- 售后服务（5分）：...
- 项目团队（10分）：...

#### 技术标打分细则（50分）

- 技术方案（20分）：...
- 实施计划（15分）：...
- 质量保障（15分）：...

#### 价格分计算方式（20分）

- 公式：价格分 = (评标基准价/投标报价) × 权重系数
- 基准价：有效投标报价的平均值

## 视为无效投标的情形 ⚠️

> 🚫 投标文件未按要求密封或签署盖章
> 🚫 投标保证金未在规定时间内提交
> 🚫 投标报价超过预算金额
> 🚫 投标文件逾期送达
> 🚫 未提供相关资质证书原件
> 🚫 存在串通投标行为
> 🚫 投标文件重大偏离招标文件要求

## 附件下载

- [招标文件.pdf](./招标文件.pdf)
- [技术参数.docx](./技术参数.docx)

## 公告内容

（完整的招标公告正文）
```

## 注意事项

1. **附件时效性**：政府采购网附件链接通常当天有效，需要在抓取后立即下载
2. **防爬机制**：部分页面需要使用 Puppeteer 模拟浏览器访问
3. **登录限制**：部分招标文件需要供应商账号登录才能下载
4. **定时频率**：建议10-30分钟，避免被封禁

## 依赖

- Node.js
- Puppeteer
- cron (OpenClaw内置)
