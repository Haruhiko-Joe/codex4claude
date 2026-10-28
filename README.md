# codex4claude

Claude Code 的 skill：Claude 直接用 `codex exec` 把任务交给 Codex 执行，自己负责拆任务、定权限、复核结果。不带任何脚本。会话由 Codex 自己保存，每次运行的完整记录写到 `~/.claude/codex4claude/logs/`。

## 环境

- Codex CLI **≥ 0.165.0**，在 PATH 上，已通过 `codex login` 登录。
- Claude Code。

## 安装

个人安装，供所有项目使用：

```bash
mkdir -p ~/.claude/skills && cp -R skills/codex-delegation ~/.claude/skills/
```

项目安装：把 `skills/codex-delegation` 复制到项目的 `.claude/skills/` 下。开发这个仓库时可以改用软链接。

之前装过 codex4claude 插件的，先在 `/plugin` 里禁用 `codex4claude@codex4claude`，避免两套 skill 同时触发。

启动 Claude Code 后：

```text
/codex-delegation setup
/codex-delegation 分析登录流程，给出代码位置
```

也可以直接说"让 Codex 分析登录流程"或"检查 Codex 的运行环境"。`setup` 运行 `codex --version`、`codex login status` 和 `codex doctor`。

## Claude 实际执行的命令

读取任务的完整形式：

```bash
mkdir -p ~/.claude/codex4claude/logs; LOG=~/.claude/codex4claude/logs/$(date +%Y%m%d-%H%M%S)-$$.log
codex exec -s read-only --skip-git-repo-check - <<'CODEX_TASK' 2>"$LOG"
任务正文
CODEX_TASK
echo "exit=$? log=$LOG"; grep -m1 'session id:' "$LOG"
```

stdout 只有 Codex 的最终回复，stderr 是完整记录：头部（model、sandbox、effort、session id），每条命令一个 `exec` 块（命令、目录、结果、输出），最后是最终回复和 token 用量。任务正文走 stdin 的带引号 heredoc，不会被 shell 展开。

### 权限

| 参数 | 行为 |
|---|---|
| `-s read-only` | 默认，只读 |
| `-s workspace-write` | 允许修改工作区；`--add-dir <目录>` 追加其他可写目录 |
| `--approve-for-me` | 工作区可写，越权请求（网络、工作区外路径）交给 Codex 的自动审核；代替 `-s` |
| `-s danger-full-access` | 无文件系统隔离，仅限用户明确授权 |

每次运行都显式传 `-s`，因为用户的 Codex 配置可能默认是更宽的沙箱。

### 选项

| 参数 | 行为 |
|---|---|
| `-c model_reasoning_effort="<档位>"` | `low`、`medium`、`high`、`xhigh`、`max`、`ultra`；不传沿用用户配置 |
| `-c service_tier="priority"` | Fast 模式，额度消耗更高；`"default"` 单次关闭 |
| `-m <模型>` | 用户指定时才覆盖配置的模型 |
| `-i <图片>` | 附加截图或图示，可重复 |
| `--ephemeral` | 不保存会话，不能续接 |
| `--output-schema <文件>` | 最终回复按 JSON Schema 输出 |
| `--json` + `-o <文件>` | stdout 改为 JSONL 事件，最终回复写入文件 |

`ultra` 是 Codex 的"最大推理 + 自动任务委派"档位。

### 后台、评审、续接

前台运行时 Bash 超时设为 600000 ms。可能更久的任务用 Claude Code Bash 的 `run_in_background`，结束时 Claude Code 自动收到通知；中途用 `tail -n 20 "$LOG"` 看进度，用 TaskStop 停止。

评审用 Codex 内置的 reviewer，目标是 `--uncommitted`、`--base <分支>` 或 `--commit <sha>`：

```bash
codex exec review --uncommitted - <<'CODEX_TASK' 2>"$LOG"
重点看支付模块的并发和错误处理。
CODEX_TASK
```

续接用日志头部的 session id。`exec resume` 没有 `-s` 和 `-C`，沙箱用 `-c` 指定，并在工作区目录运行：

```bash
codex exec resume <session-id> --skip-git-repo-check -c sandbox_mode="workspace-write" - <<'CODEX_TASK' 2>"$LOG"
空输入用例的验收没过，修掉并重跑相关检查。
CODEX_TASK
```

`codex exec fork <session-id> "<任务>"` 从同一起点开新会话试另一种做法。

### 日志

`ls -t ~/.claude/codex4claude/logs | head` 列出最近运行，每个文件的头部标明模型、沙箱、session id。复核时对照 `exec` 块和 `git diff`，不能只信最终回复。

## 从 0.5 迁移

| 0.5 引擎 | 现在 |
|---|---|
| `run --read-only / --write / --dangerous` | `codex exec -s read-only / workspace-write / danger-full-access` |
| `--effort <档位>` | `-c model_reasoning_effort="<档位>"` |
| `--fast` | `-c service_tier="priority"` |
| `--session <id>` | `codex exec resume <id>` |
| `--background` + `status / result / cancel` | Claude Code Bash 的 `run_in_background` + 日志文件 + TaskStop |
| `log <run-id>` | 直接 `grep` / `tail` 日志文件 |
| `doctor` | `codex doctor` + `codex login status` |
| `CODEX4CLAUDE_MODEL` | 用户的 Codex 配置，或 `-m` |
| `CODEX_BIN` | PATH |

旧运行记录仍在 `~/.claude/codex4claude/state/` 下，可直接读文件；旧 session ID 仍可用 `codex exec resume` 续接。Cowork 版、打包脚本和模拟测试已移除。引擎最后的版本见 Git 历史里的 0.5.0 提交。

## 为什么不再需要引擎

Codex 0.165 已原生提供引擎当初补的大部分东西：`codex doctor`；`exec resume` / `exec fork`；`exec review`；`--worktree`、`--add-dir`、`--approve-for-me`；stdout 只输出最终回复，stderr 头部带 session id。Claude Code 原生提供后台执行、完成通知和超时。引擎剩下的运行登记、写锁和报告排版，用 `ls`、`grep`、`git diff` 就能代替，而 JSONL 事件解析反而要跟着 Codex 的格式变动维护。

`codex mcp-server` 已被官方移除，app-server 标为实验性且不建议生产使用，所以"把 Codex 当 MCP 工具接入"这条路走不通。

## 验证

2026-10-28 用 Codex CLI 0.165.0 实际运行验证：stdout/stderr 分流与 session id 头部；`exec resume` 配合 `-c sandbox_mode` 续接；`--json` 的事件格式；SKILL.md 中的读取示例按原样运行通过。`exec review`、`fork`、`--worktree`、`--approve-for-me`、`--output-schema` 依据 CLI 帮助和官方文档，未实际运行。

参考：[非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)、[配置参考](https://learn.chatgpt.com/codex/config-file/config-reference)、[更新记录](https://learn.chatgpt.com/docs/changelog)、[Claude Code skills](https://code.claude.com/docs/en/skills)。
