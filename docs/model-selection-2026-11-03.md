# 模型选择接入 · 2026-11-03

版本：1.1.1。复用生图服务已有 GET /api/workflows/detail 的 main_model，以及 POST /api/jobs 的 params.main_model。生图服务本身没有改动。

修改：server/service.mjs；extension/image-panel.js；extension/index.js；manifest.json；package.json；tests/panel.test.mjs；tests/client.test.mjs；tests/server.test.mjs；README.md。

部署：/data/sillytavern/plugins/stimagegen/service.mjs；/data/sillytavern/extensions/STimageGen/manifest.json、extension/index.js、extension/image-panel.js。已重启 sillytavern。

备份：/var/backups/stimagegen-models-20261103T135521Z，按 server/、extension/ 和 manifest.json 保存原文件。部署脚本具备基线校验、无活动绘图任务检查及异常恢复。

验证：本地与线上容器均 15 项测试通过；JavaScript 语法检查通过；部署后通过插件 ImageService 实际查询 Anima 工作流，返回当前 anima_turboV11.safetensors 和 15 个主模型文件；公网 manifest 与前端模块已更新为 1.1.1。未实际提交 GPU 生图，未在用户浏览器进行交互测试。

界面：工作流与偏好 → 主模型文件。默认沿用工作流，也可选择文件，按用户和工作流保存；自动生图使用同一选择。旧选择失效或模型列表读取失败时停止提交，避免悄悄改用其他模型。
