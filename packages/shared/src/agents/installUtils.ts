// Generic helpers shared by every agent descriptor's installHooks() and by main.ts's
// uninstall handler. These only look for "dashboard/hook.js" in a command string — nothing
// agent-specific — so a single definition here keeps install/uninstall behavior identical
// across Claude Code's nested {hooks:[{command}]} shape and Cursor's flat {command} shape.

export function isDashboardHook(h: unknown): boolean {
  const hook = h as Record<string, unknown>;
  if (typeof hook.command === "string" && hook.command.includes("dashboard/hook.js"))
    return true;
  if (
    Array.isArray(hook.hooks) &&
    hook.hooks.some((i: unknown) => {
      const item = i as Record<string, unknown>;
      return typeof item.command === "string" && item.command.includes("dashboard/hook.js");
    })
  )
    return true;
  return false;
}

export function pruneDashboardHooks(hooks: Record<string, unknown> | undefined): void {
  if (!hooks) return;
  for (const event of Object.keys(hooks)) {
    hooks[event] = (hooks[event] as unknown[]).filter((h) => !isDashboardHook(h));
    if ((hooks[event] as unknown[]).length === 0) delete hooks[event];
  }
}
