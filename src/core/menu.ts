// The status bar's menu: which items, in which order, for the current state. No vscode import.
import type { Answer } from "./answer";

export interface Item {
  command: string;
  label: string;
  detail?: string;
}

export function menu(a: Answer | null, trusted: boolean): Item[] {
  const items: Item[] = [
    {
      command: "sessioncost.report",
      label: "$(graph) Open report",
      detail: "this folder's newest chat, turn by turn",
    },
    { command: "sessioncost.status", label: "$(info) What SessionCost is doing" },
  ];
  if (trusted) {
    items.push({
      command: "sessioncost.fix",
      label: "$(wand) Fix token waste",
      detail: "shows each change first; applies on your yes, with a backup",
    });
    items.push({ command: "sessioncost.undo", label: "$(discard) Undo the last fix" });
  }
  items.push(
    a?.tips.on
      ? { command: "sessioncost.tipsOff", label: "$(lightbulb) Turn token tips off" }
      : { command: "sessioncost.tipsOn", label: "$(lightbulb) Turn token tips on" },
  );
  if (a?.guard.on) {
    items.push({ command: "sessioncost.guardOff", label: "$(shield) Turn the guard off" });
    if (!a.guard.strict)
      items.push({ command: "sessioncost.guardStrict", label: "$(shield) Make the guard strict" });
  } else {
    items.push({ command: "sessioncost.guardOn", label: "$(shield) Turn the guard on" });
  }
  items.push({ command: "sessioncost.guardReport", label: "$(checklist) Open the guard report" });
  if (a?.handover) items.push({ command: "sessioncost.handover", label: "$(arrow-right) Open the handover" });
  items.push(
    { command: "sessioncost.list", label: "$(list-unordered) This folder's chats" },
    { command: "sessioncost.prices", label: "$(tag) Prices used" },
    { command: "sessioncost.serve", label: "$(globe) Live report page" },
    { command: "sessioncost.setup", label: "$(gear) Set up your agents" },
    { command: "sessioncost.update", label: "$(cloud-download) Update every SessionCost on this computer" },
    { command: "sessioncost.clean", label: "$(trash) Delete old reports" },
  );
  return items;
}
