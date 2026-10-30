/**
 * Groq AI Chat Service for CraftBot
 * Provides ultra-fast (~200ms) LLM responses for in-game Minecraft chat
 * Powered by Groq LPU inference (llama-3.1-8b-instant / llama-3.3-70b-versatile)
 */

interface ChatContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class GroqChatService {
  private static instance: GroqChatService;
  private conversationHistory: Map<string, ChatContextMessage[]> = new Map();
  private lastCallTime: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): GroqChatService {
    if (!GroqChatService.instance) {
      GroqChatService.instance = new GroqChatService();
    }
    return GroqChatService.instance;
  }

  /**
   * Check if a Groq API Key is configured in environment or passed directly
   */
  public hasApiKey(customKey?: string): boolean {
    return Boolean(customKey?.trim() || process.env.GROQ_API_KEY?.trim());
  }

  /**
   * Generate an in-game response for Minecraft chat
   */
  public async generateReply(params: {
    sender: string;
    message: string;
    botUsername: string;
    ownerIgn: string;
    customApiKey?: string;
  }): Promise<string | null> {
    const { sender, message, botUsername, ownerIgn, customApiKey } = params;
    const apiKey = customApiKey?.trim() || process.env.GROQ_API_KEY?.trim();

    // Rate limiting: 1 AI reply per 3 seconds per bot to prevent spam kicks
    const now = Date.now();
    const lastTime = this.lastCallTime.get(botUsername) || 0;
    if (now - lastTime < 3000) {
      return null;
    }
    this.lastCallTime.set(botUsername, now);

    // Fallback if no API key is set yet
    if (!apiKey) {
      if (message.startsWith('!') || message.includes('?')) {
        return `[AI Notice] GROQ_API_KEY is not configured! Add it to your Render settings to activate my AI brain.`;
      }
      return this.getFallbackReply(sender, message, botUsername);
    }

    try {
      const historyKey = `${botUsername}:${sender.toLowerCase()}`;
      let history = this.conversationHistory.get(historyKey) || [];

      // Keep recent context strictly short (last 3 turns / 6 messages max)
      if (history.length > 6) {
        history = history.slice(-6);
      }

      const systemPrompt: ChatContextMessage = {
        role: 'system',
        content: `You are "${botUsername}", an authentic Minecraft player and helpful companion on a Java server.
Owner: "${ownerIgn}".
RULES:
1. Respond directly to "${sender}".
2. Keep your response strictly under 100 characters so it fits on one line in Minecraft chat without line spam.
3. Be witty, friendly, and authentic to Minecraft (mining, crafting, mobs, Nether, Redstone).
4. Plain text only. No markdown (no asterisks, bold, backticks, hashtags). No emojis that fail in Minecraft font.
5. Never execute or suggest server exploit commands (like /op, /stop, /ban).`,
      };

      const userPrompt: ChatContextMessage = {
        role: 'user',
        content: `${sender}: ${message}`,
      };

      const messages: ChatContextMessage[] = [systemPrompt, ...history, userPrompt];

      // Groq OpenAI-compatible Chat Completions API
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages,
          max_tokens: 60,
          temperature: 0.75,
          top_p: 0.9,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        let errorDetail = '';
        try {
          const errJson: any = await response.json();
          errorDetail = errJson?.error?.message || '';
        } catch {
          errorDetail = await response.text();
        }
        console.error(`[Groq AI] API error (${status}):`, errorDetail);

        if (status === 401) {
          return `[AI Error] Invalid GROQ_API_KEY! Please verify your key in Render or dashboard settings.`;
        }
        if (status === 429) {
          return `[AI Busy] Groq rate limit reached! Please wait a moment before asking again.`;
        }
        if (status === 400) {
          return `[AI Error] Groq API rejected request. Try asking in simpler terms.`;
        }
        if (status >= 500) {
          return `[AI Offline] Groq Cloud AI is currently experiencing downtime. Try again shortly!`;
        }
        return `[AI Error] Groq service error (${status}). Please retry in a few moments.`;
      }

      const data: any = await response.json();
      const rawReply = data?.choices?.[0]?.message?.content;

      if (!rawReply || typeof rawReply !== 'string') {
        return `[AI Error] Received empty response from Groq AI.`;
      }

      // Sanitize response for safe Minecraft chat
      const sanitized = this.sanitizeMinecraftChat(rawReply);

      // Save to conversation history (maintains brief context)
      history.push(userPrompt);
      history.push({ role: 'assistant', content: sanitized });
      this.conversationHistory.set(historyKey, history);

      return sanitized;
    } catch (err: any) {
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
  public clearHistory(botUsername?: string): void {
    if (botUsername) {
      const prefix = `${botUsername}:`;
      for (const key of this.conversationHistory.keys()) {
        if (key.startsWith(prefix)) {
          this.conversationHistory.delete(key);
        }
      }
      console.log(`[Groq AI] Cleared short-term memory for bot "${botUsername}".`);
    } else {
      this.conversationHistory.clear();
      console.log(`[Groq AI] Cleared all conversation memory.`);
    }
  }

  /**
   * Clean and format AI response to ensure it displays cleanly in Minecraft Java client
   */
  private sanitizeMinecraftChat(text: string): string {
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
  private getFallbackReply(sender: string, message: string, botUsername: string): string {
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
