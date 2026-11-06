# 自动生图1.1.0部署记录

日期：2026-11-03（Asia/Shanghai）。

- 新增关闭/LLM判断/固定间隔模式，默认关闭；N默认5条新角色回复，参考默认最近4条用户与角色文本。
- 新增extension/automation.js，更新前端index、image-panel与manifest；后端service.mjs增加decide操作，复用原接口。
- 现有服务main.py的PromptReq增加decision_only/previous_summary字段；普通请求保持原有模板与逻辑。判断模块app/image_decision.py复用已有LLM配置，仅返回布尔值和原因。
- 更新前确认没有活动绘图任务。备份：`/var/backups/stimagegen-auto-20261103T101123Z`。
- 本地与实际ST容器均14项测试通过；纯判断模块真假布尔校验通过。
- 线上真实接口已识别判断模式，超长摘要在调用LLM前被拒绝；该模式验证没有调用真实LLM。
- 公网manifest版本1.1.0，新增自动模块、面板和入口可加载。服务正常重启。

本轮未调用真实LLM或提交GPU任务。此前Venice提示词生成读超时、Colab18188隧道离线，完整判断和绘图仍待上游连通后实测。
