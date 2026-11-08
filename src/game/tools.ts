export type ToolId = string;

export interface ToolDef {
  id: ToolId;
  name: string;
  emoji: string;
  hint: string;
  color: string;
  action: ToolId;
}

export const TOOLS: ToolDef[] = [
  { id: "boot", name: "Kick", emoji: "🥾", hint: "Click the buddy to boot him!", color: "#f59e0b", action: "boot" },
  { id: "fist", name: "Punch", emoji: "🥊", hint: "A quick jab. Combo it!", color: "#ef4444", action: "fist" },
  { id: "bat", name: "Bat", emoji: "🏏", hint: "Home run swing!", color: "#a16207", action: "bat" },
  { id: "hammer", name: "Hammer", emoji: "🔨", hint: "Heavy BONK.", color: "#64748b", action: "hammer" },
  { id: "bomb", name: "Bomb", emoji: "💣", hint: "Drops a bomb with a 1.5s fuse.", color: "#111827", action: "bomb" },
  { id: "rocket", name: "Rocket", emoji: "🚀", hint: "Fires a rocket where you click.", color: "#f43f5e", action: "rocket" },
  { id: "cannon", name: "Cannon", emoji: "⚫", hint: "Shoots a heavy cannonball.", color: "#334155", action: "cannon" },
  { id: "anvil", name: "Anvil", emoji: "⚒️", hint: "Drops an anvil from the sky.", color: "#475569", action: "anvil" },
  { id: "zap", name: "Zapper", emoji: "⚡", hint: "Electrocute the buddy!", color: "#eab308", action: "zap" },
  { id: "grab", name: "Grab", emoji: "✋", hint: "Drag him around & throw him.", color: "#10b981", action: "grab" },
  { id: "radiator", name: "RADIATOR", emoji: "☢️", hint: "A catastrophic orbital heat event. Click Buddy to initialize.", color: "#ff5b24", action: "radiator" }
];
