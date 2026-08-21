# 国内数据迁移与回滚手册

## 受保护的正式环境

- 正式应用：`yida-wardrobe`
- veFaaS Application ID：`5a633b9cd680`
- Backing Function ID：`apv3rdwq`
- 正式站：`https://s877em6sdkp7rquqv523o.apigateway-cn-beijing.volceapi.com/`
- 迁移期间不直接修改正式应用、正式函数或原 Supabase 数据。

## 独立迁移副本

- 副本应用：`yida-wardrobe-migration-staging`
- veFaaS Application ID：`25f903b1fee6`
- Backing Function ID：`lk1jospc`
- 副本站：`https://supg0ov08gg1m0bqd8tv2.apigateway-cn-beijing.volceapi.com/`
- Git 分支：`codex/domestic-migration-staging`
- 副本启用 `YIDA_STAGING_MODE=true`，只允许开发者邮箱访问。

副本当前连接原 Supabase，只用于迁移前的基线测速。创建国内数据库后，只修改副本的数据库连接；正式站继续读取原 Supabase，直到数据校验和功能验收全部通过。

## 代码恢复点

- GitHub 分支：`backup/pre-domestic-migration-20260821`
- Git 标签：`pre-domestic-migration-20260821`
- 本地完整 bundle：`/Users/Admin/Documents/Codex/backups/yida-pre-domestic-migration-20260821.bundle`
- 恢复提交：`5b8dedca168908134fb772cb1a4172294194fbd7`

## 迁移切换原则

1. 原 Supabase 始终作为迁移源保留，不覆盖、不删除。
2. 在副本应用中完成国内数据库、认证和 TOS 验收。
3. 切换前对原库做最终快照，并暂停写入一个短维护窗口。
4. 数据总量、用户数量、图片数量和关键抽样记录核对一致后才允许切换正式站。
5. 正式站只通过环境变量切换目标，原环境变量另行安全保存，不写入 Git。
6. 切换后保留原 Supabase 只读至少 14 天。
7. 若出现登录、保存、图片或效果图异常，立即把正式环境变量切回原 Supabase，并发布上一稳定 revision。

## 基线测速项目

- 保存：`auth`、`parse`、`database`，需要重载时额外记录 `mutation` 和 `reload`。
- 效果图：`auth`、`profile_db`、`garments_db`、`cache`、`allowance`、`image_read`、`ai_generate_review`、`image_upload`、`usage_record`。
- 日志事件名：`yida_performance`。
- 响应头：`Server-Timing` 和 `X-Yida-Request-Id`。

测速日志不记录 Token、API Key、邮箱、图片或用户输入正文。
