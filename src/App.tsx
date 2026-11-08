import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "./game/engine";
import type { Stats, BuddyBodySave } from "./game/engine";
import { TOOLS } from "./game/tools";
import { ENVS } from "./game/environment";
import type { ToolId } from "./game/tools";
import { cn } from "./utils/cn";
import { PeerRoom } from "./game/multiplayer";
import type { RoomState } from "./game/multiplayer";

type SavedGame = { version: 1; stats: Stats; tool: ToolId; placeName: string; buddy?: BuddyBodySave[]; shirtColor: string; hairColor: string; stand: boolean; slow: boolean; sound: boolean; follow: boolean; showHelp: boolean; menuTab: "play" | "style" | "arenas"; loadout?: ToolId[] };
const SAVE_KEY = "whatbash-save-v1";
function readSave(): Partial<SavedGame> {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) as Partial<SavedGame> : {}; } catch { return {}; }
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [ready, setReady] = useState(false);
  const [savedGame] = useState<Partial<SavedGame>>(readSave);
  const [error, setError] = useState<string | null>(null);
  const [tool, setToolState] = useState<ToolId>(() => savedGame.tool ?? "boot");
  const [stats, setStats] = useState<Stats>(() => savedGame.stats ?? { money: 0, pain: 0, combo: 0, kos: 0 });
  const [place, setPlace] = useState({ name: savedGame.placeName ?? "…", emoji: "🎲" });
  const [model, setModel] = useState<{ text: string; custom: boolean } | null>(null);
  const [stand, setStand] = useState(savedGame.stand ?? true);
  const [slow, setSlow] = useState(false);
  const [sound, setSound] = useState(savedGame.sound ?? true);
  const [follow, setFollow] = useState(savedGame.follow ?? true);
  const [showHelp, setShowHelp] = useState(savedGame.showHelp ?? true);
  const [menuOpen, setMenuOpen] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [menuLeaving, setMenuLeaving] = useState(false);
  const [endingRun, setEndingRun] = useState(false);
  const [runEnded, setRunEnded] = useState(false);
  const [runSummary, setRunSummary] = useState<Stats | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const deployedVersion = useRef<string | null>(null);
  const runStartedAt = useRef<number>(Date.now());
  const [menuTab, setMenuTab] = useState<"play" | "style" | "arenas" | "multiplayer">(savedGame.menuTab === "style" || savedGame.menuTab === "arenas" ? savedGame.menuTab : "play");
  const [armoryOpen, setArmoryOpen] = useState(false);
  const roomRef = useRef<PeerRoom | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [roomStatus, setRoomStatus] = useState("");
  const [roomError, setRoomError] = useState("");
  const [roomScreen, setRoomScreen] = useState<"home" | "create" | "join">("home");
  const [joinCode, setJoinCode] = useState("");
  const [createMap, setCreateMap] = useState(ENVS[0].id);
  const [createMaxPlayers, setCreateMaxPlayers] = useState(4);
  const [loadout, setLoadout] = useState<ToolId[]>(() => Array.from({ length: 10 }, (_, i) => savedGame.loadout?.[i] ?? TOOLS[i]?.id ?? "boot"));
  const [toolSearch, setToolSearch] = useState("");
  const [shirtColor, setShirtColor] = useState(savedGame.shirtColor ?? "#2fd3cb");
  const [hairColor, setHairColor] = useState(savedGame.hairColor ?? "#2a1a12");
  const [musicTracks, setMusicTracks] = useState<string[]>([]);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const musicTracksRef = useRef<string[]>([]);
  const currentTrackRef = useRef<string | null>(null);

  useEffect(() => {
    const player = new Audio();
    player.volume = 0.35;
    musicRef.current = player;
    const playAnother = () => {
      const tracks = musicTracksRef.current;
      if (!tracks.length) {
        setMusicPlaying(false);
        return;
      }
      const choices = tracks.filter((track) => track !== currentTrackRef.current);
      const next = (choices.length ? choices : tracks)[Math.floor(Math.random() * (choices.length || tracks.length))];
      currentTrackRef.current = next;
      player.src = `/music/${encodeURIComponent(next)}`;
      void player.play().then(() => setMusicPlaying(true)).catch(() => setMusicPlaying(false));
    };
    player.addEventListener("ended", playAnother);
    fetch("/music/tracks.json")
      .then((response) => {
        if (!response.ok) throw new Error("Music playlist not found");
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        const tracks = Array.isArray(data)
          ? data.filter((item): item is string => typeof item === "string" && item.toLowerCase().endsWith(".mp3"))
          : [];
        musicTracksRef.current = tracks;
        setMusicTracks(tracks);
      })
      .catch((err) => console.info("Add MP3 filenames to public/music/tracks.json to enable music.", err));
    return () => {
      player.pause();
      player.removeEventListener("ended", playAnother);
      musicRef.current = null;
    };
  }, []);

  const toggleMusic = useCallback(() => {
    const player = musicRef.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
      setMusicPlaying(false);
      return;
    }
    if (player.src) {
      void player.play().then(() => setMusicPlaying(true)).catch(() => setMusicPlaying(false));
      return;
    }
    const tracks = musicTracksRef.current;
    if (!tracks.length) return;
    const next = tracks[Math.floor(Math.random() * tracks.length)];
    currentTrackRef.current = next;
    player.src = `/music/${encodeURIComponent(next)}`;
    void player.play().then(() => setMusicPlaying(true)).catch(() => setMusicPlaying(false));
  }, []);

  useEffect(() => {
    if (!mountRef.current || !overlayRef.current) return;
    let game: Game;
    try {
      game = new Game(mountRef.current, overlayRef.current, {
        onStats: setStats,
        onPlace: (name, emoji) => setPlace({ name, emoji }),
        onModel: (text, custom) => setModel({ text, custom }),
        onReady: () => setReady(true),
      });
    } catch (e) {
      console.error(e);
      setError("Your browser couldn't start WebGL, which this 3D game needs.");
      return;
    }
    gameRef.current = game;
    void game.init();
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);


  useEffect(() => {
    if (!ready) return;
    gameRef.current?.setTool(tool);
    gameRef.current?.restoreStats(stats);
    if (savedGame.buddy?.length) gameRef.current?.restoreBuddySnapshot(savedGame.buddy);
    gameRef.current?.setStand(stand);
    gameRef.current?.setSlowmo(false);
    gameRef.current?.setSound(sound);
    gameRef.current?.setFollow(follow);
    gameRef.current?.setBuddyColors(shirtColor, hairColor);
    const savedArena = ENVS.find((env) => env.name === savedGame.placeName);
    if (savedArena) gameRef.current?.selectEnvironment(savedArena.id);
  // Restore the last explicitly saved configuration once the 3D scene is ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const writeSave = useCallback(() => {
    const snapshot: SavedGame = { version: 1, stats, tool, loadout, placeName: place.name, buddy: gameRef.current?.getBuddySnapshot(), shirtColor, hairColor, stand, slow, sound, follow, showHelp, menuTab };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot)); } catch (err) { console.warn("WHATBASH could not save this browser's local save data.", err); }
  }, [stats, tool, loadout, place.name, shirtColor, hairColor, stand, slow, sound, follow, showHelp, menuTab]);

  useEffect(() => {
    if (!roomState || !gameStarted) return;
    const timer = window.setInterval(() => { const snapshot = gameRef.current?.getBuddySnapshot(); if (snapshot) roomRef.current?.sendSnapshot(snapshot); }, 80);
    return () => window.clearInterval(timer);
  }, [roomState, gameStarted]);

  useEffect(() => () => { void roomRef.current?.leave(false); }, []);
  useEffect(() => {
    let confirmedLeave = false;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (runEnded) return;
      confirmedLeave = true;
      event.preventDefault();
      event.returnValue = "";
    };
    const onPageHide = () => {
      if (confirmedLeave && !runEnded) writeSave();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [gameStarted, runEnded, writeSave]);

  useEffect(() => {
    document.title = endingRun || runEnded ? "404: END" : "WHATBASH";
    return () => { document.title = "WHATBASH"; };
  }, [endingRun, runEnded]);




  useEffect(() => {
    let active = true;
    const checkForUpdate = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}version.json?check=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { version?: string };
        if (!active || !data.version) return;
        if (deployedVersion.current === null) deployedVersion.current = data.version;
        else if (data.version !== deployedVersion.current) setUpdateAvailable(true);
      } catch { /* Offline or local development: retry on the next check. */ }
    };
    void checkForUpdate();
    const timer = window.setInterval(checkForUpdate, 60000);
    window.addEventListener("focus", checkForUpdate);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", checkForUpdate); };
  }, []);

  const endRun = useCallback(() => {
    if (endingRun || runEnded) return;
    setEndingRun(true);
    gameRef.current?.endRun(() => {
      setRunSummary({ ...stats });
      setEndingRun(false);
      setRunEnded(true);
    });
  }, [endingRun, runEnded, stats]);

  const selectTool = useCallback((id: ToolId) => {
    setToolState(id);
    gameRef.current?.setTool(id);
  }, []);

  const newPlace = useCallback(() => gameRef.current?.newPlace(), []);
  const chooseArena = useCallback((id: string) => {
    if (roomRef.current?.state && !roomRef.current.owner) return;
    gameRef.current?.selectEnvironment(id);
    roomRef.current?.setMap(id);
    const selected = ENVS.find((env) => env.id === id);
    if (selected) setPlace({ name: selected.name, emoji: selected.emoji });
  }, []);
  const makePeerRoom = () => new PeerRoom({
    onState: (state) => {
      setRoomState(state);
      if (state) { const arena = ENVS.find((env) => env.id === state.mapId); if (arena) { gameRef.current?.selectEnvironment(arena.id); setPlace({ name: arena.name, emoji: arena.emoji }); } }
    },
    onSnapshots: (snapshots) => {
      const room = roomRef.current?.state; const localId = roomRef.current?.playerId;
      const remote = Object.entries(snapshots).filter(([id]) => id !== localId).map(([id, bodies]) => { const player = room?.players.find((member) => member.id === id); return { id, name: player?.name ?? "Player", color: player?.color ?? "#2fd3cb", bodies }; });
      gameRef.current?.setRemotePlayers(remote);
    },
    onStatus: setRoomStatus, onError: setRoomError,
  }, "Player", shirtColor);

  const createRoom = async () => {
    setRoomError(""); setRoomStatus("Opening room...");
    try { const room = makePeerRoom(); roomRef.current = room; const state = await room.create(createMap, createMaxPlayers); const arena = ENVS.find((env) => env.id === state.mapId); if (arena) { gameRef.current?.selectEnvironment(arena.id); setPlace({ name: arena.name, emoji: arena.emoji }); } gameRef.current?.startGame(); setGameStarted(true); setMenuOpen(false); setRoomScreen("home"); }
    catch (error) { roomRef.current?.leave(false); roomRef.current = null; setRoomError(error instanceof Error ? error.message : "Could not create room."); setRoomStatus(""); }
  };

  const joinRoom = async () => {
    setRoomError(""); setRoomStatus("Joining room...");
    try { const room = makePeerRoom(); roomRef.current = room; const state = await room.join(joinCode); const arena = ENVS.find((env) => env.id === state.mapId); if (arena) { gameRef.current?.selectEnvironment(arena.id); setPlace({ name: arena.name, emoji: arena.emoji }); } gameRef.current?.startGame(); setGameStarted(true); setMenuOpen(false); setRoomScreen("home"); }
    catch (error) { roomRef.current?.leave(false); roomRef.current = null; setRoomError(error instanceof Error ? error.message : "Could not join room."); setRoomStatus(""); }
  };

  const leaveRoom = async () => { await roomRef.current?.leave(true); roomRef.current = null; setRoomState(null); gameRef.current?.setRemotePlayers([]); };
  const applyStyle = useCallback((shirt: string, hair: string) => gameRef.current?.setBuddyColors(shirt, hair), []);
  const reset = useCallback(() => gameRef.current?.resetBuddy(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      const n = k === "0" ? 9 : parseInt(k, 10) - 1;
      if (n >= 0 && n < 10) selectTool(loadout[n]);
      else if (k === "r") reset();
      else if (k === "n") newPlace();
      else if (k === "escape") setArmoryOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectTool, reset, newPlace, loadout]);

  const current = TOOLS.find((t) => t.id === tool) ?? TOOLS[0];
  const filteredTools = TOOLS.filter((t) => `${t.name} ${t.hint}`.toLowerCase().includes(toolSearch.toLowerCase()));
  const painColor =
    stats.pain < 35 ? "from-lime-400 to-lime-300" : stats.pain < 70 ? "from-yellow-400 to-orange-400" : "from-orange-500 to-red-600";

  return (
    <div
      className={`site-lens-frame fixed inset-0 overflow-hidden bg-slate-900 select-none text-white ${endingRun ? "run-ending-ui" : ""}`}
      style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}
    >
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <div className="crt-ui-overlay" aria-hidden="true" />



      {updateAvailable && <div className="update-notice absolute bottom-4 left-1/2 z-[90] flex w-[min(92vw,520px)] -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-cyan-300/50 bg-slate-950/95 px-4 py-3 text-sm text-cyan-50 shadow-2xl"><span><b className="block text-cyan-200">NEW UPDATE AVAILABLE</b>Reload the website to apply the new update.</span><button onClick={() => window.location.reload()} className="cyber-button shrink-0">RELOAD</button></div>}

      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900 p-6 text-center text-xl">
          {error}
        </div>
      )}

      {!ready && !error && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-sky-500 to-indigo-700">
          <div className="title-font text-6xl tracking-wider drop-shadow-[0_4px_0_rgba(0,0,0,0.35)]">WHATBASH IS LOADING</div>
          <div className="animate-bounce text-5xl">🥾</div>
          <div className="text-lg opacity-90">Setting Up...</div>
        </div>
      )}

      {gameStarted && !runEnded && <><button onClick={() => setArmoryOpen(true)} className="cyber-menu-trigger absolute right-3 bottom-36 z-20 sm:right-5">▦ ARMORY</button><button onClick={() => { setMenuTab("play"); setMenuOpen(true); }} className="cyber-menu-trigger absolute right-3 bottom-28 z-20 sm:right-5">☰ MENU</button><button onClick={endRun} className="end-run-button absolute right-3 bottom-16 z-20 sm:right-5">☠ END RUN</button></>}
      {gameStarted && !endingRun && !runEnded && <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2 sm:left-4 sm:top-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-2xl border-2 border-white/30 bg-black/45 px-3 py-1.5 text-sm font-semibold backdrop-blur sm:text-base">
            <span className="text-xl">{place.emoji}</span>
            <span>{place.name}</span>
          </div>
          <button
            onClick={newPlace}
            className="rounded-2xl border-b-4 border-fuchsia-800 bg-fuchsia-500 px-3 py-1.5 text-sm font-bold transition active:translate-y-0.5 active:border-b-2 hover:bg-fuchsia-400 sm:text-base"
            title="Random place (N)"
          >
            🎲 New place
          </button>
        </div>
      </div>}

      {/* Top-right: score */}
      {gameStarted && !endingRun && !runEnded && <div className="pointer-events-none absolute right-3 top-3 z-10 flex w-56 flex-col items-end gap-2 sm:right-4 sm:top-4 sm:w-72">
        <div className="flex items-center gap-2">
          {stats.kos > 0 && (
            <div className="rounded-xl bg-red-600/90 px-2 py-1 text-sm font-bold">💀 {stats.kos}</div>
          )}
          <div className="title-font cyber-score rounded-2xl border px-4 py-1 text-3xl tracking-wide backdrop-blur">
            ${stats.money.toLocaleString()}
          </div>
        </div>
        <div className="w-full">
          <div className="mb-1 flex justify-between text-xs font-bold uppercase tracking-widest opacity-90">
            <span>Pain-o-meter</span>
            <span>{Math.round(stats.pain)}%</span>
          </div>
          <div className="h-5 w-full overflow-hidden rounded-full border-2 border-white/40 bg-black/50">
            <div
              className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-150", painColor)}
              style={{ width: `${stats.pain}%` }}
            />
          </div>
        </div>
        {stats.combo > 1 && (
          <div
            key={stats.combo}
            className="title-font combo-pop text-4xl tracking-wider text-orange-300 drop-shadow-[0_3px_0_rgba(0,0,0,0.5)]"
          >
            {stats.combo}x COMBO
          </div>
        )}
      </div>}

      {/* Left: toggles */}
      {gameStarted && !endingRun && !runEnded && <div className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 sm:left-4">
        <SideBtn label="Reset buddy (R)" on={false} onClick={reset}>🔄</SideBtn>
        <SideBtn
          label="Buddy tries to stand up"
          on={stand}
          onClick={() => {
            setStand(!stand);
            gameRef.current?.setStand(!stand);
          }}
        >🧍</SideBtn>
        <SideBtn
          label="Slow motion"
          on={slow}
          onClick={() => {
            setSlow(!slow);
            gameRef.current?.setSlowmo(!slow);
          }}
        >🐢</SideBtn>
        <SideBtn
          label="Camera follows buddy"
          on={follow}
          onClick={() => {
            setFollow(!follow);
            gameRef.current?.setFollow(!follow);
          }}
        >🎥</SideBtn>
        <SideBtn
          label="Sound"
          on={sound}
          onClick={() => {
            setSound(!sound);
            gameRef.current?.setSound(!sound);
          }}
        >{sound ? "🔊" : "🔇"}</SideBtn>
        <SideBtn
          label={musicPlaying ? "Pause background music" : musicTracks.length ? "Play random background music" : "Add MP3 files to public/music"}
          on={musicPlaying}
          onClick={toggleMusic}
        >{musicPlaying ? "🎵" : "🎧"}</SideBtn>
        <SideBtn label="Help" on={showHelp} onClick={() => setShowHelp(!showHelp)}>❓</SideBtn>
      </div>}

      {/* Help card */}
      {/*showHelp && ready && (
        <div className="absolute left-16 top-1/2 z-10 hidden max-w-[260px] -translate-y-1/2 rounded-2xl border-2 border-white/25 bg-black/55 p-3 text-sm leading-snug backdrop-blur sm:block">
          <div className="mb-1 font-bold text-yellow-300">How to play</div>
          <ul className="list-disc space-y-1 pl-4 opacity-95">
            <li>Pick a tool below (keys 1–0), then click the buddy.</li>
            <li>Click empty sky or drag with right-mouse to rotate the camera. Scroll to zoom.</li>
            <li>Chain hits fast for combos. Fill the pain-o-meter for a K.O. bonus!</li>
            <li>Press <b>N</b> for a new random place.</li>
          </ul>
        </div>
      )*/}

      {/* Model status */}
      {/*model && (
        <div
          className={cn(
            "pointer-events-none absolute bottom-[118px] right-3 z-10 max-w-[70vw] rounded-lg px-2 py-1 text-[11px] sm:bottom-[124px] sm:right-4",
            model.custom ? "bg-emerald-600/80" : "bg-black/45 opacity-80"
          )}
        >
          {model.custom ? "✅ " : "TEST🧑 "}
          {model.text}
        </div>
      )*/}

      {gameStarted && !endingRun && !runEnded && <div className="absolute inset-x-0 bottom-2 z-20 flex justify-center px-2"><div className="weapon-hotbar">{loadout.map((id, index) => { const item = TOOLS.find((entry) => entry.id === id) ?? TOOLS[0]; const keyLabel = index === 9 ? "0" : String(index + 1); return <button key={index} onClick={() => selectTool(id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const dropped = e.dataTransfer.getData("text/tool-id"); if (TOOLS.some((entry) => entry.id === dropped)) { setLoadout((old) => old.map((value, slot) => slot === index ? dropped : value)); selectTool(dropped); } }} className={`weapon-slot ${tool === id ? "active" : ""}`} title={`${keyLabel} · ${item.name}`}><small>{keyLabel}</small><span>{item.emoji}</span></button>; })}</div></div>}
      {menuOpen && ready && !endingRun && !runEnded && (
        <div className="absolute inset-0 z-40 flex items-center justify-start overflow-y-auto bg-gradient-to-r from-[#030712]/65 via-[#030712]/20 to-transparent p-3 backdrop-blur-[2px] sm:p-8">
          <div className={`cyber-menu cyber-menu-side w-full max-w-[440px] ${menuLeaving ? "menu-exit" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-cyan-300/20 p-5 sm:p-7"><div><div className="cyber-kicker">NEON DISTRICT // SYSTEM ONLINE</div><h1 className="cyber-title">WHAT<span>BASH</span></h1><p className="text-xs tracking-[.25em] text-cyan-100/60">RAGDOLL MAYHEM SIMULATOR · BUILD 2099.7</p></div></div>
            <div className="flex flex-wrap gap-2 border-b border-cyan-300/15 p-4">{(["play","arenas","style"] as const).map((tab) => <button key={tab} onClick={() => setMenuTab(tab)} className={`cyber-tab ${menuTab===tab?"active":""}`}>{tab==="play"?"▶ START":tab==="style"?"◈ CHARACTER":"⌖ AREA"}</button>)}</div>
            <div className="min-h-[300px] p-5 sm:p-7">
              {menuTab === "play" && <div className="flex min-h-[270px] flex-col items-center justify-center gap-8 text-center"><div><div className="cyber-kicker mb-3">READY WHEN YOU ARE</div><h2 className="cyber-title">WHAT<span>BASH</span></h2><p className="mt-3 text-sm tracking-widest text-cyan-100/55">LET THE CHAOS BEGIN</p></div><button onClick={() => { if (gameStarted) { setMenuOpen(false); return; } gameRef.current?.startGame(); setMenuLeaving(true); window.setTimeout(() => { setMenuOpen(false); setGameStarted(true); setMenuLeaving(false); }, 1250); }} className="cyber-button px-10 py-4 text-lg">{gameStarted ? "▶ RESUME" : "▶ START"}</button></div>}

              {menuTab === "style" && <div><div className="cyber-kicker">IDENTITY MOD // PROCEDURAL BUDDY</div><h2 className="mb-5 text-2xl font-black">CHARACTER CUSTOMIZATION</h2><div className="grid gap-5 sm:grid-cols-2"><label className="cyber-option">TORSO / ARMOR COLOR<input type="color" value={shirtColor} onChange={(e)=>{setShirtColor(e.target.value);applyStyle(e.target.value,hairColor);}} /></label><label className="cyber-option">HAIR / HEADGEAR COLOR<input type="color" value={hairColor} onChange={(e)=>{setHairColor(e.target.value);applyStyle(shirtColor,e.target.value);}} /></label></div><div className="mt-6 flex items-center gap-4 rounded-xl border border-cyan-200/15 bg-black/30 p-4"><div className="text-5xl">🧑‍🚀</div><div><b>LIVE COLOR SYNC</b><p className="text-sm text-cyan-100/50">Changes apply to the procedural Buddy in the active arena.</p></div></div></div>}
              {menuTab === "arenas" && <div><div className="cyber-kicker">SELECT YOUR DROP ZONE</div><h2 className="mb-4 text-2xl font-black">DISTRICT SELECT</h2><div className="grid max-h-[58vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">{ENVS.map((env)=><button key={env.id} onClick={()=>{chooseArena(env.id);}} className={`cyber-arena ${place.name===env.name?"selected":""}`}><span className="text-3xl">{env.emoji}</span><b>{env.name}</b><small>GRAVITY {Math.abs(env.gravity).toFixed(1)} · {env.groundKind.toUpperCase()}</small></button>)}</div></div>}
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-cyan-300/15 px-5 py-3 text-[10px] tracking-[.2em] text-cyan-100/35"><span>WHATBASH // NEURAL INTERFACE</span><span>{model ? `BUDDY MODEL: ${model.custom ? "CUSTOM" : "PROCEDURAL"}` : "BUDDY SYSTEM ONLINE"}</span><span>CLICK TO CAUSE CHAOS</span></div>
          </div>
        </div>
      )}


      {armoryOpen && gameStarted && !endingRun && !runEnded && <div className="absolute inset-0 z-[55] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md"><section className="cyber-menu cyber-armory w-full max-w-4xl p-4 sm:p-6"><header className="mb-4 flex items-center justify-between gap-3 border-b border-cyan-300/20 pb-4"><div><div className="cyber-kicker">FIELD EQUIPMENT // 100 SYSTEMS</div><h2 className="text-2xl font-black sm:text-3xl">TOOL ARMORY</h2><p className="text-xs text-cyan-100/50">Drag a weapon onto a numbered slot to equip it.</p></div><button aria-label="Close armory" title="Close armory" onClick={() => setArmoryOpen(false)} className="cyber-close">✕</button></header><input value={toolSearch} onChange={(e)=>setToolSearch(e.target.value)} placeholder="Search all 100 tools..." className="cyber-input mb-3 w-full"/><div className="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">{filteredTools.map((t)=><button key={t.id} draggable onDragStart={(e)=>e.dataTransfer.setData("text/tool-id",t.id)} onClick={()=>selectTool(t.id)} className={`cyber-tool ${tool===t.id?"selected":""}`}><span className="text-2xl">{t.emoji}</span><span className="min-w-0 text-left"><b className="block truncate">{t.name}</b><small className="text-cyan-100/45">{t.action.toUpperCase()} CLASS</small></span><span className="ml-auto text-[10px] text-cyan-200/40">#{TOOLS.indexOf(t)+1}</span></button>)}</div><div className="mt-4 flex flex-wrap gap-2">{loadout.map((id,index)=>{const item=TOOLS.find((entry)=>entry.id===id)??TOOLS[0];const label=index===9?"0":String(index+1);return <div key={index} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault();const dropped=e.dataTransfer.getData("text/tool-id");if(TOOLS.some((entry)=>entry.id===dropped)){setLoadout(old=>old.map((value,slot)=>slot===index?dropped:value));selectTool(dropped);}}} className="weapon-slot armory-slot"><small>{label}</small><span>{item.emoji}</span><b>{item.name}</b></div>})}</div></section></div>}
      {endingRun && <div className="end-run-glitch absolute inset-0 z-[70] pointer-events-none"><div className="end-run-scanlines" /><div className="end-run-flash" /><div className="absolute inset-0 flex items-center justify-center"><div className="title-font text-5xl sm:text-8xl tracking-widest text-red-100 glitch-label">404: END</div></div></div>}
      {runEnded && runSummary && <div className="absolute inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#05030b]/95 p-4 backdrop-blur-xl"><div className="end-summary w-full max-w-xl p-6 sm:p-9"><div className="cyber-kicker">SESSION TERMINATED // FINAL REPORT</div><h2 className="title-font my-3 text-6xl tracking-widest text-red-300 sm:text-8xl">404: END</h2><p className="mb-6 text-sm tracking-[.2em] text-cyan-100/55">BUDDY HAS LEFT THE CHAT.</p><div className="grid grid-cols-2 gap-3"><div><b>${runSummary.money.toLocaleString()}</b><span>CREDITS EARNED</span></div><div><b>{runSummary.kos}</b><span>KNOCKOUTS</span></div><div><b>{Math.round(runSummary.pain)}%</b><span>FINAL PAIN</span></div><div><b>{Math.floor((Date.now()-runStartedAt.current)/60000)}m {Math.floor(((Date.now()-runStartedAt.current)/1000)%60)}s</b><span>RUN DURATION</span></div></div><div className="mt-7 flex flex-wrap gap-3"><button onClick={() => window.location.reload()} className="cyber-button px-6 py-3">↻ NEW SESSION</button><span className="self-center text-xs text-cyan-100/40">Run ended. No save prompt will appear.</span></div></div></div>}
    </div>
  );
}

function SideBtn({
  children,
  label,
  on,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center border text-xl transition hover:shadow-[0_0_16px_rgba(34,211,238,.35)] active:scale-95",
        on ? "border-cyan-300 bg-cyan-950/90 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,.35)]" : "border-fuchsia-400/40 bg-slate-950/85 text-fuchsia-100 hover:border-cyan-300"
      )}
    >
      {children}
    </button>
  );
}
