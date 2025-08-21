import React, { useEffect, useMemo, useState } from "react";

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

// Derive BB from stakes string like "$1/$3" or "$2/$5"
function parseBB(stakes) {
  try { const parts = stakes.replace(/\$/g,"").split("/"); return Number(parts[1] || 1); }
  catch { return 1; }
}

export default function BankrollTracker({ stakes }) {
  const [bankroll, setBankroll] = useLocalStorage("psa_bankroll_total", 0);
  const [sessions, setSessions] = useLocalStorage("psa_sessions", []); // {date, hours, buyIn, cashOut, notes, stakes}
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), hours: "", buyIn: "", cashOut: "", notes: "" });

  const bb = parseBB(stakes);
  const rows = useMemo(() => sessions.map(s => {
    const profit = Number(s.cashOut||0) - Number(s.buyIn||0);
    const hourly = s.hours ? profit / Number(s.hours) : 0;
    const bb100 = s.hours ? ( (profit / bb) / (Number(s.hours) * 30) * 100 ) : 0; // rough hands/hour 30 live
    return { ...s, profit, hourly, bb100 };
  }), [sessions, bb]);

  const totals = useMemo(() => {
    const profit = rows.reduce((a,r)=>a+r.profit,0);
    const hours = rows.reduce((a,r)=>a+Number(r.hours||0),0);
    return {
      profit,
      hours,
      hourly: hours ? profit / hours : 0
    };
  }, [rows]);

  function addSession() {
    const entry = { ...form, stakes, hours: Number(form.hours||0), buyIn: Number(form.buyIn||0), cashOut: Number(form.cashOut||0) };
    setSessions(prev => [entry, ...prev]);
    setBankroll(b => b + (entry.cashOut - entry.buyIn));
    setForm({ date: new Date().toISOString().slice(0,10), hours: "", buyIn: "", cashOut: "", notes: "" });
  }

  function clearAll() {
    if (!confirm("Clear ALL sessions and bankroll?")) return;
    setSessions([]); setBankroll(0);
  }

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
      <div className="text-[11px] text-zinc-500 mt-2">BB/100 approximates 30 live hands/hr. Adjust formula later if you track exact hands.</div>
    </div>
  );
}
