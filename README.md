# SessionCost for VS Code, Cursor and Antigravity

See what your coding agent's chat costs in tokens, and what the safety guard stopped, right in the status bar.

`🛡 Guard on · fix the login · 84k tokens · $0.62`

- **Status bar:** the guard, and the name, tokens and cost of this folder's newest chat (Claude Code, Codex,
  Copilot, Antigravity or Cursor). It turns amber when the guard stopped a step.
- **Pop-up** when the guard stops or asks about a step, with **Show** for the guard report.
- **Click it** for the menu: open the report, token tips on/off, fix token waste (you see each change first, a backup
  is kept), undo, guard on/off, the guard report, the handover, prices, setup and update.

## Install

Install **SessionCost** from the extensions view. The first time, it asks to install the SessionCost tool into a
private folder (`~/.sessioncost/editor`); it needs the internet once and no separate Python or Node. When the
extension updates, it updates SessionCost to the same version.

You can also install SessionCost without the editor: `npx sessioncost`, `pip install sessioncost`, or the Claude
Code plugin. See the [SessionCost README](https://github.com/kish21/sessioncost#readme).

## Privacy

Everything runs on this computer. The extension runs the SessionCost tool, which reads your agents' chat logs on this
computer and sends nothing anywhere. The only download is SessionCost itself, once per version.

## Settings

- `sessioncost.refreshSeconds` (10): how often the status bar checks for changes.
- `sessioncost.notifyGuard` (on): the pop-up when the guard stops or asks.

## License

MIT
