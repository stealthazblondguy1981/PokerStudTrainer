import React, { useMemo, useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from "recharts";

/* ============================================================
   Poker Stud App — 9-max NLHE Trainer/Helper
   Single-file version with:
   - Card entry per seat + board
   - Monte Carlo equity sim + presets (10/100/1k/10k)
   - Equity vs field size chart
   - Position selector (UTG…BTN/SB/BB)
   - Betting guide (board type × opponent × SPR)
   - Opponent tracker (tags, VPIP/PFR, notes)
   - Bankroll + hourly tracker
   - Tips + simple EV calc + notes
   - LocalStorage persistence
   ============================================================ */

/* ----------------------------- Card helpers ------------------------------ */
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["s","h","d","c"];
const RANK_TO_VAL = Object.fromEntries(RANKS.map((r,i)=>[r,i]));

function makeDeck() {
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}
function cardToObj(cs) { return { r: cs[0], s: cs[1], rv: RANK_TO_VAL[cs[0]] }; }
function parseCard(input) {
  if (!input || input.length !== 2) return null;
  const r = input[0].toUpperCase(); const s = input[1].toLowerCase();
  if (!RANKS.includes(r) || !SUITS.includes(s)) return null;
  return r + s;
}
function formatCard(card) {
  if (!card) return "";
  const r = card[0], s = card[1];
  const suitChar = s === "s" ? "♠" : s === "h" ? "♥" : s === "d" ? "♦" : "♣";
  return r + suitChar;
}
function removeCards(deck, cards) {
  const set = new Set(cards.filter(Boolean));
  return deck.filter(c => !set.has(c));
}

/* ---------------------- 5-card and 7-card evaluators --------------------- */
function rank5(cards) {
  const objs = cards.map(cardToObj).sort((a,b)=>b.rv-a.rv);
  const ranks = objs.map(o=>o.rv);
  const suits = objs.map(o=>o.s);
  const countByRank = new Map();
  for (const rv of ranks) countByRank.set(rv, (countByRank.get(rv)||0)+1);
  const counts = [...countByRank.entries()].sort((a,b)=> b[1]-a[1] || b[0]-a[0]);
  const isFlush = new Set(suits).size === 1;
  const uniqRanks = [...new Set(ranks)];
  let straightHigh = -1;
  const sortedUniq = uniqRanks.slice().sort((a,b)=>b-a);
  for (let i=0;i<=sortedUniq.length-5;i++) {
    const w = sortedUniq.slice(i,i+5);
    if (w[0]-w[4]===4) { straightHigh = w[0]; break; }
  }
  // Wheel A-5
  if (straightHigh === -1 &&
      uniqRanks.includes(RANK_TO_VAL["A"]) &&
      uniqRanks.includes(0) && uniqRanks.includes(1) &&
      uniqRanks.includes(2) && uniqRanks.includes(3)) straightHigh = 3;

  if (isFlush && straightHigh !== -1) return [8, straightHigh];
  if (counts[0][1] === 4) return [7, counts[0][0], counts[1][0]];
  if (counts[0][1] === 3 && counts[1]?.[1] === 2) return [6, counts[0][0], counts[1][0]];
  if (isFlush) return [5, ...ranks];
  if (straightHigh !== -1) return [4, straightHigh];
  if (counts[0][1] === 3) {
    const kickers = counts.filter(x=>x[1]===1).map(x=>x[0]).sort((a,b)=>b-a);
    return [3, counts[0][0], ...kickers];
  }
  if (counts[0][1] === 2 && counts[1]?.[1] === 2) {
    const pairHigh = Math.max(counts[0][0], counts[1][0]);
    const pairLow = Math.min(counts[0][0], counts[1][0]);
    const kicker = counts.find(x=>x[1]===1)?.[0] ?? -1;
    return [2, pairHigh, pairLow, kicker];
  }
  if (counts[0][1] === 2) {
    const kickers = counts.filter(x=>x[1]===1).map(x=>x[0]).sort((a,b)=>b-a);
    return [1, counts[0][0], ...kickers];
  }
  return [0, ...ranks];
}
function compareRank(a,b){
  const len = Math.max(a.length,b.length);
  for (let i=0;i<len;i++){ const av=a[i]??-1, bv=b[i]??-1; if (av!==bv) return av-bv; }
  return 0;
}
function bestOf7(cards7) {
  let best = null;
  const idx = [0,1,2,3,4,5,6];
  for (let a=0;a<3;a++) for (let b=a+1;b<4;b++) for (let c=b+1;c<5;c++) for (let d=c+1;d<6;d++) for (let e=d+1;e<7;e++) {
    const hand = [idx[a],idx[b],idx[c],idx[d],idx[e]].map(i=>cards7[i]);
    const r = rank5(hand);
    if (!best || compareRank(r,best)>0) best = r;
  }
  return best;
}

/* ---------------------------- Monte Carlo sim ---------------------------- */
function simulateEquity({ players, heroIndex, board, dead, trials=5000, rngSeed }){
  const seed = rngSeed ?? 1337;
  let s = seed >>> 0;
  const rand = ()=> (s = (s * 1664525 + 1013904223) >>> 0, s / 2**32);

  const used = new Set([ ...board, ...dead, ...players.flatMap(p=>p.cards).filter(Boolean) ]);
  const baseDeck = makeDeck().filter(c=>!used.has(c));

  const n = players.length;
  const wins = Array(n).fill(0);
  const ties = Array(n).fill(0);
  const needBoard = 5 - board.length;
  const holeNeeded = players.map(p=> 2 - p.cards.filter(Boolean).length);

  if (baseDeck.length < needBoard + holeNeeded.reduce((a,b)=>a+b,0)) {
    return { wins, ties, trials: 0 };
  }

  const deckArr = baseDeck.slice();

  for (let t=0; t<trials; t++){
    const d = deckArr.slice();
    for (let i=d.length-1; i>0; i--) { const j = Math.floor(rand()*(i+1)); [d[i],d[j]] = [d[j],d[i]]; }
    let ptr = 0;

    const trialHoles = players.map((p,pi)=>{
      const have = p.cards.filter(Boolean);
      const need = holeNeeded[pi];
      const extra = d.slice(ptr, ptr+need); ptr += need;
      return have.concat(extra);
    });

    const trialBoard = board.slice().concat(d.slice(ptr, ptr+needBoard));
    ptr += needBoard;

    const ranks = trialHoles.map(hole => bestOf7(hole.concat(trialBoard)));
    let best = ranks[0];
    for (let i=1;i<n;i++) if (compareRank(ranks[i],best)>0) best = ranks[i];
    const winners = [];
    for (let i=0;i<n;i++) if (compareRank(ranks[i],best)===0) winners.push(i);
    if (winners.length===1) wins[winners[0]]++; else { for (const w of winners) ties[w]++; }
  }
  return { wins, ties, trials };
}

/* ------------------------------ UI atoms --------------------------------- */
function CardInput({ label, value, onChange, blocked }){
  const [text, setText] = useState(value || "");
  useEffect(()=>setText(value||""), [value]);
  const valid = !value || parseCard(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-16">{label}</span>
      <input
        value={text}
        onChange={e=>{
          const v = e.target.value.replace(/\s+/g,"");
          setText(v);
          const pc = parseCard(v);
          if (pc && !blocked.has(pc)) onChange(pc);
          else if (v === "") onChange("");
        }}
        placeholder="As"
        className={`w-16 px-2 py-1 rounded border bg-white dark:bg-zinc-900 ${valid?"border-zinc-300":"border-red-500"}`}
      />
      <div className="text-sm tabular-nums w-10">{formatCard(value)}</div>
    </div>
  );
}

function HoleCardsEditor({ players, onChange, blocked }){
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-3">
      {players.map((p, i)=> (
        <div key={i} className={`rounded-2xl p-3 shadow-sm border ${p.active?"bg-white dark:bg-zinc-900":"bg-zinc-50 dark:bg-zinc-800 opacity-60"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Seat {i+1} {p.isHero && <span className="text-blue-600">(You)</span>}</div>
            <label className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={p.active} onChange={e=> onChange(i, { active: e.target.checked })} /> Active
            </label>
          </div>
          <div className="flex items-center gap-3">
            <CardInput label="Card 1" value={p.cards[0]||""} onChange={v=> onChange(i,{ cards: [v, p.cards[1]||""] })} blocked={blocked} />
            <CardInput label="Card 2" value={p.cards[1]||""} onChange={v=> onChange(i,{ cards: [p.cards[0]||"", v] })} blocked={blocked} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <button className="text-xs underline" onClick={()=> onChange(i,{ cards:["",""] })}>Clear</button>
            <button className="text-xs underline" onClick={()=> onChange(i,{ isHero: !p.isHero })}>{p.isHero?"Unset hero":"Set as hero"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardEditor({ board, onChange, blocked }){
  return (
    <div className="rounded-2xl p-3 border shadow-sm bg-white dark:bg-zinc-900">
      <div className="font-medium mb-2">Board</div>
      <div className="flex flex-wrap gap-3">
        {[0,1,2,3,4].map(i=> (
          <CardInput key={i} label={["Flop 1","Flop 2","Flop 3","Turn","River"][i]} value={board[i]||""} onChange={v=> {
            const n = board.slice(); n[i]=v; onChange(n);
          }} blocked={blocked} />
        ))}
      </div>
      <div className="mt-2"><button className="text-xs underline" onClick={()=> onChange(["","","","",""])}>Clear board</button></div>
    </div>
  );
}

function StakesToggle({ stakes, setStakes }){
  return (
    <div className="inline-flex rounded-2xl border shadow-sm overflow-hidden">
      {["$1/$3","$2/$5"].map(s=> (
        <button key={s} className={`px-3 py-1 text-sm ${stakes===s?"bg-blue-600 text-white":"bg-white dark:bg-zinc-900"}`} onClick={()=> setStakes(s)}>{s}</button>
      ))}
    </div>
  );
}

function ResultsTable({ players, results }){
  const total = results?.trials || 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-2">Seat</th>
            <th className="py-2 pr-2">Player</th>
            <th className="py-2 pr-2">Hand</th>
            <th className="py-2 pr-2 text-right">Win %</th>
            <th className="py-2 pr-2 text-right">Tie %</th>
            <th className="py-2 pr-2 text-right">Equity %</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p,i)=>{
            const w = results?.wins?.[i] ?? 0;
            const t = results?.ties?.[i] ?? 0;
            const winP = total? (w/total*100):0;
            const tieP = total? (t/total*100):0;
            const equity = total? ((w + t/(results.ties.filter(x=>x>0).length || 1))/total*100):0; // approx
            return (
              <tr key={i} className={`border-b last:border-b-0 ${p.isHero?"bg-blue-50 dark:bg-blue-900/20": ""}`}>
                <td className="py-2 pr-2">{i+1}</td>
                <td className="py-2 pr-2">{p.isHero?"You":"Villain"} {p.active?"":"(folded)"}</td>
                <td className="py-2 pr-2 font-mono">{formatCard(p.cards[0])} {formatCard(p.cards[1])}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{winP.toFixed(1)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{tieP.toFixed(1)}</td>
                <td className="py-2 pr-2 text-right font-medium tabular-nums">{equity.toFixed(1)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="text-xs text-gray-500 mt-1">Trials: {total.toLocaleString()}</div>
    </div>
  );
}

function EquityChart({ data }){
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="opponents" label={{ value: "Opponents", position: "insideBottomRight", offset: -5 }} />
          <YAxis domain={[0, 100]} tickFormatter={(v)=>`${v}%`} />
          <Tooltip formatter={(v)=>`${v.toFixed? v.toFixed(1):v}%`} />
          <Legend />
          <Line type="monotone" dataKey="equity" name="Hero equity" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TipsPanel(){
  const tips = [
    { t:"Position > cards", d:"Open wider on BTN/CO; tighten UTG/MP. 3-bet more from late." },
    { t:"SPR awareness", d:"SPR < 3 favors top pair/overpairs; SPR > 6 favors strong made hands/draws."},
    { t:"Bet sizing", d:"33–66% c-bets; 75–100% polar turns; occasional overbets on nut advantage."},
    { t:"Board coverage", d:"Check more on low/connected boards; bet more on A-high/dry."},
    { t:"Combo counting", d:"Blockers/unblockers guide bluff/value selection."},
    { t:"Exploitative", d:"Vs stations: value big, bluff less. Vs nits: bluff more, thin value less."},
    { t:"Live tells", d:"Timing, chip handling, speech, sizing deviations. Don’t over-weight one datapoint."},
    { t:"Preflop baselines", d:"UTG 8–10%, MP 10–12%, CO 25%, BTN 40–45%, SB 35% vs folds."},
    { t:"Bankroll", d:"Live cash: 30–50 buy-ins typical; adjust by edge/risk tolerance."},
  ];
  return (
    <div className="rounded-2xl p-4 border shadow-sm bg-white dark:bg-zinc-900">
      <div className="font-semibold mb-2">Quick Tips & Reminders</div>
      <ul className="space-y-1 text-sm">
        {tips.map((x,i)=> <li key={i}><span className="font-medium">{x.t}:</span> {x.d}</li>)}
      </ul>
    </div>
  );
}

function ControlBar({ onSim, onDeal, onClear, trials, setTrials, onSave, onLoad }){
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="px-3 py-2 rounded-2xl bg-blue-600 text-white shadow" onClick={onSim}>Run Simulation</button>
      <button className="px-3 py-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800" onClick={onDeal}>Deal Random</button>
      <button className="px-3 py-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800" onClick={onClear}>Clear All</button>
      <label className="text-sm ml-2">Trials
        <input type="range" min={1000} max={20000} step={1000} value={trials} onChange={e=>setTrials(parseInt(e.target.value))} className="w-48 ml-2"/>
        <span className="ml-2 tabular-nums">{trials.toLocaleString()}</span>
      </label>
      <button className="ml-auto px-3 py-2 rounded-2xl bg-emerald-600 text-white" onClick={onSave}>Save Setup</button>
      <button className="px-3 py-2 rounded-2xl bg-emerald-100 dark:bg-emerald-900" onClick={onLoad}>Load Setup</button>
    </div>
  );
}

/* ----------------------- Extra feature components ------------------------ */
function PositionSelector({ heroPos, setHeroPos }) {
  const POSITIONS = ["UTG","UTG+1","MP","LJ","HJ","CO","BTN","SB","BB"];
  return (
    <div className="p-4 rounded-xl bg-zinc-800 text-white shadow">
      <h2 className="text-lg font-bold mb-2">Hero Position</h2>
      <div className="grid grid-cols-3 gap-2">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setHeroPos(pos)}
            className={`px-3 py-2 rounded-lg font-semibold transition ${
              heroPos === pos
                ? "bg-yellow-500 text-black"
                : "bg-zinc-700 hover:bg-zinc-600"
            }`}
          >
            {pos}
          </button>
        ))}
      </div>
    </div>
  );
}

function SimulationPresetsInline({ onRun }) {
  const presets = [10, 100, 1000, 10000];
  return (
    <div className="p-4 rounded-xl border shadow-sm bg-white dark:bg-zinc-900">
      <div className="font-semibold mb-2">Quick Sim Presets</div>
      <div className="flex flex-wrap gap-2">
        {presets.map((t) => (
          <button
            key={t}
            onClick={() => onRun(t)}
            className="px-3 py-2 rounded-xl bg-blue-600 text-white hover:opacity-90"
            title={`Run ${t.toLocaleString()} trials`}
          >
            {t.toLocaleString()}
          </button>
        ))}
      </div>
      <div className="text-xs text-zinc-500 mt-2">
        Presets run Monte Carlo with those exact trial counts.
      </div>
    </div>
  );
}

function BettingGuide({ heroPos = "CO" }) {
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

  const [board, setBoard] = useState(BOARD_TYPES[0]);
  const [opp, setOpp] = useState(OPP_TYPES[0]);
  const [spr, setSpr] = useState(5);

  function recommend(board, opp, spr) {
    const base = { freq: 55, size: 33, note: "Baseline c-bet." };
    if (board.includes("A-high dry")) return { freq: 70, size: 33, note: "Range bet OK; mix checks OOP." };
    if (board.includes("K/Q-high")) return { freq: 60, size: 33, note: "Advantage on BTN/CO; mix checks OOP." };
    if (board.includes("Paired")) return { freq: 65, size: 33, note: "Pressure with overcards/backdoors." };
    if (board.includes("Low/connected")) return { freq: 35, size: 50, note: "Board hits caller; reduce freq." };
    if (board.includes("Monotone")) return { freq: 40, size: 33, note: "Small sizings keep range wide." };
    if (board.includes("Two-tone")) return { freq: 55, size: 33, note: "Standard; plan turns on FD cards." };
    if (board.includes("Wet high")) return { freq: 50, size: 66, note: "Bigger for protection/value." };

    let adj = 0, szAdj = 0, extra = "";
    switch (opp) {
      case "Calling Station": adj -= 10; szAdj += 15; extra = " Value big; bluff less."; break;
      case "Nit": adj += 10; szAdj -= 5; extra = " Bluff more; thin value less."; break;
      case "LAG": adj -= 5; szAdj += 10; extra = " Larger sizings; call down wider."; break;
      case "TAG": default: break;
    }
    if (spr <= 3) { szAdj += 10; extra += " Low SPR → bigger sizings/commitment."; }
    if (spr >= 6) { adj -= 5; extra += " High SPR → smaller pots without strong equity."; }

    return {
      freq: Math.min(95, Math.max(10, base.freq + adj)),
      size: Math.min(150, Math.max(25, base.size + szAdj)),
      note: base.note + extra
    };
  }

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
            {["TAG","LAG","Calling Station","Nit","Unknown"].map(o=> <option key={o} value={o}>{o}</option>)}
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
      <div className="text-[11px] text-zinc-500 mt-2">Guidelines only — refine with reads and results.</div>
    </div>
  );
}

function OpponentTracker({ seats = 9 }) {
  const [players, setPlayers] = useState(()=> {
    try { const v = localStorage.getItem("psa_opponents"); return v? JSON.parse(v) : Array.from({length:seats}, (_,i)=>({ name:`Seat ${i+1}`, tag:"Unknown", vpip:"", pfr:"", notes:"" })); }
    catch { return Array.from({length:seats}, (_,i)=>({ name:`Seat ${i+1}`, tag:"Unknown", vpip:"", pfr:"", notes:"" })); }
  });
  useEffect(()=>{ try { localStorage.setItem("psa_opponents", JSON.stringify(players)); } catch {} }, [players]);

  const TAGS = ["LAG", "TAG", "Nit", "Calling Station", "Maniac", "Unknown"];
  function update(i, patch) { setPlayers(prev=> prev.map((p,idx)=> idx===i? {...p, ...patch} : p)); }

  return (
    <div className="rounded-2xl p-4 border shadow-sm bg-white dark:bg-zinc-900">
      <div className="font-semibold mb-2">Opponent Tracker</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {players.map((p,i)=>(
          <div key={i} className="rounded-xl border p-3">
            <div className="flex items-center gap-2 mb-2">
              <input className="px-2 py-1 rounded border w-40" value={p.name} onChange={e=>update(i,{name:e.target.value})}/>
              <select className="px-2 py-1 rounded border" value={p.tag} onChange={e=>update(i,{tag:e.target.value})}>
                {TAGS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <input className="px-2 py-1 rounded border w-20" placeholder="VPIP %" value={p.vpip} onChange={e=>update(i,{vpip:e.target.value})}/>
              <input className="px-2 py-1 rounded border w-20" placeholder="PFR %" value={p.pfr} onChange={e=>update(i,{pfr:e.target.value})}/>
            </div>
            <textarea className="w-full h-20 rounded border p-2" placeholder="Notes, exploits, tells…" value={p.notes} onChange={e=>update(i,{notes:e.target.value})}/>
          </div>
        ))}
      </div>
    </div>
  );
}

function BankrollTracker({ stakes }) {
  const [bankroll, setBankroll] = useState(()=> {
    try { const v = localStorage.getItem("psa_bankroll_total"); return v? JSON.parse(v): 0; } catch { return 0; }
  });
  const [sessions, setSessions] = useState(()=> {
    try { const v = localStorage.getItem("psa_sessions"); return v? JSON.parse(v): []; } catch { return []; }
  });
  useEffect(()=>{ try { localStorage.setItem("psa_bankroll_total", JSON.stringify(bankroll)); } catch {} }, [bankroll]);
  useEffect(()=>{ try { localStorage.setItem("psa_sessions", JSON.stringify(sessions)); } catch {} }, [sessions]);

  function parseBB(stakesStr){ try{ const parts = stakesStr.replace(/\$/g,"").split("/"); return Number(parts[1]||1);}catch{return 1;} }
  const bb = parseBB(stakes);
  const [form, setForm] = useState({ date:new Date().toISOString().slice(0,10), hours:"", buyIn:"", cashOut:"", notes:"" });

  const rows = useMemo(()=> sessions.map(s=>{
    const profit = Number(s.cashOut||0) - Number(s.buyIn||0);
    const hourly = s.hours ? profit / Number(s.hours) : 0;
    const bb100 = s.hours ? (((profit / bb) / (Number(s.hours) * 30)) * 100) : 0; // ~30 live hands/hr
    return { ...s, profit, hourly, bb100 };
  }), [sessions, bb]);

  const totals = useMemo(()=>{
    const profit = rows.reduce((a,r)=>a+r.profit,0);
    const hours = rows.reduce((a,r)=>a+Number(r.hours||0),0);
    return { profit, hours, hourly: hours? profit/hours : 0 };
  }, [rows]);

  function addSession(){
    const entry = { ...form, stakes, hours:Number(form.hours||0), buyIn:Number(form.buyIn||0), cashOut:Number(form.cashOut||0) };
    setSessions(prev=> [entry, ...prev]);
    setBankroll(b=> b + (entry.cashOut - entry.buyIn));
    setForm({ date:new Date().toISOString().slice(0,10), hours:"", buyIn:"", cashOut:"", notes:"" });
  }
  function clearAll(){ if (!confirm("Clear ALL sessions and bankroll?")) return; setSessions([]); setBankroll(0); }

  return (
    <div className="rounded-2xl p-4 border shadow-sm bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Bankroll & Hourly</div>
        <div className="text-sm">Bankroll: <span className="font-bold">${bankroll.toLocaleString()}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <label className="col-span-1">Date
          <input type="date" className="w-full mt-1 px-2 py-1 rounded border" value={form.date} onChange={e=>setForm(f=>({...f, date:e.target.value}))}/>
        </label>
        <label>Hours
          <input type="number" step="0.1" className="w-full mt-1 px-2 py-1 rounded border" value={form.hours} onChange={e=>setForm(f=>({...f, hours:e.target.value}))}/>
        </label>
        <label>Buy-in ($)
          <input type="number" className="w-full mt-1 px-2 py-1 rounded border" value={form.buyIn} onChange={e=>setForm(f=>({...f, buyIn:e.target.value}))}/>
        </label>
        <label>Cash-out ($)
          <input type="number" className="w-full mt-1 px-2 py-1 rounded border" value={form.cashOut} onChange={e=>setForm(f=>({...f, cashOut:e.target.value}))}/>
        </label>
        <label className="col-span-2">Notes
          <input className="w-full mt-1 px-2 py-1 rounded border" value={form.notes} onChange={e=>setForm(f=>({...f, notes:e.target.value}))}/>
        </label>
        <div className="col-span-2 flex gap-2">
          <button className="px-3 py-2 rounded-xl bg-emerald-600 text-white" onClick={addSession}>Add Session</button>
          <button className="px-3 py-2 rounded-xl bg-zinc-100" onClick={clearAll}>Reset</button>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <div className="font-medium mb-1">Totals</div>
        <div className="grid grid-cols-3 gap-2">
          <div>Profit: <span className="font-semibold">${totals.profit.toFixed(2)}</span></div>
          <div>Hours: <span className="font-semibold">{totals.hours.toFixed(1)}</span></div>
          <div>$/hr: <span className="font-semibold">${totals.hourly.toFixed(2)}</span></div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2">Stakes</th>
              <th className="py-1 pr-2">Hours</th>
              <th className="py-1 pr-2 text-right">Buy‑in</th>
              <th className="py-1 pr-2 text-right">Cash‑out</th>
              <th className="py-1 pr-2 text-right">Profit</th>
              <th className="py-1 pr-2 text-right">$/hr</th>
              <th className="py-1 pr-2 text-right">BB/100</th>
              <th className="py-1 pr-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i)=>(
              <tr key={i} className="border-b">
                <td className="py-1 pr-2">{r.date}</td>
                <td className="py-1 pr-2">{r.stakes}</td>
                <td className="py-1 pr-2">{r.hours}</td>
                <td className="py-1 pr-2 text-right">${r.buyIn.toFixed(2)}</td>
                <td className="py-1 pr-2 text-right">${r.cashOut.toFixed(2)}</td>
                <td className="py-1 pr-2 text-right font-medium">${r.profit.toFixed(2)}</td>
                <td className="py-1 pr-2 text-right">${r.hourly.toFixed(2)}</td>
                <td className="py-1 pr-2 text-right">{r.bb100.toFixed(1)}</td>
                <td className="py-1 pr-2">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-zinc-500 mt-2">BB/100 approximates ~30 live hands/hr.</div>
    </div>
  );
}

/* --------------------------- LocalStorage hook --------------------------- */
function useLocalStorage(key, initial){
  const [val, setVal] = useState(()=>{
    try { const v = localStorage.getItem(key); return v? JSON.parse(v): initial; } catch { return initial; }
  });
  useEffect(()=>{ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key,val]);
  return [val, setVal];
}

/* ================================ App ==================================== */
export default function PokerStudApp(){
  const [stakes, setStakes] = useLocalStorage("psa_stakes", "$2/$5");
  const [players, setPlayers] = useLocalStorage("psa_players", Array.from({length:9}, (_,i)=>({ active: i<9, isHero: i===0, cards:["",""] })));
  const [board, setBoard] = useLocalStorage("psa_board", ["","","","",""]);
  const [dead, setDead] = useLocalStorage("psa_dead", []);
  const [trials, setTrials] = useLocalStorage("psa_trials", 6000);
  const [results, setResults] = useState(null);
  const [equityData, setEquityData] = useState([]);
  const [heroPos, setHeroPos] = useLocalStorage("psa_heroPos", "CO");

  const activePlayers = players.map((p)=> p.active? p : { ...p, cards:["",""]});
  const heroIndex = players.findIndex(p=>p.isHero) ?? 0;

  const blocked = useMemo(()=> new Set([ ...board, ...dead, ...players.flatMap(p=>p.cards).filter(Boolean) ]), [board, dead, players]);

  const updatePlayer = (idx, patch)=>{
    setPlayers(prev=> prev.map((p,i)=> i===idx ? { ...p, ...patch, cards: patch.cards ? patch.cards : p.cards } : p));
  };

  function randomDeal(){
    const d = removeCards(makeDeck(), [...board, ...dead]);
    for (let i=d.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
    let ptr=0; const np = players.map(p=> ({...p}));
    for (let i=0;i<np.length;i++) if (np[i].active){
      if (!np[i].cards[0]) np[i].cards[0] = d[ptr++];
      if (!np[i].cards[1]) np[i].cards[1] = d[ptr++];
    }
    const nb = board.slice();
    for (let i=0;i<5;i++) if (!nb[i]) nb[i]=d[ptr++];
    setPlayers(np); setBoard(nb);
  }
  function clearAll(){
    setPlayers(Array.from({length:9}, (_,i)=>({ active: i<9, isHero: i===0, cards:["",""] })));
    setBoard(["","","","",""]); setDead([]); setResults(null); setEquityData([]);
  }
  function runSim(){
    const sim = simulateEquity({ players: activePlayers, heroIndex, board: board.filter(Boolean), dead, trials });
    setResults(sim);
  }
  function runSimWithTrials(t) {
    const sim = simulateEquity({ players: activePlayers, heroIndex, board: board.filter(Boolean), dead, trials: t });
    setResults(sim);
    setTrials(t);
  }
  function saveSetup(){
    const payload = { stakes, players, board, dead, trials, heroPos };
    try { localStorage.setItem("psa_saved_setup", JSON.stringify(payload)); alert("Saved."); } catch { alert("Save failed (localStorage)." )}
  }
  function loadSetup(){
    try {
      const raw = localStorage.getItem("psa_saved_setup"); if (!raw) return alert("No saved setup found.");
      const payload = JSON.parse(raw);
      setStakes(payload.stakes); setPlayers(payload.players); setBoard(payload.board);
      setDead(payload.dead); setTrials(payload.trials); setHeroPos(payload.heroPos || "CO");
    } catch { alert("Load failed."); }
  }

  // Equity vs field size for current hero hand (board hidden)
  useEffect(()=>{
    const hero = players.find(p=>p.isHero) || players[0];
    const hCards = hero.cards.filter(Boolean);
    if (hCards.length!==2){ setEquityData([]); return; }
    const data = [];
    for (let opp=1; opp<=8; opp++){
      const simPlayers = [ {active:true, isHero:true, cards:hCards.slice()}, ...Array.from({length:opp}, ()=>({active:true, isHero:false, cards:["",""]})) ];
      const sim = simulateEquity({ players: simPlayers, heroIndex:0, board: [], dead: [], trials: 2500 });
      const tieBuckets = Math.max(1, sim.ties.reduce((a,b)=>a+(b>0?1:0),0));
      const eq = sim.trials? ( (sim.wins[0] + sim.ties[0]/tieBuckets) / sim.trials * 100 ) : 0;
      data.push({ opponents: opp, equity: eq });
    }
    setEquityData(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.map(p=>p.cards.join(":")).join("|")]);

  const blockersUI = (
    <div className="rounded-2xl p-3 border shadow-sm bg-white dark:bg-zinc-900">
      <div className="font-medium mb-2">Dead / Blocked Cards</div>
      <div className="flex flex-wrap gap-2">
        <input className="w-24 px-2 py-1 rounded border" placeholder="e.g. Ah" onKeyDown={(e)=>{
          if (e.key==='Enter'){
            const pc = parseCard(e.currentTarget.value);
            if (pc && !blocked.has(pc)) { setDead(d=> [...d, pc]); e.currentTarget.value=''; }
          }
        }} />
        <button className="px-2 py-1 rounded bg-zinc-100" onClick={()=> setDead([])}>Clear</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {dead.map((c,i)=> (
          <span key={i} className="px-2 py-1 rounded-full bg-zinc-100 text-sm">{formatCard(c)} <button className="ml-1" onClick={()=> setDead(d=> d.filter((_,j)=> j!==i))}>×</button></span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 text-zinc-900 dark:text-zinc-100 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 min-h-screen">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-wide">🐺 Poker Stud Trainer</h1>
        <div className="text-sm text-zinc-300">
          9‑Max NL Hold’em • Stakes: <StakesToggle stakes={stakes} setStakes={setStakes} />
        </div>
      </div>

      <ControlBar
        onSim={runSim}
        onDeal={randomDeal}
        onClear={clearAll}
        trials={trials}
        setTrials={setTrials}
        onSave={saveSetup}
        onLoad={loadSetup}
      />

      <SimulationPresetsInline onRun={runSimWithTrials} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <HoleCardsEditor players={players} onChange={updatePlayer} blocked={blocked} />
          <BoardEditor board={board} onChange={setBoard} blocked={blocked} />
          {blockersUI}
          <div className="rounded-2xl p-4 border shadow-sm bg-white/90 dark:bg-zinc-900/80">
            <div className="font-semibold mb-2">Equity vs Field Size (for your current hand)</div>
            {equityData.length? <EquityChart data={equityData} /> : <div className="text-sm text-zinc-500">Enter both hero cards to see the chart.</div>}
          </div>
          <div className="rounded-2xl p-4 border shadow-sm bg-white/90 dark:bg-zinc-900/80">
            <div className="font-semibold mb-2">Results</div>
            {results? <ResultsTable players={players} results={results} /> : <div className="text-sm text-zinc-500">Run a simulation to see win/tie/equity per seat.</div>}
          </div>
        </div>

        <div className="space-y-4">
          <PositionSelector heroPos={heroPos} setHeroPos={setHeroPos} />
          <BettingGuide heroPos={heroPos} />
          <div className="rounded-2xl p-4 border shadow-sm bg-white dark:bg-zinc-900">
            <div className="font-semibold mb-2">Notes</div>
            <textarea
              className="w-full h-32 rounded-xl border p-2 bg-white dark:bg-zinc-900"
              placeholder="Session notes, reads, exploits…"
              defaultValue={localStorage.getItem("psa_notes")||""}
              onChange={(e)=> localStorage.setItem("psa_notes", e.target.value)}
            />
          </div>
          <div className="rounded-2xl p-4 border shadow-sm bg-white dark:bg-zinc-900">
            <div className="font-semibold mb-2">EV Helper</div>
            <div className="text-sm grid grid-cols-2 gap-2">
              <label className="col-span-2">Pot ($) <input id="ev_pot" className="ml-2 w-24 px-2 py-1 rounded border" type="number" step="1" defaultValue={0} /></label>
              <label>Bet ($) <input id="ev_bet" className="ml-2 w-24 px-2 py-1 rounded border" type="number" step="1" defaultValue={0} /></label>
              <label>Equity (%) <input id="ev_eq" className="ml-2 w-24 px-2 py-1 rounded border" type="number" step="0.1" defaultValue={0} /></label>
              <button
                className="col-span-2 mt-1 px-3 py-2 rounded-2xl bg-zinc-100"
                onClick={()=>{
                  const pot = parseFloat(document.getElementById('ev_pot').value)||0;
                  const bet = parseFloat(document.getElementById('ev_bet').value)||0;
                  const eq = (parseFloat(document.getElementById('ev_eq').value)||0)/100;
                  const ev = eq*(pot) - (1-eq)*bet;
                  alert(`EV of betting: $${ev.toFixed(2)}`);
                }}
              >Calc Bet EV</button>
              <div className="col-span-2 text-xs text-zinc-500">Use equity from sim as input.</div>
            </div>
          </div>
          <OpponentTracker seats={9} />
          <BankrollTracker stakes={stakes} />
        </div>
      </div>

      <footer className="text-xs text-zinc-400">
        Odds are Monte Carlo estimates. River with all cards known is exact via best‑of‑7 comparison.
      </footer>
    </div>
  );
}
