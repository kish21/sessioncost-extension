// The status bar's menu: which items, in which order and group, for the current state. No vscode import.
import type { Answer } from "./answer";

export interface Item {
  command: string;
  label: string;
  group: string; // shown as a titled line above its block of items
  detail?: string;
}

export function menu(a: Answer | null, trusted: boolean, unseenTip = false): Item[] {
  const chat = "This chat";
  const guard = "Guard and tips";
  const more = "SessionCost";
  const missing = a?.setup?.missing ?? [];
  const outdated = a?.setup?.outdated ?? [];
  const needsSetup = Boolean(a?.setup && !a.setup.ok);
  const tipText = a?.chat?.last_tip?.trim() ?? "";
  const promoteTip = Boolean(unseenTip && trusted && tipText);
  const items: Item[] = [];
  if (needsSetup) {
    const affected = [...missing, ...outdated];
    const detail = affected.length
      ? `${missing.length > 0 ? "missing skills/hooks" : "outdated skills"}: ${affected.join(", ")}`
      : "add or update agent skills and guard hooks";
    items.push({
      group: "Setup needed",
      command: "sessioncost.setup",
      label: "$(warning) Set up your agents",
      detail,
    });
  }
  if (promoteTip) {
    items.push({
      group: "Token tip",
      command: "sessioncost.fix",
      label: "$(lightbulb) Fix token waste",
      detail: tipText,
    });
  }
  items.push(
    { group: chat, command: "sessioncost.report", label: "$(graph) Open report", detail: "turn by turn" },
    { group: chat, command: "sessioncost.status", label: "$(info) What SessionCost is doing" },
  );
  if (trusted) {
    if (!promoteTip) {
      items.push({
        group: chat,
        command: "sessioncost.fix",
        label: "$(wand) Fix token waste",
        detail: "shows each change first, with a backup",
      });
    }
    items.push({ group: chat, command: "sessioncost.undo", label: "$(discard) Undo the last fix" });
  }
  if (a?.handover)
    items.push({ group: chat, command: "sessioncost.handover", label: "$(arrow-right) Open the handover" });
  items.push({ group: chat, command: "sessioncost.list", label: "$(list-unordered) This folder's chats" });
  if (a?.guard.on) {
    items.push({ group: guard, command: "sessioncost.guardOff", label: "$(shield) Turn the guard off" });
    if (!a.guard.strict)
      items.push({
        group: guard,
        command: "sessioncost.guardStrict",
        label: "$(shield) Make the guard strict",
      });
  } else {
    items.push({ group: guard, command: "sessioncost.guardOn", label: "$(shield) Turn the guard on" });
  }
  items.push(
    { group: guard, command: "sessioncost.guardReport", label: "$(checklist) Open the guard report" },
    a?.tips.on
      ? { group: guard, command: "sessioncost.tipsOff", label: "$(lightbulb) Turn token tips off" }
      : { group: guard, command: "sessioncost.tipsOn", label: "$(lightbulb) Turn token tips on" },
    { group: more, command: "sessioncost.prices", label: "$(tag) Prices used" },
    { group: more, command: "sessioncost.serve", label: "$(globe) Live report page" },
    ...(needsSetup
      ? []
      : [{ group: more, command: "sessioncost.setup", label: "$(tools) Set up your agents" }]),
    {
      group: more,
      command: "sessioncost.update",
      label: "$(cloud-download) Update every SessionCost on this computer",
    },
    { group: more, command: "sessioncost.clean", label: "$(trash) Delete old reports" },
    {
      group: more,
      command: "sessioncost.uninstall",
      label: "$(clear-all) Uninstall SessionCost (remove skills & hooks)",
      detail: "backs up first, then uninstall the extension",
    },
  );
  return items;
}
