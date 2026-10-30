import React from 'react';
import { getItemMeta } from '../../utils/minecraftItems';
import type { InventoryItem } from './InventoryView';

interface MinecraftTooltipProps {
  item: InventoryItem;
}

export const MinecraftTooltip: React.FC<MinecraftTooltipProps> = ({ item }) => {
  const meta = getItemMeta(item.name);
  const maxDurability = item.maxDurability || 0;
  const durabilityUsed = item.durabilityUsed || 0;
  const currentDurability = Math.max(0, maxDurability - durabilityUsed);

  return (
    <div className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs px-3 py-2 text-left font-mono rounded shadow-2xl border-2 border-[#2b0c59] bg-[#100010]/95 backdrop-blur-sm select-none">
      {/* Inner highlight border matching authentic Minecraft tooltips */}
      <div className="absolute inset-0.5 border border-[#5000ff]/30 pointer-events-none rounded-sm" />

      {/* Item Title in Rarity Color */}
      <div
        className="font-pixel text-[11px] leading-tight mb-1"
        style={{ color: meta.rarityColor }}
      >
        {item.displayName}
      </div>

      {/* Item Category & Count */}
      <div className="text-[10px] text-slate-400 flex items-center justify-between gap-3">
        <span className="capitalize">{meta.category}</span>
        <span>Count: {item.count}</span>
      </div>

      {/* Durability info if applicable */}
      {maxDurability > 0 && (
        <div className="mt-1.5 pt-1 border-t border-[#5000ff]/20 text-[10px] text-slate-300">
          <div className="flex justify-between mb-0.5">
            <span>Durability:</span>
            <span className="text-mc-green font-bold">
              {currentDurability} / {maxDurability}
            </span>
          </div>
          <div className="w-full bg-[#1e2029] h-1 rounded overflow-hidden">
            <div
              className="h-full bg-mc-green"
              style={{ width: `${(currentDurability / maxDurability) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Hint */}
      <div className="text-[9px] text-[#a78bfa] mt-1.5 italic">
        Click slot for toss & equip actions
      </div>
    </div>
  );
};
