import React, { useMemo, useState } from "react";

/**
 * Simple heuristic guide you can refine:
 * - Choose Board Type + Opponent Type + SPR to get sizing & frequency hints.
 * - Outputs suggested c-bet %, size, and notes.
 */
const BOARD_TYPES = [
  "A-high dry (A72r)",
  "K/Q-high dry (K83r)",
  "Paired (JJ4r, 772r)",
  "Low/connected (765r, 964ss)",
  "Monotone (K72♣♣♣)",
  "Two-tone (A93♠♥)",
  "Wet high (KQJtt)",
];

const OPP_TYPES = ["TAG", "LAG", "Calling Station", "Nit", "Unknown"];

function recommend(board, opp, spr) {
  // Very lightweight rules of thumb; adjust as you collect data.
  const base = {
    freq: 55, size: 33, note: "Baseline c-bet"
  };

  if (board.includes("A-high dry")) return { freq: 70, size: 33, note: "Range bet OK; mix checks OOP" };
  if (board.includes("K/Q-high")) return { freq: 60, size: 33, note: "Advantage on BTN/CO; mix checks OOP" };
  if (board.includes("Paired")) return { freq: 65, size: 33, note: "Pressure with overcards/backdoors" };
  if (board.includes("Low/connected")) return { freq: 35, size: 50, note: "Board hits caller; bet less/cap turn" };
  if (board.includes("Monotone")) return { freq: 40, size: 33, note: "Small sizings keep range wide" };
  if (board.includes("Two-tone")) return { freq: 55, size: 33, note: "Standard; plan turns on FD cards" };
  if (board.includes("Wet high")) return { freq: 50, size: 66, note: "Bigger for protection/value" };

  let adj = 0, szAdj = 0, extra = "";
  switch (opp) {
    case "Calling Station": adj -= 10; szAdj += 15; extra = " Value bet big; bluff less."; break;
    case "Nit": adj += 10; szAdj -= 5; extra = " Bluff more; thin value less."; break;
    case "LAG": adj -= 5; szAdj += 10; extra = " Bigger sizings; call down wider."; break;
    case "TAG": default: break;
  }

  if (spr <= 3) { szAdj += 10; extra += " Low SPR favors bigger sizings / commitment."; }
  if (spr >= 6) { adj -= 5; extra += " High SPR: keep pot smaller without strong equity."; }

  const res = { ...base };
  res.freq = Math.min(95, Math.max(10, (res.freq + adj)));
  res.size = Math.min(150, Math.max(25, (res.size + szAdj)));
  res.note += extra;
  return res;
}

export default function BettingGuide({ heroPos = "CO" }) {
  const [board, setBoard] = useState(BOARD_TYPES[0]);
  const [opp, setOpp] = useState(OPP_TYPES[0]);
  const [spr, setSpr] = useState(5);

  const rec = useMemo(() => recommend(board, opp, Number(spr)), [board, opp, spr]);

  return (
    <div className="rounded-2xl p-4 border shadow-sm bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Betting Strategy Guide</div>
        <div className="text-xs text-zinc-500">Position: <span className="font-semibold">{heroPos}</span></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <label>Board type
          <select className="w-full mt-1 px-2 py-1 rounded border" value={board} onChange={e=>setBoard(e.target.value)}>
            {BOARD_TYPES.map(b=> <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label>Opponent
          <select className="w-full mt-1 px-2 py-1 rounded border" value={opp} onChange={e=>setOpp(e.target.value)}>
            {OPP_TYPES.map(o=> <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label>SPR
          <input type="number" step="0.5" min="1" className="w-full mt-1 px-2 py-1 rounded border" value={spr} onChange={e=>setSpr(e.target.value)} />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
          <div className="text-xs text-zinc-500">C‑bet Frequency</div>
          <div className="text-2xl font-bold">{rec.freq}%</div>
        </div>
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
          <div className="text-xs text-zinc-500">Recommended Size</div>
          <div className="text-2xl font-bold">{rec.size}% pot</div>
        </div>
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
          <div className="text-xs text-zinc-500">Notes</div>
          <div className="text-sm">{rec.note}</div>
        </div>
      </div>
      <div className="text-[11px] text-zinc-500 mt-2">Guidelines only — refine as you collect reads and results.</div>
    </div>
  );
}
