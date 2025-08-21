import React, { useEffect, useState } from "react";

const TAGS = ["LAG", "TAG", "Nit", "Calling Station", "Maniac", "Unknown"];

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : initial; }
    catch { return initial; }
  });
  useEffect(()=>{ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key,val]);
  return [val, setVal];
}

export default function OpponentTracker({ seats = 9 }) {
  const [players, setPlayers] = useLocalStorage("psa_opponents", Array.from({length:seats}, (_,i)=>({
    name: `Seat ${i+1}`,
    tag: "Unknown",
    vpip: "",
    pfr: "",
    notes: ""
  })));

  function update(i, patch) {
    setPlayers(prev => prev.map((p,idx)=> idx===i ? {...p, ...patch} : p));
  }

  return (
    <div className="rounded-2xl p-4 border shadow-sm bg-white dark:bg-zinc-900">
      <div className="font-semibold mb-2">Opponent Tracker</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {players.map((p,i)=>(
          <div key={i} className="rounded-xl border p-3">
            <div className="flex items-center gap-2 mb-2">
              <input
                className="px-2 py-1 rounded border w-40"
                value={p.name}
                onChange={e=>update(i,{name:e.target.value})}
              />
              <select
                className="px-2 py-1 rounded border"
                value={p.tag}
                onChange={e=>update(i,{tag:e.target.value})}
              >
                {TAGS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <input
                className="px-2 py-1 rounded border w-20"
                placeholder="VPIP %"
                value={p.vpip}
                onChange={e=>update(i,{vpip:e.target.value})}
              />
              <input
                className="px-2 py-1 rounded border w-20"
                placeholder="PFR %"
                value={p.pfr}
                onChange={e=>update(i,{pfr:e.target.value})}
              />
            </div>
            <textarea
              className="w-full h-20 rounded border p-2"
              placeholder="Notes, exploits, tells…"
              value={p.notes}
              onChange={e=>update(i,{notes:e.target.value})}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
