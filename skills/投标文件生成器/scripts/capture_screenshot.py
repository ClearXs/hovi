#!/usr/bin/env python3
"""
网页截图脚本
使用Playwright截取网页截图，可用于代码原型UI截图
"""

import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path


def check_playwright():
    """检查Playwright是否安装"""
    try:
        from playwright.async_api import async_playwright
        return True
    except ImportError:
        return False


def install_playwright():
    """安装Playwright"""
    print("正在安装Playwright...")
    subprocess.run([sys.executable, "-m", "pip", "install", "playwright", "-q"], check=True)
    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
    print("Playwright安装完成")


async def capture_screenshot(url: str, output_path: str, options: dict = None):
    """
    截取网页截图

    Args:
        url: 网页URL或本地文件路径
        output_path: 输出图片路径
        options: 截图选项
    """
    from playwright.async_api import async_playwright

    default_options = {
        "width": 1280,
        "height": 720,
        "full_page": False,
    }

    if options:
        default_options.update(options)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            viewport={"width": default_options["width"], "height": default_options["height"]}
        )

        # 支持本地文件和URL
        if url.startswith("http://") or url.startswith("https://"):
            await page.goto(url)
        else:
            # 本地文件需要转换为file://协议
            abs_path = os.path.abspath(url)
            await page.goto(f"file://{abs_path}")

        # 等待页面加载完成
        await page.wait_for_load_state("networkidle")

        # 截图
        await page.screenshot(path=output_path, full_page=default_options["full_page"])

        await browser.close()

        print(f"截图已保存到: {output_path}")
        return output_path


async def capture_element_screenshot(url: str, selector: str, output_path: str):
    """截取特定元素的截图"""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        if url.startswith("http://") or url.startswith("https://"):
            await page.goto(url)
        else:
            abs_path = os.path.abspath(url)
            await page.goto(f"file://{abs_path}")

        await page.wait_for_load_state("networkidle")

        # 截取元素
        element = await page.query_selector(selector)
        if element:
            await element.screenshot(path=output_path)
            print(f"元素截图已保存到: {output_path}")
        else:
            print(f"未找到元素: {selector}")

        await browser.close()


async def start_local_server(directory: str, port: int = 3000):
    """启动本地HTTP服务器"""
    import http.server
    import socketserver

    os.chdir(directory)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass  # 禁用日志

    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"本地服务器已启动: http://localhost:{port}")
        httpd.serve_forever()


def main():
    parser = argparse.ArgumentParser(description="网页截图工具")
    parser.add_argument("url", help="网页URL或本地HTML文件路径")
    parser.add_argument("-o", "--output", default="screenshot.png", help="输出文件路径")
    parser.add_argument("-w", "--width", type=int, default=1280, help="视口宽度")
    parser.add_argument("-h", "--height", type=int, default=720, help="视口高度")
    parser.add_argument("-f", "--full-page", action="store_true", help="截取整个页面")
    parser.add_argument("-s", "--selector", help="截取特定CSS选择器的元素")
    parser.add_argument("--port", type=int, default=3000, help="本地服务器端口")

    args = parser.parse_args()

    # 检查Playwright
    if not check_playwright():
        install_playwright()

    # 根据参数选择截图方式
    if args.selector:
        asyncio.run(capture_element_screenshot(args.url, args.selector, args.output))
    else:
        options = {
            "width": args.width,
            "height": args.height,
            "full_page": args.full_page,
        }
        asyncio.run(capture_screenshot(args.url, args.output, options))


if __name__ == "__main__":
    main()
