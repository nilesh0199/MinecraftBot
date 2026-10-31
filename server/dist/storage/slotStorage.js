"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlotStorage = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DEFAULT_DATABASE = {
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
class SlotStorage {
    static instance;
    filePath;
    cache;
    constructor() {
        const dataDir = path_1.default.resolve(__dirname, '../../data');
        if (!fs_1.default.existsSync(dataDir)) {
            try {
                fs_1.default.mkdirSync(dataDir, { recursive: true });
            }
            catch (e) {
                console.warn('[SlotStorage] Could not create data directory:', e);
            }
        }
        this.filePath = path_1.default.join(dataDir, 'bot-slots.json');
        this.cache = this.loadFromFile();
    }
    static getInstance() {
        if (!SlotStorage.instance) {
            SlotStorage.instance = new SlotStorage();
        }
        return SlotStorage.instance;
    }
    loadFromFile() {
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const raw = fs_1.default.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                return {
                    bot_1: parsed.bot_1 || { ...DEFAULT_DATABASE.bot_1 },
                    bot_2: parsed.bot_2 || { ...DEFAULT_DATABASE.bot_2 },
                };
            }
        }
        catch (err) {
            console.warn('[SlotStorage] Failed to read bot-slots.json, using defaults:', err);
        }
        return { ...DEFAULT_DATABASE };
    }
    saveToFile() {
        try {
            fs_1.default.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
        }
        catch (err) {
            console.warn('[SlotStorage] Failed to write bot-slots.json:', err);
        }
    }
    getSlot(slotId) {
        return this.cache[slotId] || { slotId, isActive: false, updatedAt: Date.now() };
    }
    getAllSlots() {
        return { ...this.cache };
    }
    setSlotConfig(slotId, config, isActive = true) {
        this.cache[slotId] = {
            slotId,
            isActive,
            config,
            updatedAt: Date.now(),
        };
        this.saveToFile();
    }
    setSlotActive(slotId, isActive) {
        if (this.cache[slotId]) {
            this.cache[slotId].isActive = isActive;
            this.cache[slotId].updatedAt = Date.now();
            this.saveToFile();
        }
    }
}
exports.SlotStorage = SlotStorage;
