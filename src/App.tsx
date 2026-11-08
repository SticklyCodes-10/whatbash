import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "./game/engine";
import type { Stats } from "./game/engine";
import { TOOLS } from "./game/tools";
import type { ToolId } from "./game/tools";
import { cn } from "./utils/cn";

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setToolState] = useState<ToolId>("boot");
  const [stats, setStats] = useState<Stats>({ money: 0, pain: 0, combo: 0, kos: 0 });
  const [place, setPlace] = useState({ name: "…", emoji: "🎲" });
  const [model, setModel] = useState<{ text: string; custom: boolean } | null>(null);
  const [stand, setStand] = useState(true);
  const [slow, setSlow] = useState(false);
  const [sound, setSound] = useState(true);
  const [follow, setFollow] = useState(true);
  const [showHelp, setShowHelp] = useState(true);

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

  const selectTool = useCallback((id: ToolId) => {
    setToolState(id);
    gameRef.current?.setTool(id);
  }, []);

  const newPlace = useCallback(() => gameRef.current?.newPlace(), []);
  const reset = useCallback(() => gameRef.current?.resetBuddy(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const n = k === "0" ? 10 : parseInt(k, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= TOOLS.length) selectTool(TOOLS[n - 1].id);
      else if (k === "r") reset();
      else if (k === "n") newPlace();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectTool, reset, newPlace]);

  const current = TOOLS.find((t) => t.id === tool)!;
  const painColor =
    stats.pain < 35 ? "from-lime-400 to-lime-300" : stats.pain < 70 ? "from-yellow-400 to-orange-400" : "from-orange-500 to-red-600";

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-slate-900 select-none text-white"
      style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}
    >
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900 p-6 text-center text-xl">
          {error}
        </div>
      )}

      {!ready && !error && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-sky-500 to-indigo-700">
          <div className="title-font text-6xl tracking-wider drop-shadow-[0_4px_0_rgba(0,0,0,0.35)]">BUDDY BASH 3D</div>
          <div className="animate-bounce text-5xl">🥾</div>
          <div className="text-lg opacity-90">Finding a random place…</div>
        </div>
      )}

      {/* Top-left: title + place */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2 sm:left-4 sm:top-4">
        <div className="title-font text-3xl leading-none tracking-wider text-yellow-300 drop-shadow-[0_3px_0_rgba(0,0,0,0.45)] sm:text-4xl">
          BUDDY BASH <span className="text-white">3D</span>
        </div>
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
      </div>

      {/* Top-right: score */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex w-56 flex-col items-end gap-2 sm:right-4 sm:top-4 sm:w-72">
        <div className="flex items-center gap-2">
          {stats.kos > 0 && (
            <div className="rounded-xl bg-red-600/90 px-2 py-1 text-sm font-bold">💀 {stats.kos}</div>
          )}
          <div className="title-font rounded-2xl border-2 border-yellow-300/60 bg-black/50 px-4 py-1 text-3xl tracking-wide text-yellow-300 backdrop-blur">
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
            {Math.min(stats.combo, 10)}x COMBO
          </div>
        )}
      </div>

      {/* Left: toggles */}
      <div className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 sm:left-4">
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
        <SideBtn label="Help" on={showHelp} onClick={() => setShowHelp(!showHelp)}>❓</SideBtn>
      </div>

      {/* Help card */}
      {showHelp && ready && (
        <div className="absolute left-16 top-1/2 z-10 hidden max-w-[260px] -translate-y-1/2 rounded-2xl border-2 border-white/25 bg-black/55 p-3 text-sm leading-snug backdrop-blur sm:block">
          <div className="mb-1 font-bold text-yellow-300">How to play</div>
          <ul className="list-disc space-y-1 pl-4 opacity-95">
            <li>Pick a tool below (keys 1–0), then click the buddy.</li>
            <li>Click empty sky or drag with right-mouse to rotate the camera. Scroll to zoom.</li>
            <li>Chain hits fast for combos. Fill the pain-o-meter for a K.O. bonus!</li>
            <li>Press <b>N</b> for a new random place.</li>
          </ul>
        </div>
      )}

      {/* Model status */}
      {model && (
        <div
          className={cn(
            "pointer-events-none absolute bottom-[118px] right-3 z-10 max-w-[70vw] rounded-lg px-2 py-1 text-[11px] sm:bottom-[124px] sm:right-4",
            model.custom ? "bg-emerald-600/80" : "bg-black/45 opacity-80"
          )}
        >
          {model.custom ? "✅ " : "TEST🧑 "}
          {model.text}
        </div>
      )}

      {/* Bottom: tool bar */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-2 sm:p-3">
        <div className="rounded-full bg-black/55 px-4 py-1 text-sm font-semibold backdrop-blur">
          <span className="mr-1">{current.emoji}</span>
          <b>{current.name}:</b> {current.hint}
        </div>
        <div className="flex max-w-full gap-2 overflow-x-auto rounded-3xl border-2 border-white/25 bg-black/50 p-2 backdrop-blur">
          {TOOLS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => selectTool(t.id)}
              className={cn(
                "relative flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border-b-4 text-white transition sm:h-[72px] sm:w-[72px]",
                tool === t.id
                  ? "-translate-y-1.5 scale-105 border-yellow-600 bg-yellow-400 text-slate-900 shadow-[0_0_24px_rgba(250,204,21,0.7)]"
                  : "border-slate-900 bg-slate-600 hover:bg-slate-500 active:translate-y-0.5"
              )}
            >
              <span className="absolute left-1.5 top-0.5 text-[10px] font-bold opacity-70">{i === 9 ? 0 : i + 1}</span>
              <span className="text-3xl leading-none sm:text-[34px]">{t.emoji}</span>
              <span className="mt-0.5 text-[11px] font-bold">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
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
        "flex h-11 w-11 items-center justify-center rounded-2xl border-b-4 text-xl transition active:translate-y-0.5 active:border-b-2",
        on ? "border-emerald-800 bg-emerald-500" : "border-slate-900 bg-slate-600/90 hover:bg-slate-500"
      )}
    >
      {children}
    </button>
  );
}
