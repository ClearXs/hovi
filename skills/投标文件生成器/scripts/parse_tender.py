#!/usr/bin/env python3
"""
招标文件解析脚本
解析PDF/URL/文本格式的招标文件，提取关键信息并输出Markdown格式
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("请安装依赖: pip install requests beautifulsoup4")
    sys.exit(1)

try:
    from pypdf import PdfReader
except ImportError:
    print("请安装依赖: pip install pypdf")
    sys.exit(1)


class TenderParser:
    """招标文件解析器"""

    def __init__(self):
        self.tender_info = {
            "project_basic": {},
            "qualification": {},
            "scoring": {},
            "technical": {},
            "business": {}
        }

    def parse_file(self, file_path: str) -> str:
        """解析文件"""
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")

        suffix = path.suffix.lower()

        if suffix == '.pdf':
            return self._parse_pdf(file_path)
        elif suffix in ['.txt', '.md']:
            return self._parse_text(file_path)
        else:
            raise ValueError(f"不支持的文件格式: {suffix}")

    def parse_url(self, url: str) -> str:
        """解析URL"""
        return self._parse_web(url)

    def parse_text(self, text: str) -> str:
        """解析文本"""
        return self._extract_info(text)

    def _parse_pdf(self, pdf_path: str) -> str:
        """解析PDF文件"""
        reader = PdfReader(pdf_path)
        full_text = ""

        for page in reader.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"

        return self._extract_info(full_text)

    def _parse_text(self, file_path: str) -> str:
        """解析文本文件"""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return self._extract_info(content)

    def _parse_web(self, url: str) -> str:
        """解析网页"""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, headers=headers, timeout=30)
            response.encoding = 'utf-8'

            soup = BeautifulSoup(response.text, 'html.parser')

            # 移除脚本和样式
            for script in soup(["script", "style"]):
                script.decompose()

            text = soup.get_text()
            lines = (line.strip() for line in text.splitlines())
            text = '\n'.join(line for line in lines if line)

            return self._extract_info(text)
        except Exception as e:
            return f"网页解析失败: {str(e)}"

    def _extract_info(self, text: str) -> str:
        """从文本中提取关键信息"""
        self._extract_project_basic(text)
        self._extract_qualification(text)
        self._extract_scoring(text)
        self._extract_technical(text)
        self._extract_business(text)

        return self._generate_markdown()

    def _extract_project_basic(self, text: str):
        """提取项目基本信息"""
        patterns = {
            "项目名称": r"(?:项目名称|项目名称：|项目名)\s*[:：]\s*(.+?)(?:\n|$)",
            "项目编号": r"(?:项目编号|招标编号|编号)\s*[:：]\s*(.+?)(?:\n|$)",
            "招标单位": r"(?:招标单位|采购单位|甲方|委托方)\s*[:：]\s*(.+?)(?:\n|$)",
            "预算金额": r"(?:预算金额|预算|采购预算|最高限价)\s*[:：]\s*(?:人民币|¥|\$)?\s*([\d,.]+\s*(?:万元|元|万)?)",
            "投标截止": r"(?:投标截止|截止时间|递交截止|提交截止)\s*[:：]\s*(.+?)(?:\n|$)",
            "开标时间": r"(?:开标时间|开标日期)\s*[:：]\s*(.+?)(?:\n|$)",
            "中标数量": r"(?:中标数量|中标人家数|入围数量)\s*[:：]\s*(.+?)(?:\n|$)",
            "服务期限": r"(?:服务期限|合同期限|工期|交付时间)\s*[:：]\s*(.+?)(?:\n|$)",
        }

        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                self.tender_info["project_basic"][key] = match.group(1).strip()

    def _extract_qualification(self, text: str):
        """提取资质要求"""
        # 投标人资格
        qual_match = re.search(
            r"(?:投标人资格|投标人要求|资格要求)\s*[:：]?\s*(.+?)(?:\n\n|\n(?=\d+\.)|$)",
            text, re.DOTALL | re.IGNORECASE
        )
        if qual_match:
            self.tender_info["qualification"]["投标人资格"] = qual_match.group(1).strip()

        # 资质证书要求
        cert_patterns = [
            r"(?:资质证书|资质要求)\s*[:：]\s*(.+?)(?:\n|$)",
            r"(\d+级资质|甲级|乙级|特级)",
        ]
        for pattern in cert_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                self.tender_info["qualification"]["资质证书"] = match.group(1).strip()

        # 业绩要求
        perf_match = re.search(
            r"(?:业绩要求|项目业绩|类似业绩)\s*[:：]\s*(.+?)(?:\n|$)",
            text, re.IGNORECASE
        )
        if perf_match:
            self.tender_info["qualification"]["业绩要求"] = perf_match.group(1).strip()

    def _extract_scoring(self, text: str):
        """提取评分标准"""
        # 评分办法
        method_match = re.search(
            r"(?:评分办法|评标办法|评审办法)\s*[:：]\s*(.+?)(?:\n|$)",
            text, re.IGNORECASE
        )
        if method_match:
            self.tender_info["scoring"]["评分办法"] = method_match.group(1).strip()

        # 评分因素及权重
        scoring_section = re.search(
            r"(?:评分标准|评分因素|评审指标).*?(?:\n\n|\n(?=\d+\.)|$)",
            text, re.DOTALL | re.IGNORECASE
        )
        if scoring_section:
            self.tender_info["scoring"]["评分因素"] = scoring_section.group(0).strip()

    def _extract_technical(self, text: str):
        """提取技术要求"""
        # 采购需求
        req_match = re.search(
            r"(?:采购需求|技术要求|功能需求|服务内容)\s*[:：]?\s*(.+?)(?:\n\n|\n(?=\d+\.)|$)",
            text, re.DOTALL | re.IGNORECASE
        )
        if req_match:
            self.tender_info["technical"]["采购需求"] = req_match.group(1).strip()

        # 技术规格
        spec_match = re.search(
            r"(?:技术规格|规格参数|技术参数)\s*[:：]\s*(.+?)(?:\n|$)",
            text, re.IGNORECASE
        )
        if spec_match:
            self.tender_info["technical"]["技术规格"] = spec_match.group(1).strip()

    def _extract_business(self, text: str):
        """提取商务要求"""
        # 投标保证金
        deposit_match = re.search(
            r"(?:投标保证金|保证金)\s*[:：]\s*(.+?)(?:\n|$)",
            text, re.IGNORECASE
        )
        if deposit_match:
            self.tender_info["business"]["投标保证金"] = deposit_match.group(1).strip()

        # 付款方式
        payment_match = re.search(
            r"(?:付款方式|支付方式|结算方式)\s*[:：]\s*(.+?)(?:\n|$)",
            text, re.IGNORECASE
        )
        if payment_match:
            self.tender_info["business"]["付款方式"] = payment_match.group(1).strip()

    def _generate_markdown(self) -> str:
        """生成Markdown格式输出"""
        md = ["# 招标文件解析结果\n"]

        # 项目基本信息
        md.append("## 一、项目基本信息\n")
        if self.tender_info["project_basic"]:
            for key, value in self.tender_info["project_basic"].items():
                md.append(f"- **{key}**: {value}\n")
        else:
            md.append("- (未提取到项目基本信息)\n")

        # 资质要求
        md.append("\n## 二、资质要求\n")
        if self.tender_info["qualification"]:
            for key, value in self.tender_info["qualification"].items():
                md.append(f"### {key}\n{value}\n")
        else:
            md.append("- (未提取到资质要求)\n")

        # 评分标准
        md.append("\n## 三、评分标准\n")
        if self.tender_info["scoring"]:
            for key, value in self.tender_info["scoring"].items():
                md.append(f"### {key}\n{value}\n")
        else:
            md.append("- (未提取到评分标准)\n")

        # 技术要求
        md.append("\n## 四、技术要求\n")
        if self.tender_info["technical"]:
            for key, value in self.tender_info["technical"].items():
                md.append(f"### {key}\n{value}\n")
        else:
            md.append("- (未提取到技术要求)\n")

        # 商务要求
        md.append("\n## 五、商务要求\n")
        if self.tender_info["business"]:
            for key, value in self.tender_info["business"].items():
                md.append(f"### {key}\n{value}\n")
        else:
            md.append("- (未提取到商务要求)\n")

        return "".join(md)


def main():
    parser = argparse.ArgumentParser(description="招标文件解析工具")
    parser.add_argument("input", help="招标文件路径/URL/文本")
    parser.add_argument("-o", "--output", help="输出文件路径")
    parser.add_argument("--text", action="store_true", help="将输入作为文本处理")

    args = parser.parse_args()

    tender = TenderParser()

    try:
        if args.text:
            result = tender.parse_text(args.input)
        elif args.input.startswith(("http://", "https://")):
            result = tender.parse_url(args.input)
        else:
            result = tender.parse_file(args.input)

        if args.output:
            Path(args.output).write_text(result, encoding='utf-8')
            print(f"解析结果已保存到: {args.output}")
        else:
            print(result)

    except Exception as e:
        print(f"解析失败: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
