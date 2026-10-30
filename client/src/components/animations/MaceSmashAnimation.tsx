import React, { useEffect, useRef, useState } from 'react';

interface MaceSmashAnimationProps {
  onComplete?: () => void;
  autoPlay?: boolean;
}

/**
 * Synthesizes an authentic Minecraft heavy Mace / Anvil crash sound
 * using the browser's built-in Web Audio API (Zero external audio files needed!)
 */
function playMaceSmashSound() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;

    // 1. Heavy Metal / Anvil Resonant Clang
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);

    // 2. Heavy Ground Impact / Bass Boom
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.45);

    subGain.gain.setValueAtTime(0.8, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.6);

    // 3. Shockwave Dust & Wind Noise Burst
    const bufferSize = ctx.sampleRate * 0.4;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.4);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + 0.4);
  } catch (e) {
    // AudioContext blocked by browser autoplay policy if user hasn't interacted yet
  }
}

export const MaceSmashAnimation: React.FC<MaceSmashAnimationProps> = ({
  onComplete,
  autoPlay = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<'launch' | 'apex' | 'slam' | 'impact' | 'done'>('launch');
  const [screenShake, setScreenShake] = useState(false);

  useEffect(() => {
    if (!autoPlay) return;

    let timerLaunch: ReturnType<typeof setTimeout>;
    let timerApex: ReturnType<typeof setTimeout>;
    let timerSlam: ReturnType<typeof setTimeout>;
    let timerImpact: ReturnType<typeof setTimeout>;
    let timerComplete: ReturnType<typeof setTimeout>;

    // Timeline of the 1.21 Mace Jump & Slam:
    // 0ms: Wind Charge Launch (Player rockets up)
    // 400ms: Apex (Mace raised with heavy enchantment glint)
    // 700ms: Downward Slam Acceleration
    // 950ms: IMPACT! Screen shake, particle blast, bass boom sound!
    // 1800ms: Finished

    timerLaunch = setTimeout(() => setPhase('launch'), 50);
    timerApex = setTimeout(() => setPhase('apex'), 450);
    timerSlam = setTimeout(() => setPhase('slam'), 750);
    timerImpact = setTimeout(() => {
      setPhase('impact');
      setScreenShake(true);
      playMaceSmashSound();
      setTimeout(() => setScreenShake(false), 500);
    }, 1000);

    timerComplete = setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, 1900);

    return () => {
      clearTimeout(timerLaunch);
      clearTimeout(timerApex);
      clearTimeout(timerSlam);
      clearTimeout(timerImpact);
      clearTimeout(timerComplete);
    };
  }, [autoPlay, onComplete]);

  // Particle Canvas for Wind Bursts, Shockwaves, and Critical Sparkles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
      decay: number;
      type: 'spark' | 'smoke' | 'shockwave';
    }> = [];

    const width = (canvas.width = canvas.parentElement?.clientWidth || 600);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 400);

    // Spawn Impact Particles when phase === 'impact'
    if (phase === 'impact') {
      const centerX = width / 2;
      const groundY = height * 0.78;

      // Critical Hit Sparks
      for (let i = 0; i < 45; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 3;
        particles.push({
          x: centerX,
          y: groundY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - Math.random() * 4,
          size: Math.random() * 5 + 3,
          color: ['#fbbf24', '#f87171', '#38bdf8', '#ffffff'][Math.floor(Math.random() * 4)],
          alpha: 1,
          decay: Math.random() * 0.02 + 0.02,
          type: 'spark',
        });
      }

      // Wind Burst Shockwave Ring
      for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        const speed = 7;
        particles.push({
          x: centerX,
          y: groundY,
          vx: Math.cos(angle) * speed * 1.5,
          vy: Math.sin(angle) * speed * 0.5,
          size: Math.random() * 8 + 6,
          color: '#e0f2fe',
          alpha: 0.9,
          decay: 0.035,
          type: 'smoke',
        });
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.type === 'spark') {
          p.vy += 0.2; // Gravity
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillRect(p.x, p.y, p.size, p.size);
        } else if (p.type === 'smoke') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fill();
        }

        if (p.alpha <= 0) {
          particles.splice(i, 1);
        }
      }

      ctx.globalAlpha = 1;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [phase]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 transition-transform duration-75 select-none ${
        screenShake ? 'animate-[shake_0.12s_ease-in-out_infinite]' : ''
      }`}
      style={{
        animation: screenShake ? 'shake 0.1s ease-in-out infinite' : undefined,
      }}
    >
      <style>{`
        @keyframes shake {
          0% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-8px, 6px) rotate(-1.5deg); }
          50% { transform: translate(7px, -6px) rotate(1.5deg); }
          75% { transform: translate(-6px, -4px) rotate(-1deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
      `}</style>

      {/* Main Canvas Animation Container */}
      <div className="relative w-full max-w-xl h-96 mc-panel border-4 border-mc-border shadow-2xl flex flex-col items-center justify-between overflow-hidden bg-[#0c0d11]">
        {/* Particle Canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" />

        {/* Top Banner */}
        <div className="relative z-30 pt-4 flex items-center gap-2">
          <span className="text-mc-diamond font-pixel text-xs animate-pulse">
            ⚡ MINECRAFT 1.21 MACE SMASH ATTACK
          </span>
        </div>

        {/* Dynamic Character & Mace Visual */}
        <div className="relative z-10 w-full flex-1 flex items-center justify-center">
          {/* Ground Platform */}
          <div className="absolute bottom-6 w-3/4 h-3 bg-[#383b45] border-t-2 border-[#555a68] shadow-inner rounded-sm flex justify-center items-center">
            <span className="text-[9px] font-pixel text-slate-500">HEAVY SLAM TARGET</span>
          </div>

          {/* Player & Mace Actor */}
          <div
            className={`transition-all duration-300 ease-out flex flex-col items-center transform ${
              phase === 'launch'
                ? '-translate-y-24 scale-90 opacity-90'
                : phase === 'apex'
                ? '-translate-y-36 scale-110'
                : phase === 'slam'
                ? 'translate-y-6 scale-125'
                : 'translate-y-12 scale-100'
            }`}
          >
            {/* The 1.21 Heavy Mace with Enchantment Glint */}
            <div
              className={`relative transition-transform duration-200 ${
                phase === 'apex'
                  ? 'rotate-[-35deg] translate-y-[-10px] scale-125'
                  : phase === 'slam'
                  ? 'rotate-[55deg] translate-y-[20px] scale-150'
                  : phase === 'impact'
                  ? 'rotate-[90deg] translate-y-[35px] scale-125'
                  : 'rotate-0'
              }`}
            >
              {/* Mace Head & Handle */}
              <div className="relative w-12 h-16 flex flex-col items-center">
                {/* Heavy Heavy Core Head */}
                <div className="w-10 h-10 bg-gradient-to-br from-stone-400 via-stone-600 to-stone-900 border-2 border-stone-300 shadow-lg rounded-sm relative overflow-hidden flex items-center justify-center">
                  {/* Breeze Rod / Core glow */}
                  <div className="w-4 h-4 bg-sky-300 border border-sky-100 shadow-[0_0_12px_#38bdf8] animate-pulse" />
                  {/* Purple Enchantment Glint (Breach / Density) */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/30 to-transparent mix-blend-overlay pointer-events-none" />
                </div>
                {/* Mace Handle (Breeze Rod) */}
                <div className="w-2.5 h-8 bg-gradient-to-b from-amber-600 to-amber-900 border border-amber-400 rounded-b" />
              </div>
            </div>

            {/* Steve / Player Avatar */}
            <div className="w-10 h-16 bg-[#1f232e] border-2 border-[#333a4d] rounded-sm relative flex flex-col items-center">
              {/* Head */}
              <div className="w-8 h-8 bg-[#b88053] border border-amber-900 -mt-7 flex items-center justify-center">
                <div className="flex gap-1.5 -mt-1">
                  <div className="w-1 h-1 bg-white" />
                  <div className="w-1 h-1 bg-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Expanding Shockwave Ring on Impact */}
          {phase === 'impact' && (
            <div className="absolute bottom-6 w-32 h-8 rounded-full border-4 border-sky-300 bg-sky-400/20 shadow-[0_0_35px_#38bdf8] animate-ping pointer-events-none" />
          )}

          {/* Critical Damage Float Text on Impact */}
          {phase === 'impact' && (
            <div className="absolute top-16 font-pixel text-sm md:text-base text-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] animate-bounce flex flex-col items-center">
              <span className="text-mc-diamond text-xs">💥 WIND BURST III SMASH!</span>
              <span className="text-red-400 mt-1">CRITICAL HIT: -48.5 DAMAGE</span>
            </div>
          )}
        </div>

        {/* Phase Status Bar */}
        <div className="relative z-30 pb-4 text-center">
          <div className="text-[11px] font-mono text-slate-400">
            {phase === 'launch' && '🌬️ Wind Charge Rocketing Up...'}
            {phase === 'apex' && '⚔️ Raising Heavy Mace (Density V + Breach IV)...'}
            {phase === 'slam' && '⚡ Terminal Velocity Downward Slam...'}
            {phase === 'impact' && '💥 MAXIMUM SMASH IMPACT DETONATION!'}
            {phase === 'done' && '✓ Dashboard Initialized!'}
          </div>
        </div>
      </div>
    </div>
  );
};
