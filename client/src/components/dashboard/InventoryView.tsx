import React, { useState, useEffect } from 'react';
import { Package, Trash2, ArrowUpRight, Shield, Hand } from 'lucide-react';
import { MinecraftTooltip } from './MinecraftTooltip';
import { getItemMeta } from '../../utils/minecraftItems';
import { sounds } from '../../utils/audio';

export interface InventoryItem {
  slot: number;
  name: string;
  displayName: string;
  count: number;
  maxStackSize?: number;
  durabilityUsed?: number;
  maxDurability?: number;
  type: number;
}

interface InventoryViewProps {
  items: InventoryItem[];
  onTossItem: (slot: number, count?: number) => void;
  onEquipItem: (slot: number, destination: 'hand' | 'off-hand' | 'head' | 'torso' | 'legs' | 'feet') => void;
  onTossAll: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  onTossItem,
  onEquipItem,
  onTossAll,
}) => {
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [activeHotbarIndex, setActiveHotbarIndex] = useState<number>(0); // 0 to 8 (slots 36 to 44)

  // Map items by slot index
  const itemMap = new Map<number, InventoryItem>();
  items.forEach((item) => {
    itemMap.set(item.slot, item);
  });

  // Support hotkeys 1-9 to select active hotbar slot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in an input or textarea, ignore
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        setActiveHotbarIndex(num - 1);
        sounds.playClick();
        // Equip item in hotbar slot to main hand
        const hotbarSlot = 36 + (num - 1);
        if (itemMap.has(hotbarSlot)) {
          onEquipItem(hotbarSlot, 'hand');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, onEquipItem]);

  const handleSlotClick = (slotNumber: number) => {
    sounds.playClick();
    const item = itemMap.get(slotNumber);
    if (item) {
      setSelectedItem(item);
    }

    // If clicking a hotbar slot, also set as active hotbar index
    if (slotNumber >= 36 && slotNumber <= 44) {
      setActiveHotbarIndex(slotNumber - 36);
      onEquipItem(slotNumber, 'hand');
    }
  };

  const renderSlot = (slotNumber: number, isHotbar: boolean = false) => {
    const item = itemMap.get(slotNumber);
    const isSelected = selectedItem?.slot === slotNumber;
    const isHovered = hoveredSlot === slotNumber;
    const isCurrentActiveHotbar = isHotbar && (slotNumber - 36 === activeHotbarIndex);
    const meta = item ? getItemMeta(item.name) : null;

    return (
      <div
        key={slotNumber}
        onClick={() => handleSlotClick(slotNumber)}
        onMouseEnter={() => setHoveredSlot(slotNumber)}
        onMouseLeave={() => setHoveredSlot(null)}
        className={`relative mc-slot group cursor-pointer transition-all ${
          isCurrentActiveHotbar
            ? 'ring-2 ring-white border-white bg-[#282a36] scale-105 z-10'
            : isSelected
            ? 'ring-2 ring-mc-green border-mc-green bg-[#1f232e]'
            : 'hover:border-mc-emerald hover:bg-[#1a1b22]'
        }`}
      >
        {/* Slot index overlay badge */}
        {isHotbar && (
          <span className="absolute top-0.5 left-1 font-pixel text-[8px] text-slate-500 select-none">
            {slotNumber - 35}
          </span>
        )}

        {item && meta ? (
          <div className="relative w-full h-full flex items-center justify-center p-1">
            {/* Authentic Pixel Graphic Icon */}
            <span className="text-xl select-none filter drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)] transition-transform group-hover:scale-115">
              {meta.icon}
            </span>

            {/* Stack Count in Bottom Right (Minecraft authentic white font with shadow) */}
            {item.count > 1 && (
              <span className="absolute bottom-0.5 right-1 font-pixel text-[10px] text-white drop-shadow-[0_1.5px_1px_rgba(0,0,0,1)] select-none">
                {item.count}
              </span>
            )}

            {/* Durability Bar (if damaged) */}
            {item.maxDurability && item.durabilityUsed !== undefined && item.durabilityUsed > 0 && (
              <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-black/80 rounded overflow-hidden">
                <div
                  className="h-full bg-mc-green"
                  style={{
                    width: `${Math.max(0, 100 - (item.durabilityUsed / item.maxDurability) * 100)}%`,
                  }}
                />
              </div>
            )}

            {/* Minecraft Tooltip on Hover */}
            {isHovered && <MinecraftTooltip item={item} />}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mc-panel p-4 border border-mc-border shadow-lg">
      <div className="flex items-center justify-between border-b border-mc-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-mc-diamond" />
          <h4 className="font-pixel text-xs text-slate-100">Live Inventory</h4>
          <span className="text-[10px] font-mono text-slate-400">
            ({items.length}/36 slots used)
          </span>
        </div>

        <button
          onClick={() => {
            sounds.playPop();
            onTossAll();
          }}
          className="text-[10px] font-mono text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-950/80 px-2.5 py-1 border border-red-900 rounded flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
          <span>Drop All Items</span>
        </button>
      </div>

      <div className="flex flex-col items-center">
        {/* Main Inventory: 3 Rows of 9 (Slots 9 to 35) */}
        <div className="mb-3">
          <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5 text-center flex items-center justify-center gap-2">
            <span>Main Inventory (3x9)</span>
          </div>
          <div className="grid grid-cols-9 gap-1.5 p-2 bg-[#101115] border border-mc-border rounded shadow-inner">
            {Array.from({ length: 27 }, (_, i) => renderSlot(9 + i))}
          </div>
        </div>

        {/* Hotbar: 1 Row of 9 (Slots 36 to 44) */}
        <div>
          <div className="text-[10px] font-mono uppercase text-mc-green mb-1.5 text-center flex items-center justify-center gap-2">
            <span>Hotbar (Keys 1 - 9)</span>
            <span className="text-[9px] text-slate-500 font-normal lowercase">(active slot equipped)</span>
          </div>
          <div className="grid grid-cols-9 gap-1.5 p-2 bg-[#121319] border-2 border-mc-border-light rounded shadow-inner">
            {Array.from({ length: 9 }, (_, i) => renderSlot(36 + i, true))}
          </div>
        </div>
      </div>

      {/* Selected Item Actions Drawer */}
      {selectedItem && (
        <div className="mt-4 p-3 bg-[#13141a] border border-mc-green/40 rounded flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-100">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{getItemMeta(selectedItem.name).icon}</span>
            <div>
              <div className="text-xs font-pixel text-mc-green">
                {selectedItem.displayName}
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Stack: {selectedItem.count} • Slot: {selectedItem.slot}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                sounds.playPop();
                onTossItem(selectedItem.slot, 1);
                setSelectedItem(null);
              }}
              className="px-2.5 py-1 text-xs font-mono bg-[#22242e] hover:bg-[#2c2f3d] border border-mc-border rounded text-slate-200 cursor-pointer flex items-center gap-1"
            >
              <ArrowUpRight className="w-3 h-3 text-amber-400" />
              <span>Toss 1</span>
            </button>

            <button
              onClick={() => {
                sounds.playPop();
                onTossItem(selectedItem.slot, selectedItem.count);
                setSelectedItem(null);
              }}
              className="px-2.5 py-1 text-xs font-mono bg-[#22242e] hover:bg-[#2c2f3d] border border-mc-border rounded text-slate-200 cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
              <span>Toss All</span>
            </button>

            <button
              onClick={() => {
                sounds.playClick();
                onEquipItem(selectedItem.slot, 'hand');
                setSelectedItem(null);
              }}
              className="px-2.5 py-1 text-xs font-mono bg-[#22242e] hover:bg-[#2c2f3d] border border-mc-border rounded text-slate-200 cursor-pointer flex items-center gap-1"
            >
              <Hand className="w-3 h-3 text-mc-green" />
              <span>Hold Main Hand</span>
            </button>

            <button
              onClick={() => {
                sounds.playClick();
                onEquipItem(selectedItem.slot, 'off-hand');
                setSelectedItem(null);
              }}
              className="px-2.5 py-1 text-xs font-mono bg-[#22242e] hover:bg-[#2c2f3d] border border-mc-border rounded text-slate-200 cursor-pointer flex items-center gap-1"
            >
              <Shield className="w-3 h-3 text-mc-diamond" />
              <span>Off-Hand</span>
            </button>

            <button
              onClick={() => setSelectedItem(null)}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 font-mono cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
