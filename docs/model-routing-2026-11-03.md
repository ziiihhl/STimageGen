# 模型自动路由 · 2026-11-03

版本 1.2.0。默认根据生图参考文本由现有 LLM 分类为 anima/krea，优先选择安装的 Anima Turbo 工作流及文件，写实选择 Krea 且明确排除 Krea Anime。提供自动、指定 Anima、指定 Krea、手动四种选择；手动更改工作流或主模型后立即记住手动模式。只生成提示词时也先选模型，用当前提示词绘图则保留当前工作流/模型。

新增 extension/model-routing.js、integration/model_routing.py、tests/routing.test.mjs，更新前端、代理和测试。模型提示词复用生图服务 prompt_context.resolve_context / model_system_rules；未迁入模型模板或 LLM SDK。提示词请求携带实际 workflow_key 与 main_model。分类失败或缺少匹配模型时停止，不自动改用其他画风。

线上修改 /opt/comfy-gen-service/app/main.py，新增 app/stimagegen_model_routing.py；更新 /data/sillytavern/plugins/stimagegen/service.mjs 及前端 manifest/index/image-panel/image-service/model-routing。服务原普通 prompt 请求路径保持原行为。检查发现当前 main.py 已没有先前 decision_only 分支，使用已有 image_decision.py 恢复该可选模式，保证自动生图判断继续可用。

备份 /var/backups/stimagegen-routing-20261103T155602Z。第一次部署检查发现 1 个活动任务，未修改文件；任务完成后重新检查基线、队列和测试，才更新并重启生图服务和酒馆。

验证：18 项 JavaScript 测试通过；Python 适配器测试通过（分类校验、复用实际模型模板、拒绝未确认模型）；语法检查通过；公网文件内容哈希验证通过。

真实 LLM 分类：动漫样例返回 anima，选择 comfyui:02_Anima_Turbo.json / anima_turboV11.safetensors；摄影样例返回 krea，选择 comfyui:04_Lustify_Krea2.json / DownloadsLocal/lustifyNSFWCheckpoint_v10Krea2_3015314.safetensors。两次耗时约 1.7 秒和 1.2 秒，含模型列表查询。未提交 GPU 任务，未执行用户浏览器交互测试。
