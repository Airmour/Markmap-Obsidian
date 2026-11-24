# Markmap Preview for Obsidian

Preview your Markdown notes as interactive Markmap mind maps in a separate Obsidian pane. Your notes are not modified.

Open a Markdown note and click the tree icon in its toolbar, or run **Open as Markmap** from the command palette. The preview updates as you edit and supports panning, zooming, and folding nodes. This plugin is available on Obsidian desktop and requires Obsidian 1.7.2 or later.

Obsidian 桌面端插件：将当前 Markdown 笔记预览为可交互的 Markmap 思维导图。预览使用独立视图，不会修改笔记内容。

## 当前功能

- 在 Markdown 笔记的视图工具栏中点击树形图标，或从命令面板运行 **Open as Markmap**，在右侧打开当前笔记的导图。
- 编辑笔记时实时更新预览；也会同步已保存的外部文件修改。
- 使用 Markmap 解析标题和列表结构；支持拖动平移、滚轮缩放和节点折叠/展开。
- 预览工具栏提供放大、缩小、适应视图、展开全部和折叠全部操作。
- Markmap 树形图标在笔记工具栏和预览标签栏中均顺时针旋转 90°。
- 空笔记会显示提示；渲染失败时会在预览状态栏显示错误。

## 技术与平台

- TypeScript、Obsidian Plugin API、esbuild。
- 使用 `@markmap/parse` 和 `@markmap/view` 渲染导图。
- `manifest.json` 将插件标记为仅支持桌面端。

## 本地开发

建议使用专用测试 Vault，避免开发中的插件影响日常笔记。

1. 将项目放入测试库的 `.obsidian/plugins/markmap-preview/` 目录。
2. 在插件目录安装依赖：

   ```sh
   npm install
   ```

3. 开发时运行监听构建；修改源码后会重新生成 `main.js`：

   ```sh
   npm run dev
   ```

4. 在 Obsidian 的 **设置 → 第三方插件** 中启用 **Markmap Preview**。首次安装或修改 `manifest.json` 后，可能需要重载 Obsidian。
5. 打开 Markdown 笔记，点击视图工具栏的树形图标，或从命令面板运行 **Open as Markmap**。

## 检查与生产构建

```sh
npm run typecheck
npm run build
```

`npm run build` 会生成供 Obsidian 加载的 `main.js`。插件目录还需包含 `manifest.json` 和 `styles.css`。

## 发布版本

1. 更新 `manifest.json` 和 `package.json` 中的版本号，并同步更新 `package-lock.json`（例如执行 `npm install --package-lock-only`）。在 `versions.json` 中添加该版本对应的最低 Obsidian 版本。
2. 提交并推送更改后，创建与 `manifest.json` 中版本号完全一致的标签，不要添加 `v` 前缀，例如：

   ```sh
   git tag -a 0.1.0 -m "0.1.0"
   git push origin 0.1.0
   ```

3. GitHub Actions 会检查版本、构建插件、生成构建来源证明，并创建包含自动生成的更新说明和 `main.js`、`manifest.json`、`styles.css` 附件的 Release 草稿。
4. 在 GitHub 的 Releases 页面检查草稿、填写更新说明，然后手动发布。仓库或组织的 Actions 策略需要允许工作流创建 Release 和生成构建来源证明。
