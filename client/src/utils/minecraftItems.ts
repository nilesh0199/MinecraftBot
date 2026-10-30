export interface ItemMeta {
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic';
  rarityColor: string;
  category: 'weapon' | 'tool' | 'food' | 'armor' | 'material' | 'valuable' | 'misc';
}

const ITEM_DATABASE: Record<string, ItemMeta> = {
  // Swords & Weapons
  netherite_sword: { icon: '🗡️', rarity: 'epic', rarityColor: '#d946ef', category: 'weapon' },
  diamond_sword: { icon: '🗡️', rarity: 'rare', rarityColor: '#38bdf8', category: 'weapon' },
  iron_sword: { icon: '🗡️', rarity: 'common', rarityColor: '#e2e8f0', category: 'weapon' },
  golden_sword: { icon: '🗡️', rarity: 'uncommon', rarityColor: '#facc15', category: 'weapon' },
  stone_sword: { icon: '🗡️', rarity: 'common', rarityColor: '#94a3b8', category: 'weapon' },
  wooden_sword: { icon: '🗡️', rarity: 'common', rarityColor: '#b45309', category: 'weapon' },
  bow: { icon: '🏹', rarity: 'common', rarityColor: '#e2e8f0', category: 'weapon' },
  crossbow: { icon: '🏹', rarity: 'uncommon', rarityColor: '#facc15', category: 'weapon' },
  mace: { icon: '🔨', rarity: 'epic', rarityColor: '#d946ef', category: 'weapon' },
  trident: { icon: '🔱', rarity: 'rare', rarityColor: '#38bdf8', category: 'weapon' },

  // Tools
  diamond_pickaxe: { icon: '⛏️', rarity: 'rare', rarityColor: '#38bdf8', category: 'tool' },
  netherite_pickaxe: { icon: '⛏️', rarity: 'epic', rarityColor: '#d946ef', category: 'tool' },
  iron_pickaxe: { icon: '⛏️', rarity: 'common', rarityColor: '#e2e8f0', category: 'tool' },
  diamond_axe: { icon: '🪓', rarity: 'rare', rarityColor: '#38bdf8', category: 'tool' },
  iron_axe: { icon: '🪓', rarity: 'common', rarityColor: '#e2e8f0', category: 'tool' },
  diamond_shovel: { icon: '🥄', rarity: 'rare', rarityColor: '#38bdf8', category: 'tool' },

  // Food
  golden_apple: { icon: '🍏', rarity: 'rare', rarityColor: '#38bdf8', category: 'food' },
  enchanted_golden_apple: { icon: '🍏', rarity: 'epic', rarityColor: '#d946ef', category: 'food' },
  cooked_beef: { icon: '🥩', rarity: 'common', rarityColor: '#e2e8f0', category: 'food' },
  cooked_porkchop: { icon: '🥩', rarity: 'common', rarityColor: '#e2e8f0', category: 'food' },
  bread: { icon: '🥖', rarity: 'common', rarityColor: '#e2e8f0', category: 'food' },
  golden_carrot: { icon: '🥕', rarity: 'uncommon', rarityColor: '#facc15', category: 'food' },
  baked_potato: { icon: '🥔', rarity: 'common', rarityColor: '#e2e8f0', category: 'food' },

  // Farm Drops & Materials
  ender_pearl: { icon: '🔮', rarity: 'uncommon', rarityColor: '#facc15', category: 'misc' },
  totem_of_undying: { icon: '🧿', rarity: 'epic', rarityColor: '#d946ef', category: 'valuable' },
  rotten_flesh: { icon: '🍖', rarity: 'common', rarityColor: '#a16207', category: 'material' },
  bone: { icon: '🦴', rarity: 'common', rarityColor: '#e2e8f0', category: 'material' },
  gunpowder: { icon: '💣', rarity: 'common', rarityColor: '#64748b', category: 'material' },
  arrow: { icon: '➹', rarity: 'common', rarityColor: '#e2e8f0', category: 'material' },
  diamond: { icon: '💎', rarity: 'rare', rarityColor: '#38bdf8', category: 'valuable' },
  emerald: { icon: '🟢', rarity: 'uncommon', rarityColor: '#10b981', category: 'valuable' },
  gold_ingot: { icon: '🪙', rarity: 'uncommon', rarityColor: '#facc15', category: 'valuable' },
  iron_ingot: { icon: '🪙', rarity: 'common', rarityColor: '#e2e8f0', category: 'valuable' },
  shield: { icon: '🛡️', rarity: 'common', rarityColor: '#e2e8f0', category: 'armor' },
};

export function getItemMeta(itemName: string): ItemMeta {
  const normalized = itemName.toLowerCase().replace('minecraft:', '');

  if (ITEM_DATABASE[normalized]) {
    return ITEM_DATABASE[normalized];
  }

  // Fallbacks by substring
  if (normalized.includes('sword') || normalized.includes('mace')) {
    return { icon: '🗡️', rarity: 'common', rarityColor: '#e2e8f0', category: 'weapon' };
  }
  if (normalized.includes('pickaxe')) {
    return { icon: '⛏️', rarity: 'common', rarityColor: '#e2e8f0', category: 'tool' };
  }
  if (normalized.includes('axe')) {
    return { icon: '🪓', rarity: 'common', rarityColor: '#e2e8f0', category: 'tool' };
  }
  if (normalized.includes('helmet') || normalized.includes('chestplate') || normalized.includes('leggings') || normalized.includes('boots')) {
    return { icon: '🦺', rarity: 'common', rarityColor: '#e2e8f0', category: 'armor' };
  }
  if (normalized.includes('apple') || normalized.includes('beef') || normalized.includes('pork') || normalized.includes('bread')) {
    return { icon: '🍗', rarity: 'common', rarityColor: '#e2e8f0', category: 'food' };
  }
  if (normalized.includes('ore') || normalized.includes('ingot') || normalized.includes('diamond')) {
    return { icon: '💎', rarity: 'uncommon', rarityColor: '#38bdf8', category: 'valuable' };
  }

  return { icon: '📦', rarity: 'common', rarityColor: '#cbd5e1', category: 'misc' };
}
