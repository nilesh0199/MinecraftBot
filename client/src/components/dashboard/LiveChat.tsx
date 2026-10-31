import React, { useState, useRef, useEffect } from 'react';
import { Send, Terminal, MessageSquare, Copy, Check, ChevronDown, Sparkles } from 'lucide-react';
import { sounds } from '../../utils/audio';

export interface ChatMessage {
  id: string;
  sender?: string;
  text: string;
  raw?: any;
  timestamp: number;
  isSystem?: boolean;
}

interface LiveChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onTriggerJoke?: () => void;
  botUsername: string;
  ownerIgn: string;
}

// Convert Minecraft formatting codes (§0-§f, §l, etc.) to colored React elements
function parseMinecraftColorCodes(text: string) {
  if (!text.includes('§')) {
    return <span>{text}</span>;
  }

  const colorMap: Record<string, string> = {
    '0': 'text-black',
    '1': 'text-blue-900',
    '2': 'text-green-700',
    '3': 'text-cyan-700',
    '4': 'text-red-700',
    '5': 'text-purple-700',
    '6': 'text-amber-500',
    '7': 'text-slate-400',
    '8': 'text-slate-500',
    '9': 'text-blue-500',
    'a': 'text-green-400',
    'b': 'text-cyan-400',
    'c': 'text-red-400',
    'd': 'text-pink-400',
    'e': 'text-yellow-300',
    'f': 'text-white',
  };

  const segments = text.split(/(§[0-9a-fk-or])/gi);
  let currentColor = 'text-slate-200';

  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.startsWith('§')) {
          const code = seg.charAt(1).toLowerCase();
          if (colorMap[code]) {
            currentColor = colorMap[code];
          } else if (code === 'r') {
            currentColor = 'text-slate-200';
          }
          return null;
        }
        return (
          <span key={i} className={currentColor}>
            {seg}
          </span>
        );
      })}
    </span>
  );
}

export const LiveChat: React.FC<LiveChatProps> = ({
  messages,
  onSendMessage,
  onTriggerJoke,
  botUsername,
  ownerIgn,
}) => {
  const [inputText, setInputText] = useState('');
  const [sentHistory, setSentHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Play blip sound on new message and handle auto-scroll logic
  const prevMessagesLength = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      sounds.playChatBlip();

      if (isScrolledUp) {
        setUnreadCount((c) => c + 1);
      } else {
        scrollToBottom();
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, isScrolledUp]);

  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      setIsScrolledUp(false);
      setUnreadCount(0);
    }
  };

  const handleScroll = () => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);

    // If user scrolled more than 60px away from bottom, pause auto-scroll
    if (distanceToBottom > 60) {
      setIsScrolledUp(true);
    } else {
      setIsScrolledUp(false);
      setUnreadCount(0);
    }
  };

  // Keyboard navigation for chat history (Arrow Up / Arrow Down)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (sentHistory.length === 0) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIndex = historyIndex + 1;
      if (nextIndex < sentHistory.length) {
        setHistoryIndex(nextIndex);
        setInputText(sentHistory[sentHistory.length - 1 - nextIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = historyIndex - 1;
      if (nextIndex >= 0) {
        setHistoryIndex(nextIndex);
        setInputText(sentHistory[sentHistory.length - 1 - nextIndex]);
      } else {
        setHistoryIndex(-1);
        setInputText('');
      }
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    sounds.playClick();
    onSendMessage(inputText.trim());

    // Save to history (avoid duplicates of immediate last)
    setSentHistory((prev) => [...prev.slice(-30), inputText.trim()]);
    setHistoryIndex(-1);
    setInputText('');
    scrollToBottom();
  };

  const copyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Quick slash commands
  const slashCommands = ['/spawn', '/home', '/list', '/afk', `/msg ${ownerIgn}`];

  return (
    <div className="mc-panel flex flex-col h-[420px] border border-mc-border shadow-lg relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-mc-border bg-[#14151b]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-mc-green" />
          <h4 className="font-pixel text-xs text-slate-100">Live In-Game Chat</h4>
          <span className="text-[10px] font-mono text-slate-400">
            ({messages.length} lines)
          </span>
        </div>

        {/* Toolbar: AI Joke & Quick Slash Commands */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              if (onTriggerJoke) {
                onTriggerJoke();
              } else {
                onSendMessage('!joke');
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 hover:border-amber-400 text-amber-300 font-pixel text-[11px] rounded transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title="Ask AI to tell a funny Minecraft joke in chat"
          >
            <Sparkles className="w-3 h-3 text-amber-400 fill-amber-400 animate-pulse" />
            <span>AI Joke</span>
          </button>

          <div className="flex items-center gap-1 font-mono text-[10px] overflow-x-auto max-w-[240px]">
            {slashCommands.map((cmd) => (
              <button
                key={cmd}
                onClick={() => onSendMessage(cmd)}
                className="px-2 py-0.5 bg-[#1f2029] hover:bg-[#282a36] border border-mc-border text-slate-300 rounded whitespace-nowrap transition-colors cursor-pointer"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Message Feed */}
      <div
        ref={chatScrollRef}
        onScroll={handleScroll}
        className="flex-1 p-3 overflow-y-auto space-y-1 font-mono text-xs bg-[#0e0f13] relative"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-1">
            <Terminal className="w-8 h-8 opacity-40 mb-1" />
            <p>Chat feed is quiet</p>
            <p className="text-[10px]">Server messages, player whispers, and chat will stream here live</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwner = msg.sender && msg.sender.toLowerCase() === ownerIgn.toLowerCase();
            const isBot = msg.sender && msg.sender.toLowerCase() === botUsername.toLowerCase();
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return (
              <div
                key={msg.id}
                className={`group py-1 px-2 rounded transition-colors hover:bg-[#181920] flex items-start justify-between gap-2 ${
                  isOwner ? 'bg-mc-diamond/5 border-l-2 border-mc-diamond' : ''
                }`}
              >
                <div className="break-words flex-1">
                  <span className="text-[10px] text-slate-600 mr-2 select-none">[{time}]</span>

                  {msg.sender ? (
                    <>
                      <span
                        className={`font-semibold mr-1.5 ${
                          isOwner
                            ? 'text-mc-diamond'
                            : isBot
                            ? 'text-mc-green'
                            : 'text-slate-300'
                        }`}
                      >
                        &lt;{msg.sender}&gt;
                      </span>
                      <span className="text-slate-200">{msg.text}</span>
                    </>
                  ) : (
                    <span>{parseMinecraftColorCodes(msg.text)}</span>
                  )}
                </div>

                {/* 1-Click Copy Button */}
                <button
                  onClick={() => copyMessage(msg.id, msg.text)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
                  title="Copy message"
                >
                  {copiedId === msg.id ? (
                    <Check className="w-3 h-3 text-mc-green" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Floating "Scroll to latest" badge if user scrolled up */}
      {isScrolledUp && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1 bg-mc-panel border border-mc-green/60 text-mc-green text-[10px] font-mono rounded-full shadow-xl hover:scale-105 transition-transform animate-bounce cursor-pointer"
        >
          <ChevronDown className="w-3 h-3" />
          <span>New messages {unreadCount > 0 ? `(${unreadCount})` : ''}</span>
        </button>
      )}

      {/* Chat Input Box with History Hints */}
      <form
        onSubmit={handleSend}
        className="p-2 border-t border-mc-border bg-[#14151b] flex items-center gap-2"
      >
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type message or command (Press ↑ for history)..."
            className="w-full bg-[#0d0e12] border border-mc-border px-3 py-2 text-xs text-slate-100 rounded focus:border-mc-green focus:outline-none font-mono"
          />
        </div>
        <button
          type="submit"
          className="mc-btn-green py-2 px-3 flex items-center gap-1.5 cursor-pointer text-xs"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
};
