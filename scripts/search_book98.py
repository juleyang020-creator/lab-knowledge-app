#!/usr/bin/env python3
"""在 book98 完整版 MD 中检索并映射回 PDF 物理页（只读源，不写入源目录）。

完整版 MD 内嵌页标 `<!-- 源PDF页: 0164；书内页码: 143 -->`，页标位于其所标页面
内容的**开始处**。行 X 的页码 = 其前最近一个页标的页号。
经回源 PDF 文本层复核（2026-09-16）：L5488 葡萄糖临床意义句→p162 ✓，
L9207 ALT 句→p269 ✓，L5693 HbA1c 影响因素段→p168 ✓（页169以“(二)糖化白蛋白”开头）。
已按此读法通过 PDF 文本层逐条验证：L5488→p162、L5693→p168（p168 含
“HbA1c的形成是不可逆”，p169 以“(二)糖化白蛋白”开头）、L9207→p269，均吻合。
"""
import bisect
import re
import sys
from pathlib import Path

BOOK = Path(
    "/Users/juleyang/Documents/资料库/检验科知识库/98-临床生物化学检验技术-人卫2025-第2版"
)
FULL = BOOK / "临床生物化学检验技术_完整版.md"
LINES = FULL.read_text().splitlines()

MARKER = re.compile(r"<!-- 源PDF页: (\d+)")
MARKERS = [
    (i, int(m.group(1)))
    for i, line in enumerate(LINES)
    if (m := MARKER.search(line))
]


def find_page(line_idx0: int) -> int | None:
    """行属于其前最近一个页标所标的页（页标在页面内容开始处）。"""
    pos = bisect.bisect_right(MARKERS, (line_idx0, 10**9)) - 1
    if pos < 0:
        return None
    return MARKERS[pos][1]


def show_context(line_no1: int, before: int = 2, after: int = 30) -> None:
    for i in range(max(0, line_no1 - 1 - before), min(len(LINES), line_no1 + after)):
        print(f"p{find_page(i)}\tL{i+1}\t{LINES[i][:100]}")


def search(pattern: str, max_hits: int = 40) -> None:
    rx = re.compile(pattern)
    hits = 0
    for i, line in enumerate(LINES):
        if rx.search(line):
            print(f"p{find_page(i)}\tL{i+1}\t{line.strip()[:90]}")
            hits += 1
            if hits >= max_hits:
                print("... (truncated)")
                return
    if hits == 0:
        print(f"(no hits for {pattern})")


if __name__ == "__main__":
    if len(sys.argv) > 3 and sys.argv[1] == "--ctx":
        show_context(int(sys.argv[2]), 0, int(sys.argv[3]))
    elif len(sys.argv) > 1 and sys.argv[1] == "--ctx":
        show_context(int(sys.argv[2]))
    else:
        for pat in sys.argv[1:]:
            print(f"===== {pat} =====")
            search(pat)
