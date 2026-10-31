import fs from 'fs';
import path from 'path';
import { BotConfig } from '../bot/BotInstance';

export type SlotId = 'bot_1' | 'bot_2';

export interface StoredSlotData {
  slotId: SlotId;
  isActive: boolean;
  config?: BotConfig;
  updatedAt: number;
}

export interface SlotsDatabase {
  bot_1: StoredSlotData;
  bot_2: StoredSlotData;
}

const DEFAULT_DATABASE: SlotsDatabase = {
  bot_1: {
    slotId: 'bot_1',
    isActive: false,
    updatedAt: Date.now(),
  },
  bot_2: {
    slotId: 'bot_2',
    isActive: false,
    updatedAt: Date.now(),
  },
};

export class SlotStorage {
  private static instance: SlotStorage;
  private filePath: string;
  private cache: SlotsDatabase;

  private constructor() {
    const dataDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (e) {
        console.warn('[SlotStorage] Could not create data directory:', e);
      }
    }
    this.filePath = path.join(dataDir, 'bot-slots.json');
    this.cache = this.loadFromFile();
  }

  public static getInstance(): SlotStorage {
    if (!SlotStorage.instance) {
      SlotStorage.instance = new SlotStorage();
    }
    return SlotStorage.instance;
  }

  private loadFromFile(): SlotsDatabase {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          bot_1: parsed.bot_1 || { ...DEFAULT_DATABASE.bot_1 },
          bot_2: parsed.bot_2 || { ...DEFAULT_DATABASE.bot_2 },
        };
      }
    } catch (err) {
      console.warn('[SlotStorage] Failed to read bot-slots.json, using defaults:', err);
    }
    return { ...DEFAULT_DATABASE };
  }

  private saveToFile(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SlotStorage] Failed to write bot-slots.json:', err);
    }
  }

  public getSlot(slotId: SlotId): StoredSlotData {
    return this.cache[slotId] || { slotId, isActive: false, updatedAt: Date.now() };
  }

  public getAllSlots(): SlotsDatabase {
    return { ...this.cache };
  }

  public setSlotConfig(slotId: SlotId, config: BotConfig, isActive: boolean = true): void {
    this.cache[slotId] = {
      slotId,
      isActive,
      config,
      updatedAt: Date.now(),
    };
    this.saveToFile();
  }

  public setSlotActive(slotId: SlotId, isActive: boolean): void {
    if (this.cache[slotId]) {
      this.cache[slotId].isActive = isActive;
      this.cache[slotId].updatedAt = Date.now();
      this.saveToFile();
    }
  }
}
