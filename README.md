# codex4claude

让 Claude Code 通过技能直接调用 Codex，默认模型为 `gpt-6-astra`。Claude 提交任务、复核结果，Codex 负责执行。插件保存每次运行的报告和日志，并用明确的 session ID 续接对话。

不需要选择或定义 Agent。代码实现、仓库调查、算法和评审都使用同一个 `run` 入口，目标、权限和验收要求随任务传入。

## 环境与安装

- Codex CLI **≥ 0.153.4**，在 PATH 上或通过 `CODEX_BIN` 指定可执行文件；已通过 `codex login` 登录，账号可使用目标模型。
- Node **≥ 18**，零 npm 依赖。

```bash
claude --plugin-dir /path/to/codex4claude
```

运行 `/codex4claude:setup` 检查 CLI 版本、配置的模型和数据目录。检查通过不代表已经验证账号的模型访问权限；实际调用失败会显示错误。

## 提交任务

Claude 根据 `codex-delegation` 技能直接调用引擎。手动调用示例：

```bash
node scripts/codex4claude.mjs run --read-only "分析登录流程，给出代码位置"
node scripts/codex4claude.mjs run --write --effort high --prompt-file task.md
node scripts/codex4claude.mjs run --session <session-id> --write "修复刚才发现的问题"
```

任务也可通过标准输入传入。使用带引号的 heredoc 分隔符，避免任务中的反引号或 `$()` 被 shell 执行：

```bash
node scripts/codex4claude.mjs run --read-only <<'CODEX_TASK'
找出订单金额的计算入口，说明舍入规则并引用代码位置。
CODEX_TASK
```

输入优先级为 `--prompt-file > PROMPT > stdin`。参数形式接受一段用引号包住的任务；所有来源都拒绝空白任务。引擎将正文原样通过 stdin 交给 `codex exec`，保留 Codex 原生工具、项目指令和会话管理。

## 运行参数

| 参数 | 行为 |
|---|---|
| `--read-only` | 默认权限，只读 |
| `--write` | 允许在工作区修改文件 |
| `--dangerous` | 完整文件系统权限，仅用于明确授权的场景；与前两项互斥 |
| `--effort low\|medium\|high\|xhigh\|max\|ultra` | 推理深度；未指定时沿用 Codex 配置或模型默认 |
| `--fast` | 请求 Fast 模式（`service_tier=priority`），增加额度消耗，与推理深度独立 |
| `--session <id>` | 续接指定 Codex 会话 |
| `--background` | 后台运行，返回 run ID |
| `--timeout <秒>` | 前后台均适用，默认 540 秒；`0` 表示不设时限 |
| `--cd <目录>` | 指定工作区 |
| `--ephemeral` | 不持久化 Codex 会话；插件仍保留本次报告和日志 |

`ultra` 是 Codex 的“最大推理 + 自动任务委派”档位，不是 API 的 reasoning 参数。本机 Astra 模型目录已确认支持这六档。Fast 的可用性取决于模型和账号；插件不主动启用 Fast，也不覆盖用户已有的全局设置。

前台执行时，Claude 的 Bash 工具应设置 600000 ms 超时，留出引擎结束和输出报告的时间。长任务使用 `--background --timeout 0`，由调用方持续检查状态；需要结束时使用 `cancel`。

```bash
node scripts/codex4claude.mjs status
node scripts/codex4claude.mjs status <run-id> --cd /path/to/workspace
node scripts/codex4claude.mjs result <run-id> --cd /path/to/workspace
node scripts/codex4claude.mjs log <run-id> --grep "turn.failed"
node scripts/codex4claude.mjs cancel <run-id>
```

只读任务可并行，同一工作区一次只运行一个写任务。

## 报告和会话

每次调用返回 `CODEX RUN` 头行、Codex 的最终报告、包含文件和命令退出码的 `── run info ──` 尾注，以及 `LOG:` 路径。长报告在显示时截断，完整正文保存在 `last-message.txt`。

- **run ID** 对应一次引擎调用及其日志。
- **session ID** 对应 Codex 的持久对话；不同调用可以续接同一会话。

最终报告取自 Codex 的 `--output-last-message` 文件；进度消息不能作为完成依据。`ok` 表示进程正常退出、收到完成事件且产生了最终报告，仍需复核任务本身的验收结果。失败、超时和取消会保留已有证据；有持久 session ID 时，`NEXT` 给出携带工作目录和权限的续接命令。

默认数据目录为 `~/.claude/codex4claude/state/<workspace>/runs/<run-id>/`。用 `CODEX4CLAUDE_DATA` 可覆盖插件数据根目录；用 `CODEX4CLAUDE_MODEL` 可覆盖默认模型。完整事件日志保存到磁盘，不会全部注入 Claude 对话。

## 从 0.3 升级

- `run <agent> "任务"` 改为 `run "任务"`；修改任务加 `--write`。
- `--continue` 改为 `--session <id>`，session ID 可从旧报告头行获取。
- `agent define/list/show/rm`、四个转发 Agent 和四份角色模板均已移除。
- 旧运行记录仍可查询，旧 session ID 仍可续接。旧会话中的角色文本属于历史上下文；需要新的任务约定时开启新会话。
- 用户此前保存的 Agent 定义文件和历史运行数据保留，定义文件不再加载。

## 验证与官方依据

```bash
node --test scripts/test/*.test.mjs
git diff --check
```

测试使用模拟 Codex 进程，不需要登录或消耗模型额度。

适配依据核对于 2026-09-06：[Codex 0.153.4 更新记录](https://learn.chatgpt.com/docs/changelog)、[GPT-6 Astra 提示词指南](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices)、[Codex Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide)、[非交互运行文档](https://learn.chatgpt.com/docs/non-interactive-mode)。Cookbook 用于通用运行建议，模型行为以 Astra 的最新指南为准。
