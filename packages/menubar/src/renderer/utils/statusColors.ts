import { SessionRow } from "../types";

export function accentColor(
  status: SessionRow["status"],
  errorState: boolean,
): string {
  if (status === "waiting_permission" || status === "waiting_input")
    return "bg-badge-waiting";
  if (status === "active") return "bg-branch";
  if (status === "done") return "bg-badge-done";
  return "bg-accent";
}

export function dotColor(
  status: SessionRow["status"],
  errorState: boolean,
): string {
  if (status === "waiting_permission" || status === "waiting_input")
    return "text-badge-waiting";
  if (status === "active") return "text-badge-active";
  if (status === "done") return "text-badge-done";
  return "text-accent";
}
