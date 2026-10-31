"use strict";
/**
 * Groq AI Chat Service for CraftBot
 * Provides ultra-fast (~200ms) LLM responses for in-game Minecraft chat
 * Powered by Groq LPU inference (llama-3.1-8b-instant / llama-3.3-70b-versatile)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqChatService = void 0;
class GroqChatService {
    static instance;
    conversationHistory = new Map();
    lastCallTime = new Map();
    activeModel = null;
    lastModelCheck = 0;
    constructor() { }
    static getInstance() {
        if (!GroqChatService.instance) {
            GroqChatService.instance = new GroqChatService();
        }
        return GroqChatService.instance;
    }
    /**
     * Check if a Groq API Key is configured in environment or passed directly
     */
    hasApiKey(customKey) {
        return Boolean(customKey?.trim() || process.env.GROQ_API_KEY?.trim());
    }
    /**
     * Discover and cache the active working chat model for the given Groq API Key
     */
    async resolveActiveModel(apiKey) {
        const now = Date.now();
        if (this.activeModel && (now - this.lastModelCheck < 600000)) {
            return this.activeModel;
        }
        if (process.env.GROQ_MODEL) {
            this.activeModel = process.env.GROQ_MODEL.trim();
            return this.activeModel;
        }
        try {
            const res = await fetch('https://api.groq.com/openai/v1/models', {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
                signal: AbortSignal.timeout(4000),
            });
            if (res.ok) {
                const data = await res.json();
                const modelIds = (data?.data || []).map((m) => m.id);
                const preferences = [
                    'openai/gpt-oss-120b',
                    'openai/gpt-oss-20b',
                    'llama-3.3-70b-versatile',
                    'llama-3.1-8b-instant',
                    'qwen/qwen3.8-27b',
                    'mixtral-8x7b-32768',
                    'gemma2-9b-it',
                ];
                for (const pref of preferences) {
                    if (modelIds.includes(pref)) {
                        this.activeModel = pref;
                        this.lastModelCheck = now;
                        console.log(`[Groq AI] Discovered active production model: ${pref}`);
                        return pref;
                    }
                }
                const fallback = modelIds.find((id) => !id.includes('whisper') && !id.includes('guard') && !id.includes('embed') && !id.includes('vision'));
                if (fallback) {
                    this.activeModel = fallback;
                    this.lastModelCheck = now;
                    console.log(`[Groq AI] Selected active fallback model: ${fallback}`);
                    return fallback;
                }
            }
        }
        catch (e) {
            console.warn('[Groq AI] Model auto-discovery failed, using default candidate list:', e?.message);
        }
        this.activeModel = 'openai/gpt-oss-120b';
        return this.activeModel;
    }
    /**
     * Generate an in-game response for Minecraft chat
     */
    async generateReply(params) {
        const { sender, message, botUsername, ownerIgn, customApiKey } = params;
        const apiKey = customApiKey?.trim() || process.env.GROQ_API_KEY?.trim();
        // Rate limiting: 1 AI reply per 3 seconds per bot to prevent spam kicks
        const now = Date.now();
        const lastTime = this.lastCallTime.get(botUsername) || 0;
        if (now - lastTime < 3000) {
            return null;
        }
        this.lastCallTime.set(botUsername, now);
        // Notice if no API key is set yet
        if (!apiKey) {
            return `[AI Notice] GROQ_API_KEY is not set on this instance! Add it to Render Environment settings to enable Llama AI.`;
        }
        try {
            const historyKey = `${botUsername}:${sender.toLowerCase()}`;
            let history = this.conversationHistory.get(historyKey) || [];
            // Keep recent context strictly short (last 3 turns / 6 messages max)
            if (history.length > 6) {
                history = history.slice(-6);
            }
            const systemPrompt = {
                role: 'system',
                content: `You are "${botUsername}", an authentic Minecraft player and loyal companion on a Java server.
Owner: "${ownerIgn}".
RULES:
1. Respond directly to "${sender}".
2. Keep your response strictly under 100 characters so it fits cleanly on one line in Minecraft chat without line spam.
3. You fluently understand and speak Hinglish (Hindi written in English alphabet, e.g. "ek joke sunao", "kya haal hai", "diamond kahan milega"). If the user speaks Hinglish or Hindi, reply back naturally in fun, witty Hinglish or English!
4. Be witty, friendly, and authentic to Minecraft (mining, crafting, mobs, Nether, Redstone).
5. Plain text only. No markdown (no asterisks, bold, backticks, hashtags). Only standard letters, numbers and punctuation.
6. Never execute or suggest server exploit commands (like /op, /stop, /ban).`,
            };
            const userPrompt = {
                role: 'user',
                content: `${sender}: ${message}`,
            };
            const messages = [systemPrompt, ...history, userPrompt];
            // Assemble prioritized models to try in case of 404/400/model_not_found
            const preferredModel = await this.resolveActiveModel(apiKey);
            const candidates = Array.from(new Set([
                'openai/gpt-oss-120b',
                preferredModel,
                'llama-3.3-70b-versatile',
                'llama-3.1-8b-instant',
                'openai/gpt-oss-20b',
                'mixtral-8x7b-32768',
            ]));
            let lastErrorStatus = 0;
            let rawReply = null;
            for (const modelToTry of candidates) {
                const isReasoningModel = modelToTry.includes('oss') || modelToTry.includes('r1') || modelToTry.includes('o1');
                const tokenLimit = isReasoningModel ? 1024 : 120;
                // Try max_completion_tokens (modern Groq standard) first, fallback to max_tokens if needed
                for (const tokenParam of ['max_completion_tokens', 'max_tokens']) {
                    try {
                        const bodyPayload = {
                            model: modelToTry,
                            messages,
                        };
                        if (!isReasoningModel) {
                            bodyPayload.temperature = 0.7;
                        }
                        else {
                            bodyPayload.reasoning_effort = 'low';
                        }
                        bodyPayload[tokenParam] = tokenLimit;
                        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${apiKey}`,
                            },
                            body: JSON.stringify(bodyPayload),
                        });
                        const isOk = response.ok;
                        const resJson = await response.json().catch(() => null);
                        if (isOk && resJson) {
                            const choice = resJson?.choices?.[0];
                            rawReply = choice?.message?.content ||
                                choice?.message?.reasoning_content ||
                                choice?.text;
                            if (rawReply && typeof rawReply === 'string' && rawReply.trim().length > 0) {
                                this.activeModel = modelToTry;
                                break;
                            }
                        }
                        lastErrorStatus = response.status;
                        const errorDetail = resJson?.error?.message || (resJson ? JSON.stringify(resJson) : 'Unknown response');
                        console.warn(`[Groq AI] Model "${modelToTry}" (${tokenParam}) returned ${response.status}: ${errorDetail}`);
                        // Auth error: stop immediately
                        if (response.status === 401) {
                            return `[AI Error] Invalid GROQ_API_KEY! Please verify your key in Render or dashboard settings.`;
                        }
                        if (response.status === 429) {
                            return `[AI Busy] Groq rate limit reached! Please wait a moment before chatting again.`;
                        }
                        // If 400 due to max_tokens vs max_completion_tokens, try alternate parameter
                        if (response.status === 400 && (errorDetail.includes('max_tokens') || errorDetail.includes('max_completion_tokens'))) {
                            continue;
                        }
                        // If model is not found or unsupported, move to next model
                        this.activeModel = null;
                        break;
                    }
                    catch (callErr) {
                        console.warn(`[Groq AI] Attempt with "${modelToTry}" threw:`, callErr?.message);
                        break;
                    }
                }
                if (rawReply) {
                    break;
                }
            }
            if (!rawReply || typeof rawReply !== 'string') {
                if (lastErrorStatus === 404) {
                    return `[AI Error] None of the Groq chat models responded. Please verify model permissions on your Groq key.`;
                }
                return `[AI Error] Groq AI service unavailable (${lastErrorStatus || 'timed out'}). Please retry in a few moments.`;
            }
            // Sanitize response for safe Minecraft chat
            const sanitized = this.sanitizeMinecraftChat(rawReply);
            // Save to conversation history (maintains brief context)
            history.push(userPrompt);
            history.push({ role: 'assistant', content: sanitized });
            this.conversationHistory.set(historyKey, history);
            return sanitized;
        }
        catch (err) {
            console.error('[Groq AI] Request failed:', err?.message || err);
            const msg = (err?.message || '').toLowerCase();
            if (msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('network') || msg.includes('fetch')) {
                return `[AI Error] Could not connect to Groq AI servers. Check server internet connection.`;
            }
            return `[AI Error] AI service error: ${err?.message || 'unknown'}. Please retry shortly.`;
        }
    }
    /**
     * Clear short-term conversation context for a bot when it disconnects or stops
     */
    clearHistory(botUsername) {
        if (botUsername) {
            const prefix = `${botUsername}:`;
            for (const key of this.conversationHistory.keys()) {
                if (key.startsWith(prefix)) {
                    this.conversationHistory.delete(key);
                }
            }
            console.log(`[Groq AI] Cleared short-term memory for bot "${botUsername}".`);
        }
        else {
            this.conversationHistory.clear();
            console.log(`[Groq AI] Cleared all conversation memory.`);
        }
    }
    /**
     * Clean and format AI response to ensure it displays cleanly in Minecraft Java client
     */
    sanitizeMinecraftChat(text) {
        let clean = text
            .replace(/[\r\n]+/g, ' ') // Strip newlines
            .replace(/[*_#`~[\]]/g, '') // Strip markdown formatting
            .replace(/^["']+|["']+$/g, '') // Strip surrounding quotes
            .replace(/\s+/g, ' ')
            .trim();
        // Prevent malicious command prefixes
        if (clean.startsWith('/') || clean.startsWith('.')) {
            clean = clean.substring(1).trim();
        }
        // Minecraft chat message character limit safeguard
        if (clean.length > 110) {
            clean = clean.substring(0, 107) + '...';
        }
        return clean;
    }
    /**
     * Witty pre-canned responses when GROQ_API_KEY is not configured yet
     */
    getFallbackReply(sender, message, botUsername) {
        const lower = message.toLowerCase();
        if (lower.includes('joke')) {
            const jokes = [
                `Why don't skeletons fight each other, ${sender}? They don't have the guts!`,
                `How does Steve get his exercise? He runs around the block!`,
                `What is a creeper's favorite subject? Hisssss-tory!`,
            ];
            return jokes[Math.floor(Math.random() * jokes.length)];
        }
        if (lower.includes('diamond') || lower.includes('mine')) {
            return `Head down to Y = -58 for the best diamond veins! Watch out for lava lakes.`;
        }
        if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
            return `Hey ${sender}! I'm ${botUsername}, chilling here AFK! Set GROQ_API_KEY to unlock my AI brain.`;
        }
        const fallbacks = [
            `Hey ${sender}! I'm on AFK duty. Set GROQ_API_KEY in the dashboard to let me chat freely!`,
            `Working hard on AFK farm duty! Use "!help" to see what I can do.`,
            `I hear you ${sender}! Add a Groq API key to your server env to enable full AI conversations.`,
        ];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}
exports.GroqChatService = GroqChatService;
