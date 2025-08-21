import React from "react";

const POSITIONS = [
  "UTG",
  "UTG+1",
  "MP",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
];

export default function PositionSelector({ heroPos, setHeroPos }) {
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
