# codex4claude

分别为 Claude Code 和 Claude Cowork 提供独立 skill，默认调用 Codex 的 `gpt-6-astra` 模型。Claude 提交任务、复核结果，Codex 负责执行。随包引擎保存每次运行的报告和日志，并用明确的 session ID 续接对话。

| 使用环境 | Skill | 分发文件 |
|---|---|---|
| Claude Code | `codex-delegation` | `codex-delegation.skill` |
| Claude Cowork | `codex-delegation-cowork` | `codex-delegation-cowork.skill` 和同内容的 `.zip` |

不需要选择或定义 Agent。代码实现、仓库调查、算法和评审都使用同一个 `run` 入口，目标、权限和验收要求随任务传入。

## Claude Code 环境与安装

- Codex CLI **≥ 0.153.4**，在 PATH 上或通过 `CODEX_BIN` 指定可执行文件；已通过 `codex login` 登录，账号可使用目标模型。
- Node **≥ 18**，零 npm 依赖。
- Claude Code，支持 `${CLAUDE_SKILL_DIR}` 路径替换。

### 打包

在仓库根目录执行，需要 Python **≥ 3.9**，仅使用标准库：

```bash
python3 scripts/package_skill.py
```

生成 `dist/codex-delegation.skill`，它是 ZIP 格式的归档。包内只有 `codex-delegation/SKILL.md` 和运行所需脚本。测试和打包工具留在仓库中，`dist/` 不提交到 Git。已有 `.skill` 文件时可直接安装，运行技能无需 Python。

### 安装

个人安装，供所有项目使用：

```bash
mkdir -p "$HOME/.claude/skills"
unzip -o dist/codex-delegation.skill -d "$HOME/.claude/skills"
```

或安装到指定项目：

```bash
mkdir -p "/path/to/project/.claude/skills"
unzip -o dist/codex-delegation.skill -d "/path/to/project/.claude/skills"
```

将示例中的项目路径替换为实际路径。安装后确认目标位置是 `skills/codex-delegation/SKILL.md`，启动 Claude Code，然后运行：

```text
/codex-delegation setup
/codex-delegation 分析登录流程，给出代码位置
/codex-delegation status
```

也可以直接说“让 Codex 分析登录流程”或“检查 Codex 的运行环境”。`setup` 检查 Node、Codex CLI 版本、配置的模型和数据目录。检查通过不代表已经验证账号的模型访问权限；实际调用失败会显示错误。

## Claude Cowork 环境与安装

Cowork 版沿用“执行环境已就绪”的前提：在 Cowork 实际运行 shell 的环境中，需要 Node **≥ 18**、Codex CLI **≥ 0.153.4**、可用的 Codex 登录状态和网络，以及运行 Codex 沙箱和访问任务目录的权限。Cowork 在隔离环境中执行命令，不能默认复用电脑上安装的 Codex 或登录状态。[官方执行环境说明](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)

打包 Cowork 版：

```bash
python3 scripts/package_skill.py --target cowork
```

生成 `dist/codex-delegation-cowork.skill` 和内容相同的 `dist/codex-delegation-cowork.zip`。在 Claude 的 **Customize → Skills → Create skill → Upload a skill** 中上传 ZIP 并启用。[官方安装说明](https://support.claude.com/en/articles/12512180-use-skills-in-claude)

在 Cowork 会话中使用自然语言调用，例如：

```text
使用 codex-delegation-cowork 检查 Codex 的运行环境和登录状态。
让 Codex 只读分析已提供的计算代码，说明舍入规则。
查看刚才 Codex 任务的状态和最终报告。
```

Cowork 版根据实际加载的 `SKILL.md` 位置定位随包脚本，并通过 `--cd` 指定执行环境可访问的任务目录。较长任务使用有限超时的后台执行并持续检查状态。权限或沙箱初始化失败时会报告具体错误；任务记录能否跨会话保留取决于数据目录、工作区和 Codex 会话存储是否仍可访问。

两版共用 `skills/codex-delegation/scripts/` 中的引擎源码。`skills/codex-delegation-cowork/` 保存 Cowork 专用说明，打包时会装入完整引擎，得到可独立解压运行的文件；安装 Cowork 版时使用生成的归档。

## Claude Code 手动调用

Claude 根据 `codex-delegation` 技能直接调用随包引擎。手动调用时，在目标项目目录执行以下示例。个人安装的脚本位置为：

```bash
CODEX4CLAUDE_SCRIPT="$HOME/.claude/skills/codex-delegation/scripts/codex4claude.mjs"
node "$CODEX4CLAUDE_SCRIPT" run --cd "$PWD" --read-only "分析登录流程，给出代码位置"
node "$CODEX4CLAUDE_SCRIPT" run --cd "$PWD" --write --effort high --prompt-file task.md
node "$CODEX4CLAUDE_SCRIPT" run --cd "$PWD" --session <session-id> --write "修复刚才发现的问题"
```

项目安装时，将 `CODEX4CLAUDE_SCRIPT` 设为该项目下 `.claude/skills/codex-delegation/scripts/codex4claude.mjs` 的绝对路径。后续示例沿用此变量；`--cd` 始终指向任务工作区。

任务也可通过标准输入传入。使用带引号的 heredoc 分隔符，避免任务中的反引号或 `$()` 被 shell 执行：

```bash
node "$CODEX4CLAUDE_SCRIPT" run --cd "$PWD" --read-only <<'CODEX_TASK'
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
| `--ephemeral` | 不持久化 Codex 会话；引擎仍保留本次报告和日志 |

`ultra` 是 Codex 的“最大推理 + 自动任务委派”档位，不是 API 的 reasoning 参数。Fast 的可用性取决于模型和账号；引擎不主动启用 Fast，也不覆盖用户已有的全局设置。

前台执行时，Claude 的 Bash 工具应设置 600000 ms 超时，留出引擎结束和输出报告的时间。长任务使用 `--background --timeout 0`，由调用方持续检查状态；需要结束时使用 `cancel`。

```bash
node "$CODEX4CLAUDE_SCRIPT" status --cd "$PWD"
node "$CODEX4CLAUDE_SCRIPT" status <run-id> --cd "$PWD"
node "$CODEX4CLAUDE_SCRIPT" result <run-id> --cd "$PWD"
node "$CODEX4CLAUDE_SCRIPT" log <run-id> --cd "$PWD" --grep "turn.failed"
node "$CODEX4CLAUDE_SCRIPT" cancel <run-id> --cd "$PWD"
```

在 Claude Code 中也可使用 `/codex-delegation status <run-id>`、`result <run-id>`、`log <run-id>` 或 `cancel <run-id>`，由同一个 skill 调用对应子命令。

只读任务可并行，同一工作区一次只运行一个写任务。

## 报告和会话

每次调用返回 `CODEX RUN` 头行、Codex 的最终报告、包含文件和命令退出码的 `── run info ──` 尾注，以及 `LOG:` 路径。长报告在显示时截断，完整正文保存在 `last-message.txt`。

- **run ID** 对应一次引擎调用及其日志。
- **session ID** 对应 Codex 的持久对话；不同调用可以续接同一会话。

最终报告取自 Codex 的 `--output-last-message` 文件；进度消息不能作为完成依据。`ok` 表示进程正常退出、收到完成事件且产生了最终报告，仍需复核任务本身的验收结果。失败、超时和取消会保留已有证据；有持久 session ID 时，`NEXT` 给出携带工作目录和权限的续接命令。

默认数据目录为 `~/.claude/codex4claude/state/<workspace>/runs/<run-id>/`。用 `CODEX4CLAUDE_DATA` 可覆盖数据根目录；用 `CODEX4CLAUDE_MODEL` 可覆盖默认模型。完整事件日志保存到磁盘，不会全部注入 Claude 对话。

## 从插件迁移

先在 Claude Code 的 `/plugin` 中禁用或卸载旧 `codex4claude` 插件，再按上文安装 skill。通过 `--plugin-dir` 加载的用户改为正常启动 `claude`。

| 原入口 | Skill 入口 |
|---|---|
| `/codex4claude:setup` | `/codex-delegation setup` |
| `/codex4claude:status [run-id]` | `/codex-delegation status [run-id]` |
| 插件根目录的 `scripts/codex4claude.mjs` | Skill 目录的 `scripts/codex4claude.mjs` |

原有 CLI 子命令、参数、环境变量及数据目录保持兼容。旧运行记录仍可查询，旧 session ID 仍可续接；本次迁移无需移动历史数据。

### 从 0.3 升级

- `run <agent> "任务"` 改为 `run "任务"`；修改任务加 `--write`。
- `--continue` 改为 `--session <id>`，session ID 可从旧报告头行获取。
- `agent define/list/show/rm`、四个转发 Agent 和四份角色模板均已移除。
- 旧运行记录仍可查询，旧 session ID 仍可续接。旧会话中的角色文本属于历史上下文；需要新的任务约定时开启新会话。
- 用户此前保存的 Agent 定义文件和历史运行数据保留，定义文件不再加载。

## 验证与官方依据

```bash
node --test scripts/test/*.test.mjs
python3 scripts/package_skill.py
python3 scripts/package_skill.py --target cowork
git diff --check
```

自动化测试使用模拟 Codex 进程，不需要登录或消耗模型额度。除运行、会话和失败处理外，测试会分别打包并解压两个版本，在没有插件或 skill 路径环境变量、安装路径含空格和特殊字符、工作区位于另一目录的情况下验证环境检查、任务执行、后台查询和 `NEXT` 续接，并校验 Cowork ZIP 与 `.skill` 内容一致。

Claude Code 中的技能发现与调用可通过上述 `setup` 和任务示例验证。Cowork 上传、触发和沙箱权限需在真实 Cowork 会话中验证；本地解包测试不覆盖这些平台行为。真实 Codex 调用需要可用的登录状态和模型访问权限，应与模拟进程测试分开记录。

Skill 安装位置与路径替换依据 [Claude Code skills 文档](https://code.claude.com/docs/en/skills)，目录和元数据遵循 [Agent Skills 规范](https://agentskills.io/specification)。

适配依据核对于 2026-09-06：[Codex 0.153.4 更新记录](https://learn.chatgpt.com/docs/changelog)、[GPT-6 Astra 提示词指南](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices)、[Codex Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide)、[非交互运行文档](https://learn.chatgpt.com/docs/non-interactive-mode)。Cookbook 用于通用运行建议，模型行为以 Astra 的最新指南为准。
