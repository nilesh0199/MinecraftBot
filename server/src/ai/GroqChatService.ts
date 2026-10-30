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
      return this.getFallbackReply(sender, message, botUsername);
    }

    try {
      const historyKey = `${botUsername}:${sender.toLowerCase()}`;
      let history = this.conversationHistory.get(historyKey) || [];

      // Keep recent context small (last 4 turns) to avoid exceeding token limits
      if (history.length > 4) {
        history = history.slice(-4);
      }

      const systemPrompt: ChatContextMessage = {
        role: 'system',
        content: `You are "${botUsername}", an authentic Minecraft player and helpful companion on a Java server.
Owner: "${ownerIgn}".
RULES:
1. Respond to "${sender}".
2. Keep your response strictly under 100 characters so it fits on one line in Minecraft chat.
3. Be funny, witty, and helpful with real Minecraft knowledge (mining, crafting, mobs, Nether).
4. Plain text only. No markdown (no asterisks, bold, hashtags, backticks). No emojis that fail in Minecraft font.
5. Never execute or mention server exploit commands (like /op, /stop, /ban).`,
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
        const errorText = await response.text();
        console.error(`[Groq AI] API error (${response.status}):`, errorText);
        return this.getFallbackReply(sender, message, botUsername);
      }

      const data: any = await response.json();
      const rawReply = data?.choices?.[0]?.message?.content;

      if (!rawReply || typeof rawReply !== 'string') {
        return this.getFallbackReply(sender, message, botUsername);
      }

      // Sanitize response for safe Minecraft chat
      const sanitized = this.sanitizeMinecraftChat(rawReply);

      // Save to conversation history
      history.push(userPrompt);
      history.push({ role: 'assistant', content: sanitized });
      this.conversationHistory.set(historyKey, history);

      return sanitized;
    } catch (err: any) {
      console.error('[Groq AI] Request failed:', err?.message || err);
      return this.getFallbackReply(sender, message, botUsername);
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
