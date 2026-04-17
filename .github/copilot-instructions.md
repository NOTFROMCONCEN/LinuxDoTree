# linuxdotree — Project Guidelines

跨浏览器扩展，将 `linux.do` 帖子页自动切换到树形评论视图（`/t/` → `/n/`）。

## 构建与运行

```powershell
# 构建全部浏览器目标（默认版本号）
.\build.ps1

# 指定版本号
.\build.ps1 -Version 1.2.4
```

构建产物在 `dist/{chrome,edge,firefox}`，打包 zip 在 `packages/`。无测试脚本，验证方式为手动加载扩展。

## 架构

```
src/common/           # 三端共享代码，由构建脚本直接复制到 dist 目录
  settings.js         # 模块入口：定义 DEFAULT_SETTINGS, normalizeSettings，挂载到 globalThis.LINUXDOTREE_SHARED
  content.js          # 主内容脚本（~1750 行），IIFE async 包裹
  popup.js            # 扩展弹窗
  options.js          # 选项页
src/manifests/        # 三端 manifest 模板，build.ps1 注入版本号后输出到 dist
```

运行时 `settings.js` 先于其他脚本加载，其他文件从 `globalThis.LINUXDOTREE_SHARED` 读取共享常量。

## 关键约定

- **跨浏览器兼容层**：所有脚本（`content.js`、`popup.js`、`options.js`）统一使用 `extensionApi`（由 `chrome ?? browser` 初始化）。
- **设置规范化**：所有写入 storage 的设置必须先经过 `normalizeSettings()` 处理，确保字段完整和 `FORCED_DISABLED_FIELDS` 始终被强制关闭。
- **防抖刷新**：`schedulePageRefresh()` 通过 `pageRefreshTimerId` 防抖，避免 MutationObserver 触发过于频繁；同理 `scheduleThreadEnhancements()` 使用 `enhancementTimerId`。
- **扩展上下文存活检测**：所有 storage 操作前先调用 `isExtensionContextAlive()` 防止扩展失效后报错。

## 已知注意事项（开发陷阱）

- `computePostTree`（content.js）先批量读取所有 `getBoundingClientRect()` 后再构建记录，不可将读取移入 `map` 回调（会重新引入逐帖回流）。
- `getNestedUrl` 仅在目标链接**没有** `sort` 参数时才注入默认排序，不会覆盖链接原有的 `sort` 值。
- `DEFAULT_SETTINGS` 唯一可信来源是 `settings.js`；`popup.js` 和 `options.js` 直接使用 `shared.DEFAULT_SETTINGS`，不应在这两个文件中再单独扩展该对象。

## 相关文档

- [README.md](../README.md) — 完整的目录结构、加载方式、构建说明
- [新功能TODO/README.md](../新功能TODO/README.md) — 功能规划与代码优化 backlog
- [更新记录.md](../更新记录.md) — 版本历史
