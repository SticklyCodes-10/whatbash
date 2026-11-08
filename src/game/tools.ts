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
  ...[
    {
      "id": "tool-11",
      "name": "Plasma Glove",
      "emoji": "🥾",
      "hint": "Plasma Glove — boot class impact.",
      "color": "#22d3ee",
      "action": "boot"
    },
    {
      "id": "tool-12",
      "name": "Shockwave Boot",
      "emoji": "🥊",
      "hint": "Shockwave Boot — fist class impact.",
      "color": "#f472b6",
      "action": "fist"
    },
    {
      "id": "tool-13",
      "name": "Meteor Fist",
      "emoji": "🏏",
      "hint": "Meteor Fist — bat class impact.",
      "color": "#a78bfa",
      "action": "bat"
    },
    {
      "id": "tool-14",
      "name": "Titan Bat",
      "emoji": "🔨",
      "hint": "Titan Bat — hammer class impact.",
      "color": "#fbbf24",
      "action": "hammer"
    },
    {
      "id": "tool-15",
      "name": "Gravity Maul",
      "emoji": "💣",
      "hint": "Gravity Maul — bomb class impact.",
      "color": "#22d3ee",
      "action": "bomb"
    },
    {
      "id": "tool-16",
      "name": "Pulse Mine",
      "emoji": "🚀",
      "hint": "Pulse Mine — rocket class impact.",
      "color": "#f472b6",
      "action": "rocket"
    },
    {
      "id": "tool-17",
      "name": "Comet Rocket",
      "emoji": "⚫",
      "hint": "Comet Rocket — cannon class impact.",
      "color": "#a78bfa",
      "action": "cannon"
    },
    {
      "id": "tool-18",
      "name": "Rail Cannon",
      "emoji": "⚒️",
      "hint": "Rail Cannon — anvil class impact.",
      "color": "#fbbf24",
      "action": "anvil"
    },
    {
      "id": "tool-19",
      "name": "Sky Anvil",
      "emoji": "⚡",
      "hint": "Sky Anvil — zap class impact.",
      "color": "#22d3ee",
      "action": "zap"
    },
    {
      "id": "tool-20",
      "name": "Arc Whip",
      "emoji": "✋",
      "hint": "Arc Whip — grab class impact.",
      "color": "#f472b6",
      "action": "grab"
    },
    {
      "id": "tool-21",
      "name": "Neon Knuckles",
      "emoji": "🥾",
      "hint": "Neon Knuckles — boot class impact.",
      "color": "#a78bfa",
      "action": "boot"
    },
    {
      "id": "tool-22",
      "name": "Jade Crusher",
      "emoji": "🥊",
      "hint": "Jade Crusher — fist class impact.",
      "color": "#fbbf24",
      "action": "fist"
    },
    {
      "id": "tool-23",
      "name": "Solar Kick",
      "emoji": "🏏",
      "hint": "Solar Kick — bat class impact.",
      "color": "#22d3ee",
      "action": "bat"
    },
    {
      "id": "tool-24",
      "name": "Void Punch",
      "emoji": "🔨",
      "hint": "Void Punch — hammer class impact.",
      "color": "#f472b6",
      "action": "hammer"
    },
    {
      "id": "tool-25",
      "name": "Chrome Bat",
      "emoji": "💣",
      "hint": "Chrome Bat — bomb class impact.",
      "color": "#a78bfa",
      "action": "bomb"
    },
    {
      "id": "tool-26",
      "name": "Quake Hammer",
      "emoji": "🚀",
      "hint": "Quake Hammer — rocket class impact.",
      "color": "#fbbf24",
      "action": "rocket"
    },
    {
      "id": "tool-27",
      "name": "Sticky Bomb",
      "emoji": "⚫",
      "hint": "Sticky Bomb — cannon class impact.",
      "color": "#22d3ee",
      "action": "cannon"
    },
    {
      "id": "tool-28",
      "name": "Homing Rocket",
      "emoji": "⚒️",
      "hint": "Homing Rocket — anvil class impact.",
      "color": "#f472b6",
      "action": "anvil"
    },
    {
      "id": "tool-29",
      "name": "Nova Cannon",
      "emoji": "⚡",
      "hint": "Nova Cannon — zap class impact.",
      "color": "#a78bfa",
      "action": "zap"
    },
    {
      "id": "tool-30",
      "name": "Meteor Anvil",
      "emoji": "✋",
      "hint": "Meteor Anvil — grab class impact.",
      "color": "#fbbf24",
      "action": "grab"
    },
    {
      "id": "tool-31",
      "name": "Tesla Palm",
      "emoji": "🥾",
      "hint": "Tesla Palm — boot class impact.",
      "color": "#22d3ee",
      "action": "boot"
    },
    {
      "id": "tool-32",
      "name": "Magnet Grab",
      "emoji": "🥊",
      "hint": "Magnet Grab — fist class impact.",
      "color": "#f472b6",
      "action": "fist"
    },
    {
      "id": "tool-33",
      "name": "Frost Boot",
      "emoji": "🏏",
      "hint": "Frost Boot — bat class impact.",
      "color": "#a78bfa",
      "action": "bat"
    },
    {
      "id": "tool-34",
      "name": "Inferno Fist",
      "emoji": "🔨",
      "hint": "Inferno Fist — hammer class impact.",
      "color": "#fbbf24",
      "action": "hammer"
    },
    {
      "id": "tool-35",
      "name": "Thunder Bat",
      "emoji": "💣",
      "hint": "Thunder Bat — bomb class impact.",
      "color": "#22d3ee",
      "action": "bomb"
    },
    {
      "id": "tool-36",
      "name": "Obsidian Maul",
      "emoji": "🚀",
      "hint": "Obsidian Maul — rocket class impact.",
      "color": "#f472b6",
      "action": "rocket"
    },
    {
      "id": "tool-37",
      "name": "Cluster Bomb",
      "emoji": "⚫",
      "hint": "Cluster Bomb — cannon class impact.",
      "color": "#a78bfa",
      "action": "cannon"
    },
    {
      "id": "tool-38",
      "name": "Seeker Missile",
      "emoji": "⚒️",
      "hint": "Seeker Missile — anvil class impact.",
      "color": "#fbbf24",
      "action": "anvil"
    },
    {
      "id": "tool-39",
      "name": "Orbital Cannon",
      "emoji": "⚡",
      "hint": "Orbital Cannon — zap class impact.",
      "color": "#22d3ee",
      "action": "zap"
    },
    {
      "id": "tool-40",
      "name": "Drop Pod",
      "emoji": "✋",
      "hint": "Drop Pod — grab class impact.",
      "color": "#f472b6",
      "action": "grab"
    },
    {
      "id": "tool-41",
      "name": "Ion Zapper",
      "emoji": "🥾",
      "hint": "Ion Zapper — boot class impact.",
      "color": "#a78bfa",
      "action": "boot"
    },
    {
      "id": "tool-42",
      "name": "Telekinetic Grip",
      "emoji": "🥊",
      "hint": "Telekinetic Grip — fist class impact.",
      "color": "#fbbf24",
      "action": "fist"
    },
    {
      "id": "tool-43",
      "name": "Prism Kick",
      "emoji": "🏏",
      "hint": "Prism Kick — bat class impact.",
      "color": "#22d3ee",
      "action": "bat"
    },
    {
      "id": "tool-44",
      "name": "Riot Knuckles",
      "emoji": "🔨",
      "hint": "Riot Knuckles — hammer class impact.",
      "color": "#f472b6",
      "action": "hammer"
    },
    {
      "id": "tool-45",
      "name": "Street Bat",
      "emoji": "💣",
      "hint": "Street Bat — bomb class impact.",
      "color": "#a78bfa",
      "action": "bomb"
    },
    {
      "id": "tool-46",
      "name": "Demolition Hammer",
      "emoji": "🚀",
      "hint": "Demolition Hammer — rocket class impact.",
      "color": "#fbbf24",
      "action": "rocket"
    },
    {
      "id": "tool-47",
      "name": "EMP Charge",
      "emoji": "⚫",
      "hint": "EMP Charge — cannon class impact.",
      "color": "#22d3ee",
      "action": "cannon"
    },
    {
      "id": "tool-48",
      "name": "Firework Rocket",
      "emoji": "⚒️",
      "hint": "Firework Rocket — anvil class impact.",
      "color": "#f472b6",
      "action": "anvil"
    },
    {
      "id": "tool-49",
      "name": "Scatter Cannon",
      "emoji": "⚡",
      "hint": "Scatter Cannon — zap class impact.",
      "color": "#a78bfa",
      "action": "zap"
    },
    {
      "id": "tool-50",
      "name": "Steel Anvil",
      "emoji": "✋",
      "hint": "Steel Anvil — grab class impact.",
      "color": "#fbbf24",
      "action": "grab"
    },
    {
      "id": "tool-51",
      "name": "Static Shock",
      "emoji": "🥾",
      "hint": "Static Shock — boot class impact.",
      "color": "#22d3ee",
      "action": "boot"
    },
    {
      "id": "tool-52",
      "name": "Tether Grab",
      "emoji": "🥊",
      "hint": "Tether Grab — fist class impact.",
      "color": "#f472b6",
      "action": "fist"
    },
    {
      "id": "tool-53",
      "name": "Aero Kick",
      "emoji": "🏏",
      "hint": "Aero Kick — bat class impact.",
      "color": "#a78bfa",
      "action": "bat"
    },
    {
      "id": "tool-54",
      "name": "Brawler Fist",
      "emoji": "🔨",
      "hint": "Brawler Fist — hammer class impact.",
      "color": "#fbbf24",
      "action": "hammer"
    },
    {
      "id": "tool-55",
      "name": "Grand Slam Bat",
      "emoji": "💣",
      "hint": "Grand Slam Bat — bomb class impact.",
      "color": "#22d3ee",
      "action": "bomb"
    },
    {
      "id": "tool-56",
      "name": "Hydraulic Hammer",
      "emoji": "🚀",
      "hint": "Hydraulic Hammer — rocket class impact.",
      "color": "#f472b6",
      "action": "rocket"
    },
    {
      "id": "tool-57",
      "name": "Pulse Grenade",
      "emoji": "⚫",
      "hint": "Pulse Grenade — cannon class impact.",
      "color": "#a78bfa",
      "action": "cannon"
    },
    {
      "id": "tool-58",
      "name": "Boost Rocket",
      "emoji": "⚒️",
      "hint": "Boost Rocket — anvil class impact.",
      "color": "#fbbf24",
      "action": "anvil"
    },
    {
      "id": "tool-59",
      "name": "Heavy Cannon",
      "emoji": "⚡",
      "hint": "Heavy Cannon — zap class impact.",
      "color": "#22d3ee",
      "action": "zap"
    },
    {
      "id": "tool-60",
      "name": "Drop Hammer",
      "emoji": "✋",
      "hint": "Drop Hammer — grab class impact.",
      "color": "#f472b6",
      "action": "grab"
    },
    {
      "id": "tool-61",
      "name": "Chain Lightning",
      "emoji": "🥾",
      "hint": "Chain Lightning — boot class impact.",
      "color": "#a78bfa",
      "action": "boot"
    },
    {
      "id": "tool-62",
      "name": "Force Lift",
      "emoji": "🥊",
      "hint": "Force Lift — fist class impact.",
      "color": "#fbbf24",
      "action": "fist"
    },
    {
      "id": "tool-63",
      "name": "Toxic Stomp",
      "emoji": "🏏",
      "hint": "Toxic Stomp — bat class impact.",
      "color": "#22d3ee",
      "action": "bat"
    },
    {
      "id": "tool-64",
      "name": "Viper Jab",
      "emoji": "🔨",
      "hint": "Viper Jab — hammer class impact.",
      "color": "#f472b6",
      "action": "hammer"
    },
    {
      "id": "tool-65",
      "name": "Razor Bat",
      "emoji": "💣",
      "hint": "Razor Bat — bomb class impact.",
      "color": "#a78bfa",
      "action": "bomb"
    },
    {
      "id": "tool-66",
      "name": "Earthshaker",
      "emoji": "🚀",
      "hint": "Earthshaker — rocket class impact.",
      "color": "#fbbf24",
      "action": "rocket"
    },
    {
      "id": "tool-67",
      "name": "Time Bomb",
      "emoji": "⚫",
      "hint": "Time Bomb — cannon class impact.",
      "color": "#22d3ee",
      "action": "cannon"
    },
    {
      "id": "tool-68",
      "name": "Flare Rocket",
      "emoji": "⚒️",
      "hint": "Flare Rocket — anvil class impact.",
      "color": "#f472b6",
      "action": "anvil"
    },
    {
      "id": "tool-69",
      "name": "Burst Cannon",
      "emoji": "⚡",
      "hint": "Burst Cannon — zap class impact.",
      "color": "#a78bfa",
      "action": "zap"
    },
    {
      "id": "tool-70",
      "name": "Iron Meteor",
      "emoji": "✋",
      "hint": "Iron Meteor — grab class impact.",
      "color": "#fbbf24",
      "action": "grab"
    },
    {
      "id": "tool-71",
      "name": "Plasma Arc",
      "emoji": "🥾",
      "hint": "Plasma Arc — boot class impact.",
      "color": "#22d3ee",
      "action": "boot"
    },
    {
      "id": "tool-72",
      "name": "Tractor Grip",
      "emoji": "🥊",
      "hint": "Tractor Grip — fist class impact.",
      "color": "#f472b6",
      "action": "fist"
    },
    {
      "id": "tool-73",
      "name": "Cyber Kick",
      "emoji": "🏏",
      "hint": "Cyber Kick — bat class impact.",
      "color": "#a78bfa",
      "action": "bat"
    },
    {
      "id": "tool-74",
      "name": "Knockout Glove",
      "emoji": "🔨",
      "hint": "Knockout Glove — hammer class impact.",
      "color": "#fbbf24",
      "action": "hammer"
    },
    {
      "id": "tool-75",
      "name": "Slugger",
      "emoji": "💣",
      "hint": "Slugger — bomb class impact.",
      "color": "#22d3ee",
      "action": "bomb"
    },
    {
      "id": "tool-76",
      "name": "Pile Driver",
      "emoji": "🚀",
      "hint": "Pile Driver — rocket class impact.",
      "color": "#f472b6",
      "action": "rocket"
    },
    {
      "id": "tool-77",
      "name": "Sticky Charge",
      "emoji": "⚫",
      "hint": "Sticky Charge — cannon class impact.",
      "color": "#a78bfa",
      "action": "cannon"
    },
    {
      "id": "tool-78",
      "name": "Sonic Rocket",
      "emoji": "⚒️",
      "hint": "Sonic Rocket — anvil class impact.",
      "color": "#fbbf24",
      "action": "anvil"
    },
    {
      "id": "tool-79",
      "name": "Breach Cannon",
      "emoji": "⚡",
      "hint": "Breach Cannon — zap class impact.",
      "color": "#22d3ee",
      "action": "zap"
    },
    {
      "id": "tool-80",
      "name": "Comet Drop",
      "emoji": "✋",
      "hint": "Comet Drop — grab class impact.",
      "color": "#f472b6",
      "action": "grab"
    },
    {
      "id": "tool-81",
      "name": "Surge Touch",
      "emoji": "🥾",
      "hint": "Surge Touch — boot class impact.",
      "color": "#a78bfa",
      "action": "boot"
    },
    {
      "id": "tool-82",
      "name": "Gravity Claw",
      "emoji": "🥊",
      "hint": "Gravity Claw — fist class impact.",
      "color": "#fbbf24",
      "action": "fist"
    },
    {
      "id": "tool-83",
      "name": "Blitz Boot",
      "emoji": "🏏",
      "hint": "Blitz Boot — bat class impact.",
      "color": "#22d3ee",
      "action": "bat"
    },
    {
      "id": "tool-84",
      "name": "Boxing Glove",
      "emoji": "🔨",
      "hint": "Boxing Glove — hammer class impact.",
      "color": "#f472b6",
      "action": "hammer"
    },
    {
      "id": "tool-85",
      "name": "Home Run",
      "emoji": "💣",
      "hint": "Home Run — bomb class impact.",
      "color": "#a78bfa",
      "action": "bomb"
    },
    {
      "id": "tool-86",
      "name": "Wrecking Maul",
      "emoji": "🚀",
      "hint": "Wrecking Maul — rocket class impact.",
      "color": "#fbbf24",
      "action": "rocket"
    },
    {
      "id": "tool-87",
      "name": "Flash Bomb",
      "emoji": "⚫",
      "hint": "Flash Bomb — cannon class impact.",
      "color": "#22d3ee",
      "action": "cannon"
    },
    {
      "id": "tool-88",
      "name": "Spark Rocket",
      "emoji": "⚒️",
      "hint": "Spark Rocket — anvil class impact.",
      "color": "#f472b6",
      "action": "anvil"
    },
    {
      "id": "tool-89",
      "name": "Siege Cannon",
      "emoji": "⚡",
      "hint": "Siege Cannon — zap class impact.",
      "color": "#a78bfa",
      "action": "zap"
    },
    {
      "id": "tool-90",
      "name": "Anvil Rain",
      "emoji": "✋",
      "hint": "Anvil Rain — grab class impact.",
      "color": "#fbbf24",
      "action": "grab"
    },
    {
      "id": "tool-91",
      "name": "Volt Lash",
      "emoji": "🥾",
      "hint": "Volt Lash — boot class impact.",
      "color": "#22d3ee",
      "action": "boot"
    },
    {
      "id": "tool-92",
      "name": "Puppet Hand",
      "emoji": "🥊",
      "hint": "Puppet Hand — fist class impact.",
      "color": "#f472b6",
      "action": "fist"
    },
    {
      "id": "tool-93",
      "name": "Fury Kick",
      "emoji": "🏏",
      "hint": "Fury Kick — bat class impact.",
      "color": "#a78bfa",
      "action": "bat"
    },
    {
      "id": "tool-94",
      "name": "Haymaker",
      "emoji": "🔨",
      "hint": "Haymaker — hammer class impact.",
      "color": "#fbbf24",
      "action": "hammer"
    },
    {
      "id": "tool-95",
      "name": "Diamond Bat",
      "emoji": "💣",
      "hint": "Diamond Bat — bomb class impact.",
      "color": "#22d3ee",
      "action": "bomb"
    },
    {
      "id": "tool-96",
      "name": "Rumble Hammer",
      "emoji": "🚀",
      "hint": "Rumble Hammer — rocket class impact.",
      "color": "#f472b6",
      "action": "rocket"
    },
    {
      "id": "tool-97",
      "name": "Blackout Mine",
      "emoji": "⚫",
      "hint": "Blackout Mine — cannon class impact.",
      "color": "#a78bfa",
      "action": "cannon"
    },
    {
      "id": "tool-98",
      "name": "Afterburner",
      "emoji": "⚒️",
      "hint": "Afterburner — anvil class impact.",
      "color": "#fbbf24",
      "action": "anvil"
    },
    {
      "id": "tool-99",
      "name": "Pulse Cannon",
      "emoji": "⚡",
      "hint": "Pulse Cannon — zap class impact.",
      "color": "#22d3ee",
      "action": "zap"
    },
    {
      "id": "tool-100",
      "name": "Hammerfall",
      "emoji": "✋",
      "hint": "Hammerfall — grab class impact.",
      "color": "#f472b6",
      "action": "grab"
    },
    {
      "id": "tool-101",
      "name": "Storm Finger",
      "emoji": "🥾",
      "hint": "Storm Finger — boot class impact.",
      "color": "#a78bfa",
      "action": "boot"
    },
    {
      "id": "tool-102",
      "name": "Magnet Crane",
      "emoji": "🥊",
      "hint": "Magnet Crane — fist class impact.",
      "color": "#fbbf24",
      "action": "fist"
    }
  ]
];
