"use client";

import { useState } from "react";

export type Inv = { id: string; name: string; type: string; pricePerPiece?: number | null; pricePerBox?: number | null };
export type ItemLine = { itemId: string; customName: string; quantity: number | string; unit: string; consumed: boolean; price: number | string };

const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";
const TYPE_LABEL: Record<string, string> = { EQUIPMENT: "Equipment", TOOL: "Tool", PPE: "PPE", CONSUMABLE: "Consumable" };
const tlabel = (t?: string) => TYPE_LABEL[t ?? ""] ?? (t ?? "");

export const emptyLine = (): ItemLine => ({ itemId: "", customName: "", quantity: 1, unit: "PIECE", consumed: false, price: "" });
export const lineFromApi = (it: Record<string, unknown>): ItemLine => ({
  itemId: String(it.itemId ?? ""), customName: String(it.customName ?? ""), quantity: Number(it.quantity ?? 1),
  unit: String(it.unit ?? "PIECE"), consumed: !!it.consumed, price: it.price == null ? "" : Number(it.price),
});
export function rateOf(l: ItemLine, inv: Inv[]): number {
  const it = inv.find((i) => i.id === l.itemId);
  if (it) return l.unit === "BOX" ? (it.pricePerBox ?? 0) : (it.pricePerPiece ?? 0);
  return Number(l.price) || 0;
}
export const linesCost = (lines: ItemLine[], inv: Inv[]) =>
  lines.filter((l) => l.consumed).reduce((t, l) => t + (Number(l.quantity) || 0) * rateOf(l, inv), 0);
const money = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString()} AED`;

function LinePicker({ line, inv, disabled, onChange }: { line: ItemLine; inv: Inv[]; disabled?: boolean; onChange: (p: Partial<ItemLine>) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const sel = inv.find((i) => i.id === line.itemId);
  const display = line.itemId ? `${sel?.name ?? "item"} (${tlabel(sel?.type)})` : line.customName ? `${line.customName} (Other)` : "";
  const list = inv.filter((i) => `${i.name} ${i.type}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <div className="relative">
      <input className={inputCls} disabled={disabled} placeholder="Search inventory or type a custom item…"
        value={open ? q : display} onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {list.map((i) => (
            <button type="button" key={i.id} onMouseDown={() => { onChange({ itemId: i.id, customName: "", unit: i.type === "CONSUMABLE" ? "PIECE" : "PIECE", consumed: i.type === "CONSUMABLE" }); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50">{i.name} <span className="text-gray-400">({tlabel(i.type)})</span></button>
          ))}
          {q.trim() && (
            <button type="button" onMouseDown={() => { onChange({ itemId: "", customName: q.trim() }); setOpen(false); }}
              className="block w-full border-t border-gray-100 px-3 py-1.5 text-left text-sm text-[#0a8d75] hover:bg-gray-50">➕ Add “{q.trim()}” as Other (not in inventory)</button>
          )}
          {list.length === 0 && !q.trim() && <p className="px-3 py-2 text-xs text-gray-400">Type to search or add a custom item</p>}
        </div>
      )}
    </div>
  );
}

export function ItemLines({ lines, setLines, inv, editing, lockConsumed }: { lines: ItemLine[]; setLines: (l: ItemLine[]) => void; inv: Inv[]; editing: boolean; lockConsumed?: boolean }) {
  const patch = (i: number, p: Partial<ItemLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const isCustom = (l: ItemLine) => !l.itemId && !!l.customName;
  return (
    <div className="space-y-2">
      {lines.length === 0 && <p className="text-xs text-gray-400">No items added.</p>}
      {lines.map((l, i) => (
        <div key={i} className="rounded-lg border border-gray-100 p-2">
          <div className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-5"><LinePicker line={l} inv={inv} disabled={!editing} onChange={(p) => patch(i, p)} /></div>
            <input type="number" min={0} className={`${inputCls} col-span-2`} disabled={!editing} value={l.quantity === 0 ? "" : l.quantity} onChange={(e) => patch(i, { quantity: e.target.value === "" ? "" : Number(e.target.value) })} title="quantity" />
            <select className={`${inputCls} col-span-2`} disabled={!editing} value={l.unit} onChange={(e) => patch(i, { unit: e.target.value })} title="unit"><option value="PIECE">Piece</option><option value="BOX">Box/Packet</option></select>
            <label className="col-span-2 flex items-center gap-1 text-xs text-gray-600" title={isCustom(l) ? "Add this item to Inventory first to mark it used up — so stock and OPEX are tracked from the real price." : lockConsumed ? "Consumption is managed in the linked issuance (Deduct / Return there)." : "Tick if the item is consumed / used up (not returned). Only these count toward the consumable cost."}><input type="checkbox" disabled={!editing || lockConsumed || isCustom(l)} checked={l.consumed && !isCustom(l)} onChange={(e) => patch(i, { consumed: e.target.checked })} /> used up</label>
            {editing && <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="col-span-1 rounded px-1 text-red-600 hover:bg-red-50">✕</button>}
          </div>
          {editing && isCustom(l) && (
            <p className="mt-1 pl-1 text-[11px] text-amber-600">Not in inventory — add it to Inventory to track stock, mark it “used up”, and capture its cost.</p>
          )}
        </div>
      ))}
    </div>
  );
}
