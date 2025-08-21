import React from "react";

export default function SimulationPresets({ onRun }) {
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
