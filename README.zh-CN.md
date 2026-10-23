# Diffloom

**找到变化，保留上下文，让数据留在自己手中。**

Diffloom 是一个本地优先、在浏览器中运行的 JSON 对比工作台。用它检查 API 响应、配置变更或 package manifest，在并排编辑器中查看结构化差异，无须把文档上传到服务端。

[English](README.md) · [贡献指南](CONTRIBUTING.md) · [安全政策](SECURITY.md) · [MIT 许可](LICENSE)

![Diffloom 的并排 JSON 编辑器与结构化差异报告](docs/screenshot.png)

## 不只是文本 diff

- **两侧均可编辑。** JSON 语法高亮；内置 API 响应、配置与 package manifest 示例；支持格式化、导入、复制、交换和重置。
- **准备好后再比较。** 点击 **Compare**，或按 **Ctrl/Cmd + Enter**。结果来自最近一次主动比较，而不是每次按键。
- **聚焦有意义的变化。** 搜索 JSON Pointer 路径，按变化类型筛选。忽略某个路径时，该路径自身及其所有后代都会被排除。
- **选择数组匹配方式。** 按索引比较，或按唯一 `id` 匹配对象并忽略顺序变化。ID 缺失或重复时退回索引匹配。匹配项与删除项使用 Before 一侧索引，新增项使用 After 一侧索引。
- **导出聚焦的报告。** Markdown 与 JSON 报告仅包含当前筛选后的子集。导出的敏感值脱敏选项默认勾选，不改变输入或页面上显示的结果。

界面语言为英语。对象键的排列顺序不构成语义差异；本工具不是逐行文本比较器。

## 本地运行

需要 **Node.js 22.x（至少 22.12）、24.x，或 26 及更新版本**，以及 npm（版本范围：`^22.12.0 || ^24.0.0 || >=26.0.0`）。此范围与包括 Vitest 5 在内的开发工具链保持一致。在项目目录中执行：

```sh
npm install
npm run dev
```

打开 Vite 输出的本地地址。贡献者首次安装使用 `npm install`；自动构建使用 `npm ci`，按 lockfile 安装锁定的依赖版本。

构建并预览生产版本：

```sh
npm run build
npm run preview
```

静态产物位于 `dist/`，无须后端、账号或数据库。项目没有运行时包依赖；TypeScript、Vite 与测试工具均为开发依赖。

## 使用方式

1. 将 JSON 粘贴到 **Before** 和 **After**，导入文件，或载入内置示例。
2. 按需选择数组匹配策略，并填写需要忽略的 JSON Pointer 路径。
3. 点击 **Compare**，或按 **Ctrl/Cmd + Enter**。
4. 按路径和变化类型筛选结果，再按需导出当前可见子集。

### 路径与数组身份

路径遵循 [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901)：`/profile/name` 表示对象属性，`/items/0` 表示数组元素，`~1` 转义 `/`，`~0` 转义 `~`。忽略 `/profile` 会排除该节点及其所有后代，但不会排除 `/profiles`。

索引模式比较相同位置的元素。唯一 `id` 模式适合顺序没有业务意义的对象数组：ID 必须是每个数组内唯一的字符串或数字，字符串 `"1"` 与数字 `1` 不视为同一 ID。仅重排不产生差异；存在非对象元素，或 ID 缺失、无效、重复时，退回索引模式。报告中，匹配项与删除项沿用 Before 索引，新增项使用 After 索引。因此，这些路径用于定位比较结果，并非可依序应用的补丁指令。

### 输入边界

只接受**严格 JSON**，不支持 JSONC、JSON5、注释或尾随逗号。每侧输入上限为 **1 MiB UTF-8 文本**，最大嵌套深度为 **128**。限制用于减少意外的大体量处理，不代表所有上限内的文档都能快速完成比较。单纯的格式变化和对象键顺序变化不会产生语义差异。

数值使用 JavaScript 的 **IEEE 754 双精度**表示，而非任意精度运算。普通小数允许输入，精度与舍入遵循 JavaScript 行为，因此数学上不同的小数字面量可能在解析后被比较为相等。工具会拒收非有限解析结果（例如 `1e400`）、解析后为整数但超出安全范围 **−9007199254740991 至 9007199254740991** 的数值，以及下溢为零的非零数字字面量。长数值 ID 请使用 JSON 字符串，以便准确保留。本工具不是任意精度数值 diff。

## 数据留在当前页面

比较在浏览器中进行。应用**没有后端、账号、分析追踪或持久化存储**。文档仅保存在内存中，刷新页面会重置工作区；离开前请自行保存需要保留的内容。导入读取本地文件，导出将文件下载到你的设备。

运行时除了加载自身静态资源外，应用不发起其他网络请求。如果部署在远程主机，该主机仍会收到正常的资源请求。不依赖外部图片、网络字体或追踪徽章。项目没有 service worker，不是可离线安装的 PWA；首次访问或刷新仍可能需要服务器。

### 导出脱敏只是辅助，不是保证

导出时的脱敏复选框**默认启用**，会在导出数据中递归遮盖以下敏感键对应的值：

`password`、`token`、`secret`、`api_key`、`apiKey`、`authorization`、`access_token`、`refresh_token`。

这只是有限的、基于键名的检测方式，无法可靠识别其他名字下的凭证、普通字符串中嵌入的秘密，以及路径和上下文中的敏感信息。它**只影响导出**，不影响编辑器、屏幕上的报告或普通复制操作。分享前必须自行检查报告，不能将脱敏视为完整的秘密扫描器。详见[安全政策](SECURITY.md)。

## 开发与检查

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 本地开发服务器 |
| `npm run typecheck` | 运行 TypeScript 类型检查，不生成文件 |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run test:e2e` | 运行 Playwright 浏览器测试 |
| `npm run build` | 类型检查并构建生产静态资源 |
| `npm run preview` | 本地预览生产构建 |
| `npm run check` | 类型检查、单元测试及生产构建；不含浏览器测试 |

端到端测试前先安装 Chromium：

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

Playwright 配置中的 web server 会负责构建并启动应用。浏览器测试包含基于 axe 的自动无障碍检查；这些检查不能替代完整的无障碍审计，也不代表符合完整 WCAG 标准。CI 在 Ubuntu 与 Node.js 22 下，将类型检查／单元测试／构建和端到端测试分成独立任务。以上是验证方式说明，不表示任何一次具体运行已经通过。

Windows 用户可以使用本机已经安装的 Microsoft Edge，替代 Playwright 下载的 Chromium。在 PowerShell 中执行：

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm run test:e2e
```

### 生成文档截图

在一个终端中构建并启动预览服务器：

```sh
npm run build
npm run preview -- --port 4180
```

另开一个终端，在项目目录中执行：

```sh
node scripts/capture.mjs
```

脚本会生成 `docs/screenshot.png` 和 `docs/screenshot-mobile.png`。默认预览地址为 `http://127.0.0.1:4180`；可选设置 `DIFFLOOM_PREVIEW_URL` 指向其他预览地址，或将 `PLAYWRIGHT_CHANNEL` 设为 `msedge` 以使用本机 Edge。不指定 channel 时，请先按上文命令安装 Chromium。PowerShell 示例：

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
$env:DIFFLOOM_PREVIEW_URL = "http://127.0.0.1:4180"
node scripts/capture.mjs
```

### 项目结构

```text
src/
  main.ts          界面与交互逻辑
  style.css        工作台布局和视觉样式
  examples.ts      内置对比示例
  lib/json.ts      JSON 验证与比较逻辑
  lib/export.ts    安全报告生成与导出脱敏
tests/
  unit/            Vitest 比较行为测试
  e2e/             Playwright 浏览器流程测试
```

开发准备、行为约定与 PR 要求请参见[贡献指南](CONTRIBUTING.md)。

## 发布到 GitHub Pages

仓库名称、所有者以及是否发布都由你决定；本文不假设已经存在在线仓库或演示地址。

[Pages 工作流](.github/workflows/pages.yml) **仅手动触发**（`workflow_dispatch`）。在你选择的 GitHub 仓库中启用 Actions，将 **Settings → Pages** 的构建来源设为 **GitHub Actions**，再到 Actions 页面手动运行 **Deploy to GitHub Pages**。工作流会安装锁定依赖、构建 `dist/`、上传 Pages artifact，并通过 Pages environment 部署。成功后使用 GitHub 显示的部署地址；如果设置了环境审批，仍需按要求批准。

Vite 使用相对 base `./`，使生成的资源地址既适用于仓库子路径，也适用于域名根路径。也可以将 `dist/` 的内容部署到其他静态托管服务。推荐通过 Web 服务器访问，而不是直接打开 HTML 文件。

## 许可

[MIT](LICENSE) · Copyright © 2026 Diffloom contributors.
