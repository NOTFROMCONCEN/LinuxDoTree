# linuxdotree

`linuxdotree` 是一个跨浏览器扩展工程，用来把 `linux.do` 的帖子链接自动切换到树形评论页。

核心行为：

- 访问 `/t/` 帖子页时，自动跳转到 `/n/`
- 自动清理帖子链接末尾的楼层号
- 默认补上 `?sort=old`
- 拦截站内 SPA 点击，保持树形评论体验
- 允许用户在扩展选项页里开关功能

支持浏览器：

- Chrome
- Microsoft Edge
- Firefox

## 目录结构

- `src/common/`：共享脚本和选项页
- `src/common/icons/`：扩展图标资源
- `src/manifests/`：三端浏览器 manifest 模板
- `scripts/`：构建辅助脚本
- `dist/`：构建后的浏览器扩展目录
- `packages/`：打包后的 zip 文件
- `build.ps1`：一键构建脚本

## 本地构建

在 PowerShell 中执行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\build.ps1
```

如需指定版本号：

```powershell
.\build.ps1 -Version 1.2.4-beta.1
```

构建后会生成：

- `dist/chrome`
- `dist/edge`
- `dist/firefox`
- `packages/linuxdotree-chrome-<version>.zip`
- `packages/linuxdotree-edge-<version>.zip`
- `packages/linuxdotree-firefox-<version>.zip`

## 加载方式

### Chrome

1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选择 `dist/chrome`

### Edge

1. 打开 `edge://extensions`
2. 开启“开发人员模式”
3. 选择“加载解压缩的扩展”
4. 选择 `dist/edge`

### Firefox

开发调试：

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击“临时载入附加组件”
3. 选择 `dist/firefox/manifest.json`

正式发布建议上传打包后的 zip 到 AMO。

## 更新支持

不同浏览器的自动更新方式不一样：

- Chrome：发布到 Chrome Web Store 后，浏览器会自动更新
- Edge：发布到 Edge Add-ons 后，浏览器会自动更新
- Firefox：发布到 AMO 后，浏览器会自动更新

如果你想做“自托管更新”：

- Chrome / Edge 需要商店发布或自建更新服务与已签名 CRX，流程较复杂
- Firefox 可额外配置 `browser_specific_settings.gecko.update_url` 指向你自己的更新清单

当前工程已经把版本号统一收口到 `build.ps1`，后续发版只需要：

1. 修改或传入新的版本号
2. 重新执行 `.\build.ps1`
3. 上传对应浏览器商店的新包

图标也会在构建时自动生成，无需单独处理。

当前建议使用 beta 版本号迭代，例如：

- `1.2.4-beta.1`
- `1.2.4-beta.2`
- `1.2.5-beta.1`

构建时会自动转换为浏览器可接受的 `manifest.version`：

- `1.2.4-beta.1` -> `1.2.4.1`
- `1.2.4-beta.2` -> `1.2.4.2`

同时保留 `version_name` 显示原始 beta 标识。

## 可配置项

在扩展选项页中可以控制：

- 是否自动跳转到树形评论页
- 是否强制补上 `sort=old`
- 是否拦截站内帖子链接点击
- 是否允许点击 `View as flat` 回到平铺模式

扩展弹窗里还提供：

- 一键启用或停用核心行为
- 快速切换排序和回到平铺模式策略
- 快速打开完整设置页

## 说明

扩展默认只作用于 `https://linux.do/*`。
