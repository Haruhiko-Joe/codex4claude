# codex4claude

一个把 Codex（`gpt-5.6-sol`）接入 Claude Code subagent 阵容的插件。四个 relay agent——`codex-implementer`、`codex-explorer`、`codex-solver`、`codex-reviewer`——与内建 Claude agent 并列出现在派发列表里；主模型通过普通的 Agent 工具把写好规格的任务派给它们，每个 relay 驱动一个持久化的 Codex 会话，并将其报告原样带回。

它是对内建 multi-agent 体系的**补充而非替代**：需要 Claude 级判断力或多 Claude 协作的子任务仍走内建 agent；执行类工作（实现、大范围代码阅读、高难度算法、独立评审）交给 Codex。面向同时持有两家订阅、不缺 Codex 额度的用户。

## 为什么

- 主模型的 token 贵，Codex 额度便宜。重活委派出去，判断留在主模型。
- 两个模型的盲区不重合：跨模型评审能抓到自查漏掉的问题。Codex 在竞赛级算法上尤其强。
- 会话落盘持久化：主模型读完报告后，可以带着下一轮指令续接同一个 Codex 会话。

## 环境要求

- Codex CLI ≥ 0.144.0 在 PATH 上（或设 `CODEX_BIN`），已登录
- Node ≥ 18（零 npm 依赖）

## 安装 / 开发

```bash
claude --plugin-dir /path/to/codex4claude
```

进入会话后运行 `/codex4claude:setup` 做健康检查。需要委派时，Claude 会经由 `codex-delegation` skill 自动选用 codex-* subagent。

## 组成

| 组件 | 作用 |
|---|---|
| `agents/` | 四个 relay subagent（`codex-implementer`、`codex-explorer`、`codex-solver`、`codex-reviewer`）：各自把规格转成一次引擎调用，并原样返回报告 |
| `scripts/codex4claude.mjs` | 零依赖 CLI 引擎：`run`（支持 `--session`、`--effort`、`--fast`、`--background`）、`agent define/list/show/rm`、`status/result/log/cancel`、`doctor` |
| `templates/agents/` | Codex 侧的角色 prompt：`implementer`、`explorer`、`algorithm-solver`、`reviewer` |
| `skills/codex-delegation` | 教主模型何时派 codex、何时用内建 agent、何时不派；规格格式、effort/fast 选型、报告复核 |

## 派发旋钮

- `--effort low|medium|high|xhigh|max|ultra` —— 推理深度（`ultra` = 最大推理 + Codex 侧任务委派）。旧的 `minimal` 不再接受。
- `--fast` —— Codex fast mode（`service_tier=priority`）：约 1.5× 速度，额度消耗更高，与 effort 正交。

## 返回内容

每次运行返回 Codex 的报告，外加紧凑的 `── run info ──` 尾注（改动文件、执行命令及退出码）和 LOG 路径。`CODEX RUN` 头行携带用于多轮续接的 session id。完整事件日志落在 `~/.claude/codex4claude/state/<workspace>/runs/<run-id>/`，可按需检查（`log <run-id> --grep …`），永远不会整段倒进对话。

## 持久化布局

- Codex 侧 agent：`.claude/codex-agents/`（项目级，可提交）→ `~/.claude/codex4claude/agents/`（用户级）→ 内置；高层覆盖低层。
- 会话：按工作区存于 `~/.claude/codex4claude/state/`；`run <agent> --session <id>` 可带完整上下文续接任意 Codex 会话。

模型固定为 `gpt-5.6-sol`（可用 `CODEX4CLAUDE_MODEL` 覆盖）。
