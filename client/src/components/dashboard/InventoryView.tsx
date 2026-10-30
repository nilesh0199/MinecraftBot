import React, { useState, useEffect } from 'react';
import { Package, Trash2, ArrowUpRight, Shield, Hand, Utensils, Zap, MessageSquare, ArrowRightLeft, X } from 'lucide-react';
import { MinecraftTooltip } from './MinecraftTooltip';
import { getItemMeta } from '../../utils/minecraftItems';
import { sounds } from '../../utils/audio';
import type { BotState } from './HUD';

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
  onEatItem?: (slot: number) => void;
  onUseItem?: (slot: number) => void;
  onMoveItem?: (sourceSlot: number, destSlot: number) => void;
  onShareItem?: (slot: number) => void;
  botState?: BotState;
}

const isFoodItem = (name: string): boolean => {
  if (!name) return false;
  const n = name.toLowerCase().replace('minecraft:', '');
  const foods = [
    'apple', 'golden_apple', 'enchanted_golden_apple', 'beef', 'cooked_beef',
    'porkchop', 'cooked_porkchop', 'bread', 'golden_carrot', 'carrot',
    'potato', 'baked_potato', 'poisonous_potato', 'mutton', 'cooked_mutton',
    'chicken', 'cooked_chicken', 'salmon', 'cooked_salmon', 'cod', 'cooked_cod',
    'sweet_berries', 'glow_berries', 'cookie', 'melon_slice', 'dried_kelp',
    'pumpkin_pie', 'honey_bottle', 'mushroom_stew', 'beetroot_soup', 'rabbit_stew'
  ];
  return foods.includes(n) || n.includes('cooked_') || n.includes('apple') || n.includes('bread');
};

const getArmorDestination = (name: string): { destination: 'head' | 'torso' | 'legs' | 'feet'; label: string } | null => {
  if (!name) return null;
  const n = name.toLowerCase().replace('minecraft:', '');
  if (n.includes('helmet') || n.includes('cap') || n.includes('turtle_helmet') || n.includes('skull') || n.includes('head')) {
    return { destination: 'head', label: 'Wear Helmet' };
  }
  if (n.includes('chestplate') || n.includes('tunic') || n.includes('elytra')) {
    return { destination: 'torso', label: 'Wear Chestplate' };
  }
  if (n.includes('leggings') || n.includes('pants')) {
    return { destination: 'legs', label: 'Wear Leggings' };
  }
  if (n.includes('boots')) {
    return { destination: 'feet', label: 'Wear Boots' };
  }
  return null;
};

const isUsableItem = (name: string): boolean => {
  if (!name) return false;
  const n = name.toLowerCase().replace('minecraft:', '');
  return n.includes('potion') || n.includes('pearl') || n.includes('bucket') || n.includes('firework') || n.includes('bow');
};

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  onTossItem,
  onEquipItem,
  onTossAll,
  onEatItem,
  onUseItem,
  onMoveItem,
  onShareItem,
  botState,
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
      <div className="flex items-center justify-between border-b border-mc-border pb-3 mb-3">
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

      {/* Quick Vitals in Numbers directly visible beside Inventory without scrolling */}
      {botState && (
        <div className="mb-4 bg-[#111217] border-2 border-mc-border p-2.5 rounded shadow-inner flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
          {/* Health in Numbers */}
          <div className="flex items-center gap-2 bg-[#1b1417] px-3 py-1.5 rounded border border-red-900/60 shadow-sm flex-1 min-w-[130px]">
            <span className="text-red-500 text-sm animate-pulse">❤️</span>
            <div className="flex flex-col">
              <span className="text-[8px] font-pixel text-red-400 uppercase">HP</span>
              <span className="font-pixel text-[11px] text-white">
                <strong className="text-red-400">{Math.round(botState.health)}</strong> / 20
              </span>
            </div>
            <div className="flex-1 h-2 bg-black/60 rounded overflow-hidden border border-red-900/40 ml-1">
              <div 
                className="h-full bg-red-500 transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, (botState.health / 20) * 100))}%` }}
              />
            </div>
          </div>

          {/* Food in Numbers */}
          <div className="flex items-center gap-2 bg-[#1b1712] px-3 py-1.5 rounded border border-amber-900/60 shadow-sm flex-1 min-w-[130px]">
            <span className="text-amber-500 text-sm">🍗</span>
            <div className="flex flex-col">
              <span className="text-[8px] font-pixel text-amber-400 uppercase">Food</span>
              <span className="font-pixel text-[11px] text-white">
                <strong className="text-amber-400">{Math.round(botState.food)}</strong> / 20
              </span>
            </div>
            <div className="flex-1 h-2 bg-black/60 rounded overflow-hidden border border-amber-900/40 ml-1">
              <div 
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, (botState.food / 20) * 100))}%` }}
              />
            </div>
          </div>

          {/* Coordinates */}
          <div className="flex items-center gap-2 bg-[#131620] px-3 py-1.5 rounded border border-cyan-900/60 shadow-sm">
            <span className="text-mc-diamond text-sm">🧭</span>
            <div className="flex flex-col">
              <span className="text-[8px] font-pixel text-cyan-400 uppercase">Coords</span>
              <span className="font-mono text-[11px] text-slate-200">
                X: <strong>{Math.round(botState.position.x)}</strong> Y: <strong>{Math.round(botState.position.y)}</strong> Z: <strong>{Math.round(botState.position.z)}</strong>
              </span>
            </div>
          </div>
        </div>
      )}

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
      {selectedItem && (() => {
        const meta = getItemMeta(selectedItem.name);
        const food = isFoodItem(selectedItem.name);
        const armor = getArmorDestination(selectedItem.name);
        const usable = isUsableItem(selectedItem.name);
        const isHotbar = selectedItem.slot >= 36 && selectedItem.slot <= 44;
        const remainingDurability = selectedItem.maxDurability 
          ? Math.max(0, selectedItem.maxDurability - (selectedItem.durabilityUsed || 0))
          : null;
        const durabilityPercent = selectedItem.maxDurability && remainingDurability !== null
          ? Math.round((remainingDurability / selectedItem.maxDurability) * 100)
          : null;

        return (
          <div className="mt-4 p-4 bg-[#111217] border-2 border-mc-border-light rounded-lg shadow-2xl animate-in fade-in duration-150">
            {/* Header: Item Identity & Durability */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-mc-border/60">
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded bg-[#181920] border-2 flex items-center justify-center text-3xl shadow-inner select-none"
                  style={{ borderColor: meta.rarityColor }}
                >
                  {meta.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span 
                      className="text-sm font-pixel font-bold drop-shadow-sm"
                      style={{ color: meta.rarityColor }}
                    >
                      {selectedItem.displayName}
                    </span>
                    <span 
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold border"
                      style={{ 
                        borderColor: `${meta.rarityColor}55`, 
                        backgroundColor: `${meta.rarityColor}15`,
                        color: meta.rarityColor 
                      }}
                    >
                      {meta.rarity}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase bg-slate-800 text-slate-300 border border-slate-700">
                      {meta.category}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] font-mono text-slate-400">
                    <span>Count: <strong className="text-white">{selectedItem.count}</strong></span>
                    <span>•</span>
                    <span>
                      Location: <strong className="text-slate-200">
                        {isHotbar ? `Hotbar Slot ${selectedItem.slot - 35}` : `Slot #${selectedItem.slot}`}
                      </strong>
                    </span>
                    <span>•</span>
                    <span className="text-slate-500">{selectedItem.name}</span>
                  </div>

                  {/* Durability Bar if applicable */}
                  {durabilityPercent !== null && remainingDurability !== null && (
                    <div className="mt-2 flex items-center gap-2 max-w-xs">
                      <div className="flex-1 h-1.5 bg-black/70 rounded-full overflow-hidden border border-slate-700/60">
                        <div 
                          className="h-full transition-all duration-300"
                          style={{ 
                            width: `${durabilityPercent}%`,
                            backgroundColor: durabilityPercent > 50 ? '#10b981' : durabilityPercent > 20 ? '#f59e0b' : '#ef4444'
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                        {remainingDurability} / {selectedItem.maxDurability} ({durabilityPercent}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => {
                  sounds.playClick();
                  setSelectedItem(null);
                }}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                title="Close Drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Actions Grid */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Column 1: Drop & Toss Options */}
              <div className="bg-[#171821] p-2.5 rounded border border-mc-border/40 flex flex-col gap-1.5">
                <span className="text-[10px] font-pixel text-red-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Drop Items
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      sounds.playPop();
                      onTossItem(selectedItem.slot, 1);
                      if (selectedItem.count <= 1) setSelectedItem(null);
                    }}
                    className="px-2.5 py-1.5 text-xs font-mono bg-[#222430] hover:bg-red-950/40 hover:border-red-700 border border-mc-border rounded text-slate-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                    <span>Drop 1</span>
                  </button>

                  {selectedItem.count > 1 && (
                    <button
                      onClick={() => {
                        sounds.playPop();
                        const half = Math.floor(selectedItem.count / 2);
                        onTossItem(selectedItem.slot, half);
                      }}
                      className="px-2.5 py-1.5 text-xs font-mono bg-[#222430] hover:bg-red-950/40 hover:border-red-700 border border-mc-border rounded text-slate-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                      <span>Drop Half ({Math.floor(selectedItem.count / 2)})</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      sounds.playPop();
                      onTossItem(selectedItem.slot, selectedItem.count);
                      setSelectedItem(null);
                    }}
                    className="px-2.5 py-1.5 text-xs font-mono bg-[#2a1a1e] hover:bg-red-900/60 border border-red-900/60 hover:border-red-500 rounded text-red-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors col-span-2"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Drop All ({selectedItem.count})</span>
                  </button>
                </div>
              </div>

              {/* Column 2: Equip & Armor Options */}
              <div className="bg-[#171821] p-2.5 rounded border border-mc-border/40 flex flex-col gap-1.5">
                <span className="text-[10px] font-pixel text-mc-diamond uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Equip & Gear
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      sounds.playClick();
                      onEquipItem(selectedItem.slot, 'hand');
                    }}
                    className="px-2.5 py-1.5 text-xs font-mono bg-[#222430] hover:bg-emerald-950/40 hover:border-mc-green border border-mc-border rounded text-slate-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Hand className="w-3.5 h-3.5 text-mc-green" />
                    <span>Main Hand</span>
                  </button>

                  <button
                    onClick={() => {
                      sounds.playClick();
                      onEquipItem(selectedItem.slot, 'off-hand');
                    }}
                    className="px-2.5 py-1.5 text-xs font-mono bg-[#222430] hover:bg-cyan-950/40 hover:border-mc-diamond border border-mc-border rounded text-slate-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5 text-mc-diamond" />
                    <span>Off-Hand</span>
                  </button>

                  {armor && (
                    <button
                      onClick={() => {
                        sounds.playClick();
                        onEquipItem(selectedItem.slot, armor.destination);
                        setSelectedItem(null);
                      }}
                      className="px-2.5 py-1.5 text-xs font-mono bg-[#162938] hover:bg-cyan-900/60 border border-cyan-800 hover:border-cyan-400 rounded text-cyan-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors col-span-2 font-semibold"
                    >
                      <Shield className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{armor.label}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Column 3: Interact & Share */}
              <div className="bg-[#171821] p-2.5 rounded border border-mc-border/40 flex flex-col gap-1.5">
                <span className="text-[10px] font-pixel text-mc-green uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Actions & Chat
                </span>
                <div className="flex flex-col gap-1.5">
                  {food && (
                    <button
                      onClick={() => {
                        sounds.playClick();
                        onEatItem?.(selectedItem.slot);
                      }}
                      className="px-2.5 py-1.5 text-xs font-mono bg-[#2b2113] hover:bg-amber-900/60 border border-amber-800 hover:border-amber-400 rounded text-amber-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors font-semibold"
                    >
                      <Utensils className="w-3.5 h-3.5 text-amber-400" />
                      <span>Eat Food 🍗</span>
                    </button>
                  )}

                  {usable && (
                    <button
                      onClick={() => {
                        sounds.playClick();
                        onUseItem?.(selectedItem.slot);
                      }}
                      className="px-2.5 py-1.5 text-xs font-mono bg-[#26162d] hover:bg-purple-900/60 border border-purple-800 hover:border-purple-400 rounded text-purple-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors font-semibold"
                    >
                      <Zap className="w-3.5 h-3.5 text-purple-400" />
                      <span>Use / Activate ⚡</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      sounds.playClick();
                      onShareItem?.(selectedItem.slot);
                    }}
                    className="px-2.5 py-1.5 text-xs font-mono bg-[#222430] hover:bg-[#2c2f3d] border border-mc-border rounded text-slate-200 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-mc-green" />
                    <span>Share in Chat 💬</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Move to Hotbar (Slots 1 to 9) */}
            <div className="mt-3 pt-2.5 border-t border-mc-border/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300">
                <ArrowRightLeft className="w-3.5 h-3.5 text-mc-green" />
                <span>Move to Hotbar:</span>
              </div>

              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
                  const targetSlot = 35 + num;
                  const isCurrent = selectedItem.slot === targetSlot;
                  return (
                    <button
                      key={num}
                      onClick={() => {
                        if (!isCurrent) {
                          sounds.playClick();
                          onMoveItem?.(selectedItem.slot, targetSlot);
                          setSelectedItem(null);
                        }
                      }}
                      disabled={isCurrent}
                      className={`w-7 h-7 text-xs font-pixel rounded border transition-all cursor-pointer flex items-center justify-center ${
                        isCurrent
                          ? 'bg-mc-green text-black border-mc-green font-bold cursor-default'
                          : 'bg-[#1b1c24] hover:bg-mc-green/20 hover:border-mc-green text-slate-200 border-mc-border'
                      }`}
                      title={`Move item to Hotbar Slot ${num} (Inventory Slot ${targetSlot})`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
