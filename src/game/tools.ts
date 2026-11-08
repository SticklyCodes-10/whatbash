export type ToolId =
  | "boot"
  | "fist"
  | "bat"
  | "hammer"
  | "bomb"
  | "rocket"
  | "cannon"
  | "anvil"
  | "zap"
  | "grab";

export interface ToolDef {
  id: ToolId;
  name: string;
  emoji: string;
  hint: string;
  color: string;
}

export const TOOLS: ToolDef[] = [
  { id: "boot", name: "Kick", emoji: "🥾", hint: "Click the buddy to boot him!", color: "#f59e0b" },
  { id: "fist", name: "Punch", emoji: "🥊", hint: "A quick jab. Combo it!", color: "#ef4444" },
  { id: "bat", name: "Bat", emoji: "🏏", hint: "Home run swing!", color: "#a16207" },
  { id: "hammer", name: "Hammer", emoji: "🔨", hint: "Heavy BONK.", color: "#64748b" },
  { id: "bomb", name: "Bomb", emoji: "💣", hint: "Drops a bomb with a 1.5s fuse.", color: "#111827" },
  { id: "rocket", name: "Rocket", emoji: "🚀", hint: "Fires a rocket where you click.", color: "#f43f5e" },
  { id: "cannon", name: "Cannon", emoji: "⚫", hint: "Shoots a heavy cannonball.", color: "#334155" },
  { id: "anvil", name: "Anvil", emoji: "⚒️", hint: "Drops an anvil from the sky.", color: "#475569" },
  { id: "zap", name: "Zapper", emoji: "⚡", hint: "Electrocute the buddy!", color: "#eab308" },
  { id: "grab", name: "Grab", emoji: "✋", hint: "Drag him around & throw him.", color: "#10b981" },
];
