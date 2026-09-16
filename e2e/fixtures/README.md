# PDF阅读器的软件测试样例

`viewer-test.pdf` 来自 Mozilla PDF.js 的 `test/pdfs/basicapi.pdf`，标题为 **Basic API Test**，共3页、105779字节。它是公开的软件测试文件，不是医学资料，也不是对本地教材校验结果的替代。

- 固定来源：<https://github.com/mozilla/pdf.js/blob/4c9b65f0e13fd290c326b38cb97436fa50b930f5/test/pdfs/basicapi.pdf>
- SHA-256：`925853d98d67d5dae7473c635f932958e1695ce1029d23b2ecd2531cb65f1f14`
- PDF.js上游许可证保存在 `PDFJS-LICENSE`。
- 测试只在生产构建目录临时放置按浏览器区分的样例PDF，应用内的资料库清单不会被替换或改写；样例清单通过浏览器测试请求拦截提供。
- 云端用该样例测试真实PDF解析、翻页、缩放、失败重试及HTTP分段响应。5份医学原件的完整性与首尾页验证仍保留为默认的本地检查。
