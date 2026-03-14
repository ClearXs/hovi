#!/usr/bin/env python3
"""
Mermaid图表渲染脚本
将Mermaid格式的图表渲染成SVG或PNG图片
"""

import argparse
import base64
import os
import subprocess
import sys
from pathlib import Path


def install_dependencies():
    """检查并安装依赖"""
    try:
        import requests
    except ImportError:
        print("正在安装依赖...")
        subprocess.run([sys.executable, "-m", "pip", "install", "requests", "-q"])
        import requests

    try:
        import markdown
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "markdown", "-q"])
        import markdown


def render_mermaid_to_svg(mermaid_code: str, output_path: str = None) -> str:
    """
    使用Mermaid官方在线API渲染图表为SVG
    """
    import requests

    url = "https://mermaid.ink/svg"

    # 清理Mermaid代码
    mermaid_code = mermaid_code.strip()
    # 移除markdown代码块标记
    if mermaid_code.startswith("```mermaid"):
        mermaid_code = mermaid_code[11:]
    if mermaid_code.startswith("```"):
        mermaid_code = mermaid_code[3:]
    if mermaid_code.endswith("```"):
        mermaid_code = mermaid_code[:-3]

    # URL编码
    import urllib.parse
    encoded = urllib.parse.quote(mermaid_code)

    try:
        response = requests.get(f"{url}?code={encoded}", timeout=30)

        if response.status_code == 200:
            svg_content = response.text

            if output_path:
                Path(output_path).write_text(svg_content, encoding='utf-8')
                print(f"SVG已保存到: {output_path}")

            return svg_content
        else:
            print(f"渲染失败: {response.status_code}")
            return None

    except Exception as e:
        print(f"渲染错误: {e}")
        return None


def render_mermaid_to_png(mermaid_code: str, output_path: str = None, scale: int = 2) -> bytes:
    """
    将Mermaid渲染为PNG
    1. 先渲染为SVG
    2. 使用Cairosvg或直接用API
    """
    # 尝试使用在线API直接生成PNG
    import requests
    import urllib.parse

    url = "https://mermaid.ink/img"

    mermaid_code = mermaid_code.strip()
    if mermaid_code.startswith("```mermaid"):
        mermaid_code = mermaid_code[11:]
    if mermaid_code.startswith("```"):
        mermaid_code = mermaid_code[3:]
    if mermaid_code.endswith("```"):
        mermaid_code = mermaid_code[:-3]

    encoded = base64.b64encode(mermaid_code.encode('utf-8')).decode('utf-8')

    try:
        # 使用base64编码的API
        response = requests.get(f"{url}/b64/{encoded}", timeout=30)

        if response.status_code == 200:
            png_data = response.content

            if output_path:
                Path(output_path).write_bytes(png_data)
                print(f"PNG已保存到: {output_path}")

            return png_data
        else:
            print(f"PNG渲染失败: {response.status_code}")
            # 回退到SVG
            svg = render_mermaid_to_svg(mermaid_code, output_path.replace('.png', '.svg') if output_path else None)
            if svg:
                print(f"已保存为SVG格式: {output_path.replace('.png', '.svg')}")
            return None

    except Exception as e:
        print(f"PNG渲染错误: {e}")
        return None


def render_mermaid_file(input_file: str, output_file: str = None, format: str = "svg"):
    """
    渲染Mermaid文件
    """
    # 读取输入文件
    input_path = Path(input_file)
    if not input_path.exists():
        print(f"输入文件不存在: {input_file}")
        return False

    mermaid_code = input_path.read_text(encoding='utf-8')

    # 确定输出文件
    if not output_file:
        output_file = str(input_path.with_suffix(f'.{format}'))

    # 渲染
    if format.lower() == "svg":
        result = render_mermaid_to_svg(mermaid_code, output_file)
    elif format.lower() == "png":
        result = render_mermaid_to_png(mermaid_code, output_file)
    else:
        print(f"不支持的格式: {format}")
        return False

    return result is not None


def main():
    parser = argparse.ArgumentParser(description="Mermaid图表渲染工具")
    parser.add_argument("input", help="Mermaid文件路径或Mermaid代码")
    parser.add_argument("-o", "--output", help="输出文件路径")
    parser.add_argument("-f", "--format", choices=["svg", "png"], default="svg", help="输出格式")
    parser.add_argument("--code", action="store_true", help="将输入作为Mermaid代码而不是文件路径")

    args = parser.parse_args()

    if args.code:
        # 直接渲染代码
        if args.format == "svg":
            render_mermaid_to_svg(args.input, args.output)
        else:
            render_mermaid_to_png(args.input, args.output)
    else:
        # 渲染文件
        render_mermaid_file(args.input, args.output, args.format)


if __name__ == "__main__":
    main()
