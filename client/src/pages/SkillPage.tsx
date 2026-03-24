import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Axe, 
  FishSimple, 
  Fire, 
  Hammer, 
  CookingPot, 
  Flask,
  Timer,
  PlayCircle,
  PauseCircle,
  Backpack,
  Trophy,
  Target,
  ShieldStar,
  CaretDown,
  Play,
  Stop,
  Tree,
  Drop,
  Sparkle,
  Users
} from "@phosphor-icons/react";
import { Pickaxe } from "lucide-react";
import { useRoute } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import mineBg from "@assets/generated_images/dark_fantasy_mine_interior.webp";
import forestBg from "@assets/generated_images/dark_fantasy_ancient_forest.webp";
import lakeBg from "@assets/generated_images/dark_fantasy_fishing_lake.webp";
import { ITEM_IMAGES } from "@/lib/itemImages";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAudio } from "@/context/AudioContext";
import { SKILL_TO_AMBIENT_MAP, type AmbientId } from "@/lib/audioRegistry";
import { t } from "@/lib/i18n";
import { getXpForLevel, getLevelProgress, formatNumber } from "@/lib/gameMath";
import { SkillProgressBar } from "@/components/game/SkillProgressBar";
import { buildDraftQuery, translateItemName, translateItemDescription, getBaseItem } from "@/lib/items";
import { getFoodHealAmount } from "@/lib/foods";
import { useItemInspect } from "@/context/ItemInspectContext";
import { ListPlus } from "@phosphor-icons/react";
import { AddToQueueDialog } from "@/components/game/QueueDialog";
import { DurationPickerDialog, InlineDurationPicker, formatMsToHuman } from "@/components/game/DurationPickerDialog";
import { QueueCountdownTimer } from "@/components/game/QueueCountdownTimer";
import { getUsedQueueTimeMs } from "@shared/schema";
import { getSharedAudioContext, fetchSharedAudioBuffer } from "@/context/AudioContext";

const SKILL_ICONS: Record<string, any> = {
  woodcutting: Axe,
  mining: Pickaxe,
  fishing: FishSimple,
  hunting: Target,
  crafting: Hammer,
  cooking: CookingPot,
  alchemy: Flask,
  firemaking: Fire
};

const SKILL_BG: Record<string, string> = {
  woodcutting: forestBg,
  mining: mineBg,
  fishing: lakeBg
};

const SKILL_COLORS: Record<string, string> = {
  woodcutting: "text-amber-400",
  mining: "text-slate-300",
  fishing: "text-cyan-400",
  hunting: "text-amber-500",
  crafting: "text-orange-400",
  cooking: "text-rose-400",
  alchemy: "text-violet-400",
  firemaking: "text-red-400"
};

const SKILL_ACTIONS: Record<string, any[]> = {
  woodcutting: [
    { id: 1, name: "Normal Tree", level: 0, xp: 10, time: 12000 },
    { id: 2, name: "Oak Tree", level: 15, xp: 25, time: 20000 },
    { id: 3, name: "Willow Tree", level: 30, xp: 45, time: 32000 },
    { id: 4, name: "Maple Tree", level: 45, xp: 80, time: 48000 },
    { id: 5, name: "Yew Tree", level: 60, xp: 150, time: 80000 },
    { id: 6, name: "Magic Tree", level: 75, xp: 300, time: 140000 },
  ],
  mining: [
    { id: 1, name: "Copper Ore", level: 0, xp: 10, time: 12000 },
    { id: 2, name: "Tin Ore", level: 0, xp: 10, time: 12000 },
    { id: 3, name: "Iron Ore", level: 15, xp: 35, time: 24000 },
    { id: 4, name: "Coal", level: 15, xp: 25, time: 12000 },
    { id: 5, name: "Silver Ore", level: 20, xp: 40, time: 32000 },
    { id: 6, name: "Gold Ore", level: 40, xp: 65, time: 60000 },
    { id: 7, name: "Mithril Ore", level: 50, xp: 90, time: 72000 },
    { id: 8, name: "Adamant Ore", level: 70, xp: 120, time: 100000 },
    { id: 9, name: "Rune Ore", level: 85, xp: 180, time: 140000 },
  ],
  fishing: [
    { id: 1, name: "Raw Shrimp", level: 0, xp: 10, time: 12000, requiredBait: "Feather", baitAmount: 1 },
    { id: 2, name: "Raw Sardine", level: 5, xp: 20, time: 16000, requiredBait: "Feather", baitAmount: 1 },
    { id: 3, name: "Raw Herring", level: 10, xp: 30, time: 20000, requiredBait: "Feather", baitAmount: 1 },
    { id: 4, name: "Raw Trout", level: 20, xp: 50, time: 28000, requiredBait: "Feather", baitAmount: 1 },
    { id: 5, name: "Raw Salmon", level: 30, xp: 70, time: 36000, requiredBait: "Feather", baitAmount: 1 },
    { id: 6, name: "Raw Tuna", level: 40, xp: 90, time: 48000, requiredBait: "Feather", baitAmount: 2 },
    { id: 7, name: "Raw Lobster", level: 50, xp: 120, time: 60000, requiredBait: "Feather", baitAmount: 2 },
    { id: 8, name: "Raw Swordfish", level: 60, xp: 160, time: 80000, requiredBait: "Feather", baitAmount: 3 },
    { id: 9, name: "Raw Shark", level: 70, xp: 200, time: 100000, requiredBait: "Feather", baitAmount: 3 },
  ]
};

const getItemRarity = (name: string, skillActions: any[]) => {
  const action = skillActions.find(a => a.name === name);
  if (!action) return "bg-slate-500/20 border-slate-500/30";

  if (action.level >= 60) return "bg-amber-500/20 border-amber-500/40";
  if (action.level >= 30) return "bg-violet-500/20 border-violet-500/40";
  if (action.level >= 15) return "bg-emerald-500/20 border-emerald-500/40";
  return "bg-slate-500/20 border-slate-500/30";
};

const WOODCUT_SRC = '/audio/Custom/Skills/Woodcutting.ogg';
const WOODCUT_BASE_VOL = 0.4;
const WOODCUT_DUR = 1.2278;

function WoodcuttingAnimation({ actionImage, actionName }: { actionImage?: string; actionName?: string }) {
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const mountedRef = useRef(true);
  const { settings, stopAmbient } = useAudio();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [animKey, setAnimKey] = useState(0);

  const playSound = useCallback(() => {
    const buf = bufferRef.current;
    if (!buf || !mountedRef.current) return;
    const ctx = getSharedAudioContext();
    if (!ctx || ctx.state === 'closed') return;
    if (!gainRef.current || gainRef.current.context !== ctx) {
      gainRef.current = ctx.createGain();
      gainRef.current.connect(ctx.destination);
    }
    const s = settingsRef.current;
    const vol = Math.min(1, Math.max(0, WOODCUT_BASE_VOL * (s.ambientVolume / 0.4)));
    gainRef.current.gain.value = (s.ambientEnabled && s.sfxEnabled) ? vol : 0;
    try { sourceRef.current?.stop(); } catch {}
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = false;
    source.connect(gainRef.current);
    source.onended = () => {
      if (!mountedRef.current) return;
      setAnimKey(k => k + 1);
      playSound();
    };
    source.start(0);
    sourceRef.current = source;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    stopAmbient();
    fetchSharedAudioBuffer(WOODCUT_SRC).then(buf => {
      if (!mountedRef.current || !buf) return;
      bufferRef.current = buf;
      playSound();
    });
    return () => {
      mountedRef.current = false;
      try { sourceRef.current?.stop(); } catch {}
      sourceRef.current = null;
      try { gainRef.current?.disconnect(); } catch {}
      gainRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!gainRef.current) return;
    const vol = Math.min(1, Math.max(0, WOODCUT_BASE_VOL * (settings.ambientVolume / 0.4)));
    gainRef.current.gain.value = (settings.ambientEnabled && settings.sfxEnabled) ? vol : 0;
  }, [settings.ambientEnabled, settings.ambientVolume, settings.sfxEnabled]);

  const d = WOODCUT_DUR;

  return (
    <div className="relative w-48 h-48 mx-auto">
      <div key={animKey} className="absolute inset-0 flex items-center justify-center">
        <div className="wood-tree-container relative">
          {actionImage ? (
            <div className="w-40 h-40 flex items-center justify-center wood-tree-shake">
              <img 
                src={actionImage} 
                alt={actionName || "Tree"} 
                className="w-36 h-36 object-contain pixelated"
              />
            </div>
          ) : (
            <Tree className="w-32 h-32 text-amber-600 wood-tree-shake" weight="fill" />
          )}
          <div className="wood-axe-swing absolute -right-2 top-1/2 -translate-y-1/2">
            <Axe className="w-12 h-12 text-amber-400" weight="fill" />
          </div>
        </div>
      </div>
      <div key={`l1-${animKey}`} className="wood-leaf wood-leaf-1" />
      <div key={`l2-${animKey}`} className="wood-leaf wood-leaf-2" />
      <div key={`l3-${animKey}`} className="wood-leaf wood-leaf-3" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-8 bg-amber-900/20 rounded-full blur-md" />
      <style>{`
        .wood-tree-container {
          animation: woodTreePulse ${d}s ease-in-out 1 forwards;
        }
        .wood-tree-shake {
          animation: woodShake ${d}s ease-in-out 1 forwards;
        }
        .wood-axe-swing {
          animation: woodAxeSwing ${d}s ease-in-out 1 forwards;
          transform-origin: bottom left;
        }
        .wood-leaf {
          position: absolute;
          width: 8px;
          height: 8px;
          background: linear-gradient(135deg, #84cc16, #65a30d);
          border-radius: 0 50% 50% 50%;
          opacity: 0;
        }
        .wood-leaf-1 {
          top: 20%;
          left: 30%;
          animation: woodLeafFall1 ${d}s ease-out 1 forwards;
        }
        .wood-leaf-2 {
          top: 25%;
          right: 30%;
          animation: woodLeafFall2 ${d}s ease-out 1 forwards;
        }
        .wood-leaf-3 {
          top: 15%;
          left: 50%;
          animation: woodLeafFall3 ${d}s ease-out 1 forwards;
        }
        @keyframes woodTreePulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.1); }
        }
        @keyframes woodShake {
          0%, 10% { transform: translateX(0); }
          12% { transform: translateX(-3px) rotate(-1deg); }
          14% { transform: translateX(3px) rotate(1deg); }
          16% { transform: translateX(-2px) rotate(-0.5deg); }
          18% { transform: translateX(2px) rotate(0.5deg); }
          20%, 100% { transform: translateX(0) rotate(0); }
        }
        @keyframes woodAxeSwing {
          0%, 8% { transform: translateY(-50%) rotate(0deg); }
          10% { transform: translateY(-50%) rotate(-45deg); }
          14% { transform: translateY(-50%) rotate(15deg); }
          18%, 100% { transform: translateY(-50%) rotate(0deg); }
        }
        @keyframes woodLeafFall1 {
          0%, 12% { opacity: 0; transform: translate(0, 0) rotate(0deg); }
          15% { opacity: 1; }
          50% { opacity: 0.5; }
          75% { opacity: 0; transform: translate(-20px, 60px) rotate(180deg); }
          100% { opacity: 0; }
        }
        @keyframes woodLeafFall2 {
          0%, 13% { opacity: 0; transform: translate(0, 0) rotate(0deg); }
          16% { opacity: 1; }
          50% { opacity: 0.5; }
          75% { opacity: 0; transform: translate(15px, 55px) rotate(-160deg); }
          100% { opacity: 0; }
        }
        @keyframes woodLeafFall3 {
          0%, 14% { opacity: 0; transform: translate(0, 0) rotate(0deg); }
          17% { opacity: 1; }
          50% { opacity: 0.5; }
          75% { opacity: 0; transform: translate(5px, 65px) rotate(200deg); }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

const MINING_SRC = '/audio/Custom/Skills/Mining.ogg';
const MINING_BASE_VOL = 0.4;
const MINE_DUR = 1.6196;

function MiningAnimation({ actionImage, actionName }: { actionImage?: string; actionName?: string }) {
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const mountedRef = useRef(true);
  const { settings, stopAmbient } = useAudio();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [animKey, setAnimKey] = useState(0);

  const playSound = useCallback(() => {
    const buf = bufferRef.current;
    if (!buf || !mountedRef.current) return;
    const ctx = getSharedAudioContext();
    if (!ctx || ctx.state === 'closed') return;
    if (!gainRef.current || gainRef.current.context !== ctx) {
      gainRef.current = ctx.createGain();
      gainRef.current.connect(ctx.destination);
    }
    const s = settingsRef.current;
    const vol = Math.min(1, Math.max(0, MINING_BASE_VOL * (s.ambientVolume / 0.4)));
    gainRef.current.gain.value = (s.ambientEnabled && s.sfxEnabled) ? vol : 0;
    try { sourceRef.current?.stop(); } catch {}
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = false;
    source.connect(gainRef.current);
    source.onended = () => {
      if (!mountedRef.current) return;
      setAnimKey(k => k + 1);
      playSound();
    };
    source.start(0);
    sourceRef.current = source;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    stopAmbient();
    fetchSharedAudioBuffer(MINING_SRC).then(buf => {
      if (!mountedRef.current || !buf) return;
      bufferRef.current = buf;
      playSound();
    });
    return () => {
      mountedRef.current = false;
      try { sourceRef.current?.stop(); } catch {}
      sourceRef.current = null;
      try { gainRef.current?.disconnect(); } catch {}
      gainRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!gainRef.current) return;
    const vol = Math.min(1, Math.max(0, MINING_BASE_VOL * (settings.ambientVolume / 0.4)));
    gainRef.current.gain.value = (settings.ambientEnabled && settings.sfxEnabled) ? vol : 0;
  }, [settings.ambientEnabled, settings.ambientVolume, settings.sfxEnabled]);

  const d = MINE_DUR;
  const hitAt = d * 0.15;
  const sparkBase = d * 0.18;

  return (
    <div className="relative w-48 h-48 mx-auto">
      <div key={animKey} className="mine-anim-root absolute inset-0 flex items-center justify-center">
        <div className="mine-ore-container relative">
          {actionImage ? (
            <div className="w-36 h-36 flex items-center justify-center mine-ore-shake">
              <img 
                src={actionImage} 
                alt={actionName || "Ore"} 
                className="w-32 h-32 object-contain pixelated"
              />
            </div>
          ) : (
            <div className="w-28 h-28 bg-gradient-to-br from-slate-500 to-slate-700 rounded-lg mine-ore-shake shadow-lg" />
          )}
          <div className="mine-pickaxe absolute -right-4 -top-2">
            <Pickaxe className="w-12 h-12 text-slate-300" />
          </div>
        </div>
      </div>
      <div key={`s1-${animKey}`} className="mine-spark mine-spark-1" />
      <div key={`s2-${animKey}`} className="mine-spark mine-spark-2" />
      <div key={`s3-${animKey}`} className="mine-spark mine-spark-3" />
      <div key={`s4-${animKey}`} className="mine-spark mine-spark-4" />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-600/30 rounded-full blur-md" />
      <style>{`
        .mine-ore-container {
          animation: mineOrePulse ${d}s ease-in-out 1 forwards;
        }
        .mine-ore-shake {
          animation: mineOreShake ${d}s ease-in-out 1 forwards;
        }
        .mine-pickaxe {
          animation: minePickaxeSwing ${d}s ease-in-out 1 forwards;
          transform-origin: bottom right;
        }
        .mine-spark {
          position: absolute;
          width: 4px;
          height: 4px;
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          border-radius: 50%;
          opacity: 0;
          box-shadow: 0 0 4px #fbbf24;
        }
        .mine-spark-1 {
          top: 40%;
          left: 45%;
          animation: mineSparkFly1 ${d}s ease-out 1 forwards;
        }
        .mine-spark-2 {
          top: 45%;
          left: 50%;
          animation: mineSparkFly2 ${d}s ease-out 1 forwards;
        }
        .mine-spark-3 {
          top: 42%;
          left: 48%;
          animation: mineSparkFly3 ${d}s ease-out 1 forwards;
        }
        .mine-spark-4 {
          top: 48%;
          left: 52%;
          animation: mineSparkFly4 ${d}s ease-out 1 forwards;
        }
        @keyframes mineOrePulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.15); }
        }
        @keyframes mineOreShake {
          0%, 14% { transform: translate(0, 0); }
          16% { transform: translate(-3px, 1px); }
          18% { transform: translate(3px, -1px); }
          20% { transform: translate(-1px, 0); }
          22%, 100% { transform: translate(0, 0); }
        }
        @keyframes minePickaxeSwing {
          0%, 8% { transform: rotate(0deg); }
          14% { transform: rotate(-65deg); }
          18% { transform: rotate(12deg); }
          24%, 100% { transform: rotate(0deg); }
        }
        @keyframes mineSparkFly1 {
          0%, 14% { opacity: 0; transform: translate(0, 0) scale(1); }
          17% { opacity: 1; transform: translate(0, 0) scale(1); }
          45% { opacity: 0.5; }
          70% { opacity: 0; transform: translate(-25px, -30px) scale(0); }
          100% { opacity: 0; }
        }
        @keyframes mineSparkFly2 {
          0%, 15% { opacity: 0; transform: translate(0, 0) scale(1); }
          18% { opacity: 1; transform: translate(0, 0) scale(1); }
          45% { opacity: 0.5; }
          70% { opacity: 0; transform: translate(20px, -35px) scale(0); }
          100% { opacity: 0; }
        }
        @keyframes mineSparkFly3 {
          0%, 16% { opacity: 0; transform: translate(0, 0) scale(1); }
          19% { opacity: 1; transform: translate(0, 0) scale(1); }
          45% { opacity: 0.5; }
          70% { opacity: 0; transform: translate(-15px, -25px) scale(0); }
          100% { opacity: 0; }
        }
        @keyframes mineSparkFly4 {
          0%, 17% { opacity: 0; transform: translate(0, 0) scale(1); }
          20% { opacity: 1; transform: translate(0, 0) scale(1); }
          45% { opacity: 0.5; }
          70% { opacity: 0; transform: translate(25px, -20px) scale(0); }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function FishingAnimation({ actionImage, actionName }: { actionImage?: string; actionName?: string }) {
  return (
    <div className="relative w-48 h-48 mx-auto overflow-hidden">
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-cyan-900/60 to-cyan-600/30 rounded-b-lg">
        <div className="fish-water-ripple fish-ripple-1" />
        <div className="fish-water-ripple fish-ripple-2" />
        <div className="fish-water-ripple fish-ripple-3" />
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 top-4 fish-bobber">
        <div className="w-6 h-8 bg-gradient-to-b from-red-500 to-red-700 rounded-full shadow-lg relative">
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-12 bg-slate-400/50" />
        </div>
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        {actionImage ? (
          <div className="w-24 h-24 flex items-center justify-center fish-swim">
            <img 
              src={actionImage} 
              alt={actionName || "Fish"} 
              className="w-20 h-20 object-contain pixelated"
            />
          </div>
        ) : (
          <FishSimple className="w-20 h-20 text-cyan-400 fish-swim" weight="fill" />
        )}
      </div>
      <div className="fish-splash fish-splash-1" />
      <div className="fish-splash fish-splash-2" />
      <div className="fish-splash fish-splash-3" />
      <style>{`
        .fish-bobber {
          animation: fishBobberFloat 3s ease-in-out infinite;
        }
        .fish-swim {
          animation: fishSwim 4s ease-in-out infinite;
        }
        .fish-water-ripple {
          position: absolute;
          border: 1px solid rgba(34, 211, 238, 0.3);
          border-radius: 50%;
          opacity: 0;
        }
        .fish-ripple-1 {
          width: 20px;
          height: 8px;
          top: 5px;
          left: 50%;
          transform: translateX(-50%);
          animation: fishRipple 2s ease-out infinite;
        }
        .fish-ripple-2 {
          width: 30px;
          height: 10px;
          top: 5px;
          left: 50%;
          transform: translateX(-50%);
          animation: fishRipple 2s ease-out infinite;
          animation-delay: 0.3s;
        }
        .fish-ripple-3 {
          width: 40px;
          height: 12px;
          top: 5px;
          left: 50%;
          transform: translateX(-50%);
          animation: fishRipple 2s ease-out infinite;
          animation-delay: 0.6s;
        }
        .fish-splash {
          position: absolute;
          width: 6px;
          height: 6px;
          background: rgba(34, 211, 238, 0.6);
          border-radius: 50%;
          opacity: 0;
        }
        .fish-splash-1 {
          top: 50%;
          left: 45%;
          animation: fishSplash 4s ease-out infinite;
          animation-delay: 2s;
        }
        .fish-splash-2 {
          top: 48%;
          left: 55%;
          animation: fishSplash 4s ease-out infinite;
          animation-delay: 2.1s;
        }
        .fish-splash-3 {
          top: 52%;
          left: 50%;
          animation: fishSplash 4s ease-out infinite;
          animation-delay: 2.2s;
        }
        @keyframes fishBobberFloat {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          25% { transform: translateX(-50%) translateY(-3px); }
          50% { transform: translateX(-50%) translateY(2px); }
          75% { transform: translateX(-50%) translateY(-2px); }
        }
        @keyframes fishSwim {
          0%, 100% { transform: translateX(-10px) scaleX(1); opacity: 0.7; }
          25% { transform: translateX(0px) scaleX(1); opacity: 1; }
          50% { transform: translateX(10px) scaleX(-1); opacity: 0.7; }
          75% { transform: translateX(0px) scaleX(-1); opacity: 1; }
        }
        @keyframes fishRipple {
          0% { opacity: 0; transform: translateX(-50%) scale(0.5); }
          20% { opacity: 0.6; }
          100% { opacity: 0; transform: translateX(-50%) scale(2); }
        }
        @keyframes fishSplash {
          0%, 45% { opacity: 0; transform: translate(0, 0); }
          50% { opacity: 1; }
          70% { opacity: 0.5; }
          100% { opacity: 0; transform: translate(var(--splash-x, 5px), -20px); }
        }
        .fish-splash-1 { --splash-x: -8px; }
        .fish-splash-2 { --splash-x: 8px; }
        .fish-splash-3 { --splash-x: 0px; }
      `}</style>
    </div>
  );
}

const HUNT_SRC = '/audio/Custom/Skills/Hunting.ogg';
const HUNT_BASE_VOL = 0.4;
const HUNT_DUR = 1.5412;

function HuntingAnimation({ actionImage, actionName }: { actionImage?: string; actionName?: string }) {
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const mountedRef = useRef(true);
  const { settings, stopAmbient } = useAudio();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [animKey, setAnimKey] = useState(0);

  const playSound = useCallback(() => {
    const buf = bufferRef.current;
    if (!buf || !mountedRef.current) return;
    const ctx = getSharedAudioContext();
    if (!ctx || ctx.state === 'closed') return;
    if (!gainRef.current || gainRef.current.context !== ctx) {
      gainRef.current = ctx.createGain();
      gainRef.current.connect(ctx.destination);
    }
    const s = settingsRef.current;
    const vol = Math.min(1, Math.max(0, HUNT_BASE_VOL * (s.ambientVolume / 0.4)));
    gainRef.current.gain.value = (s.ambientEnabled && s.sfxEnabled) ? vol : 0;
    try { sourceRef.current?.stop(); } catch {}
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = false;
    source.connect(gainRef.current);
    source.onended = () => {
      if (!mountedRef.current) return;
      setAnimKey(k => k + 1);
      playSound();
    };
    source.start(0);
    sourceRef.current = source;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    stopAmbient();
    fetchSharedAudioBuffer(HUNT_SRC).then(buf => {
      if (!mountedRef.current || !buf) return;
      bufferRef.current = buf;
      playSound();
    });
    return () => {
      mountedRef.current = false;
      try { sourceRef.current?.stop(); } catch {}
      sourceRef.current = null;
      try { gainRef.current?.disconnect(); } catch {}
      gainRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!gainRef.current) return;
    const vol = Math.min(1, Math.max(0, HUNT_BASE_VOL * (settings.ambientVolume / 0.4)));
    gainRef.current.gain.value = (settings.ambientEnabled && settings.sfxEnabled) ? vol : 0;
  }, [settings.ambientEnabled, settings.ambientVolume, settings.sfxEnabled]);

  const d = HUNT_DUR;

  return (
    <div className="relative w-48 h-48 mx-auto">
      <div key={animKey} className="absolute inset-0 flex items-center justify-center">
        <div className="hunt-target-container relative">
          <div className="w-40 h-40 rounded-full bg-gradient-to-br from-amber-900/40 to-amber-800/20 flex items-center justify-center hunt-target-shake">
            {actionImage ? (
              <img 
                src={actionImage} 
                alt={actionName || "Prey"} 
                className="w-32 h-32 object-contain pixelated"
                style={{ mixBlendMode: 'multiply' }}
              />
            ) : (
              <Target className="w-24 h-24 text-amber-500" weight="bold" />
            )}
          </div>
          <div className="hunt-arrow absolute -left-4 top-1/2 -translate-y-1/2">
            <div className="w-12 h-2 bg-gradient-to-r from-amber-600 to-amber-400 rounded-full relative">
              <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[10px] border-l-amber-400 border-y-[5px] border-y-transparent" />
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-amber-700 rounded-sm transform rotate-45" />
            </div>
          </div>
        </div>
      </div>
      <div key={`b1-${animKey}`} className="hunt-blood hunt-blood-1" />
      <div key={`b2-${animKey}`} className="hunt-blood hunt-blood-2" />
      <div key={`b3-${animKey}`} className="hunt-blood hunt-blood-3" />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-amber-900/20 rounded-full blur-md" />
      <style>{`
        .hunt-target-container {
          animation: huntPulse ${d}s ease-in-out 1 forwards;
        }
        .hunt-target-shake {
          animation: huntShake ${d}s ease-in-out 1 forwards;
        }
        .hunt-arrow {
          animation: huntArrowFly ${d}s ease-in-out 1 forwards;
        }
        .hunt-blood {
          position: absolute;
          width: 4px;
          height: 4px;
          background: linear-gradient(to bottom, #dc2626, #991b1b);
          border-radius: 50%;
          opacity: 0;
        }
        .hunt-blood-1 {
          top: 45%;
          left: 55%;
          animation: huntBlood1 ${d}s ease-out 1 forwards;
        }
        .hunt-blood-2 {
          top: 50%;
          left: 60%;
          animation: huntBlood2 ${d}s ease-out 1 forwards;
        }
        .hunt-blood-3 {
          top: 55%;
          left: 52%;
          animation: huntBlood3 ${d}s ease-out 1 forwards;
        }
        @keyframes huntPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes huntShake {
          0%, 20% { transform: translate(0, 0); }
          22% { transform: translate(-2px, 1px); }
          24% { transform: translate(2px, -1px); }
          26% { transform: translate(-1px, 0); }
          28%, 100% { transform: translate(0, 0); }
        }
        @keyframes huntArrowFly {
          0%, 15% { transform: translateX(-30px) translateY(-50%); opacity: 1; }
          20% { transform: translateX(40px) translateY(-50%); opacity: 1; }
          25%, 100% { transform: translateX(40px) translateY(-50%); opacity: 0; }
        }
        @keyframes huntBlood1 {
          0%, 20% { opacity: 0; transform: translate(0, 0); }
          22% { opacity: 1; }
          50% { opacity: 0; transform: translate(10px, 15px); }
          100% { opacity: 0; }
        }
        @keyframes huntBlood2 {
          0%, 21% { opacity: 0; transform: translate(0, 0); }
          23% { opacity: 1; }
          52% { opacity: 0; transform: translate(8px, 20px); }
          100% { opacity: 0; }
        }
        @keyframes huntBlood3 {
          0%, 22% { opacity: 0; transform: translate(0, 0); }
          24% { opacity: 1; }
          54% { opacity: 0; transform: translate(-5px, 18px); }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function SkillAnimation({ 
  skillId, 
  actionImage, 
  actionName 
}: { 
  skillId: string; 
  actionImage?: string; 
  actionName?: string;
}) {
  if (skillId === 'woodcutting') {
    return <WoodcuttingAnimation actionImage={actionImage} actionName={actionName} />;
  }
  if (skillId === 'mining') {
    return <MiningAnimation actionImage={actionImage} actionName={actionName} />;
  }
  if (skillId === 'fishing') {
    return <FishingAnimation actionImage={actionImage} actionName={actionName} />;
  }
  if (skillId === 'hunting') {
    return <HuntingAnimation actionImage={actionImage} actionName={actionName} />;
  }
  return null;
}

export default function SkillPage() {
  const [match, params] = useRoute("/skill/:id");
  const skillId = params?.id || "woodcutting";
  const { skills, activeTask, startTask, stopTask, inventory, debugMode, currentRegion, activeTravel, partySynergyBonuses, activeCombat, taskQueue, maxQueueSlotsCount, isQueueV2, maxQueueTimeMsTotal, startTaskWithDuration, addToQueue, removeFromQueue } = useGame();
  const { openInspect } = useItemInspect();
  const { isMobile } = useMobile();
  const { language } = useLanguage();
  const { playAmbient, stopAmbient } = useAudio();

  useEffect(() => {
    // woodcutting/mining/hunting have their own local animation audio (synced with animation)
    // so we skip playAmbient for those — they call stopAmbient() themselves on mount
    const ANIMATION_AUDIO_SKILLS = ['woodcutting', 'mining', 'hunting'];
    if (activeTask?.skillId === skillId && !ANIMATION_AUDIO_SKILLS.includes(skillId)) {
      const ambientId = SKILL_TO_AMBIENT_MAP[skillId] as AmbientId | null;
      if (ambientId) {
        playAmbient(ambientId);
      }
    } else if (!ANIMATION_AUDIO_SKILLS.includes(skillId)) {
      stopAmbient();
    }
    return () => {
      if (!ANIMATION_AUDIO_SKILLS.includes(skillId)) {
        stopAmbient();
      }
    };
  }, [skillId, activeTask, playAmbient, stopAmbient]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [taskProgress, setTaskProgress] = useState(0);
  const [selectedAction, setSelectedActionRaw] = useState<any>(null);
  const setSelectedAction = (action: any) => {
    setSelectedActionRaw(action);
    if (action) setShowInlinePicker(false);
  };
  const [queueDialogAction, setQueueDialogAction] = useState<any>(null);
  const [skillActions, setSkillActions] = useState<Record<string, any[]>>({});
  const [skillActionsLoading, setSkillActionsLoading] = useState(true);
  const [skillActionsError, setSkillActionsError] = useState(false);
  const [durationPickerAction, setDurationPickerAction] = useState<any>(null);
  const [showInlinePicker, setShowInlinePicker] = useState(false);

  // Fetch skill actions from API on mount, filtered by current region
  const loadSkillActions = async () => {
    setSkillActionsLoading(true);
    setSkillActionsError(false);
    try {
      const res = await fetch(buildDraftQuery(`/api/game/skill-actions?t=${Date.now()}`));
      if (res.ok) {
        const data = await res.json();
        // Group by skill, filtered by current region
        const grouped: Record<string, any[]> = { mining: [], woodcutting: [], fishing: [], hunting: [] };
        data.forEach((action: any) => {
          const skill = action.skill;
          // Only show actions for current region (or all if no region filter)
          if (grouped[skill] && (!action.regionId || action.regionId === currentRegion)) {
            grouped[skill].push({
              id: action.id,
              name: action.name,
              itemId: action.itemId,
              level: action.levelRequired,
              xp: action.xpReward,
              time: action.duration,
              requiredBait: action.requiredBait,
              baitAmount: action.baitAmount,
              icon: action.icon,
              regionId: action.regionId,
              nameTranslations: action.nameTranslations
            });
          }
        });
        // Sort each by level
        Object.keys(grouped).forEach(skill => {
          grouped[skill].sort((a, b) => a.level - b.level);
        });
        setSkillActions(grouped);
      } else {
        setSkillActionsError(true);
      }
    } catch (error) {
      console.warn('Failed to load skill actions from API');
      setSkillActionsError(true);
    }
    setSkillActionsLoading(false);
  };

  useEffect(() => {
    loadSkillActions();
  }, [currentRegion]);
  
  // Get skill state from context or default
  const skillState = skills[skillId] || { xp: 0, level: 0 };
  // CRITICAL: Only use API data when loaded - fallback SKILL_ACTIONS has no regionId filtering!
  // If still loading, use empty array to prevent showing unfiltered actions
  const actions = skillActionsLoading ? [] : (skillActions[skillId] || []);
  const Icon = SKILL_ICONS[skillId] || Flask;
  const bgImage = SKILL_BG[skillId] || null;
  const skillColor = SKILL_COLORS[skillId] || "text-primary";
  const skillName = t(language, skillId as any);

  // Helper to get translated action name
  const getActionDisplayName = (action: any): string => {
    if (action.nameTranslations && action.nameTranslations[language]) {
      return action.nameTranslations[language];
    }
    return action.name;
  };

  // Helper to get image key - use name for woodcutting/hunting (source images), itemId for outputs
  const getActionImageKey = (action: any): string => {
    // For woodcutting and hunting, use action name to show tree/animal images
    // For other skills, use itemId for output images
    if (skillId === 'woodcutting' || skillId === 'hunting') {
      return action.name;
    }
    return action.itemId || action.name;
  };

  const nextLevelXp = getXpForLevel(skillState.level + 1);
  const currentLevelProgress = getLevelProgress(skillState.xp);

  const taskDuration = activeTask?.duration ? activeTask.duration / 1000 : 0;

  const isActive = activeTask?.skillId === skillId;

  // JavaScript-based progress calculation (replaces CSS animation)
  useEffect(() => {
    if (!activeTask || activeTask.skillId !== skillId) {
      setTaskProgress(0);
      return;
    }

    const updateProgress = () => {
      const now = Date.now();
      const elapsed = now - activeTask.startTime;
      const percent = Math.min(100, (elapsed / activeTask.duration) * 100);
      setTaskProgress(percent);
    };

    updateProgress();
    const interval = setInterval(updateProgress, 50);
    return () => clearInterval(interval);
  }, [activeTask, skillId]);

  // Filter inventory items related to this skill
  const skillInventory = Object.entries(inventory).filter(([itemName]) => {
    // Check if the inventory item matches any action's produced item (itemId)
    return actions.some(action => action.itemId === itemName);
  });

  if (isMobile) {
    return (
        <div className="space-y-3 pb-24">
          {/* Mobile Header */}
          <div 
            className="relative rounded-lg overflow-hidden border border-border p-4"
            style={bgImage ? { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.8)), url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
          >
            <SkillProgressBar
              level={skillState.level}
              xp={skillState.xp}
              skillName={skillName}
              icon={Icon}
              iconColor={skillColor}
              variant="full"
              showXpPerHour={isActive}
              xpPerHour={isActive && activeTask ? (activeTask.xpReward / (activeTask.duration / 1000)) * 3600 : 0}
            />
          </div>

          {/* Active Task Card */}
          {isActive && activeTask && (
            <Card className="bg-primary/10 border-primary/50">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold flex items-center gap-1.5">
                    <Timer className="w-4 h-4 text-primary animate-pulse" weight="bold" />
                    {activeTask.name}
                  </span>
                  <span className="text-primary font-mono text-sm">{taskDuration}s</span>
                </div>
                <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-[width] duration-100 ease-linear"
                    style={{ width: `${taskProgress}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {isActive && partySynergyBonuses.membersDoingSameSkill >= 2 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/15 border border-violet-500/30 rounded-lg" data-testid="mobile-party-synergy-indicator">
              <Users className="w-4 h-4 text-violet-400" weight="fill" />
              <span className="text-xs font-medium text-violet-300">
                {language === 'tr' ? 'Parti Sinerjisi' : 'Party Synergy'}: {partySynergyBonuses.membersDoingSameSkill} {language === 'tr' ? 'üye' : 'members'}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {partySynergyBonuses.speedBonus > 0 && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0">
                    +{Math.round(partySynergyBonuses.speedBonus * 100)}% {language === 'tr' ? 'Hız' : 'Speed'}
                  </Badge>
                )}
                {partySynergyBonuses.xpBonus > 0 && (
                  <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] px-1.5 py-0">
                    +{Math.round(partySynergyBonuses.xpBonus * 100)}% XP
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Skill Animation - Mobile */}
          {isActive && activeTask && (skillId === 'woodcutting' || skillId === 'mining' || skillId === 'fishing' || skillId === 'hunting') && (
            <div className="flex justify-center py-2">
              <SkillAnimation 
                skillId={skillId}
                actionImage={ITEM_IMAGES[getActionImageKey(actions.find(a => a.name === activeTask.name) || { name: activeTask.name })]}
                actionName={activeTask.name}
              />
            </div>
          )}

          {/* Action List - Large Touch Friendly Cards */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
              <Target className="w-4 h-4" /> {t(language, 'availableActions')}
            </h3>
            {skillActionsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Icon className={cn("w-8 h-8 animate-pulse", skillColor)} weight="bold" />
              </div>
            ) : skillActionsError ? (
              <div className="text-center p-4">
                <p className="text-muted-foreground text-sm mb-2">{t(language, 'failedToLoad')}</p>
                <Button variant="outline" size="sm" onClick={loadSkillActions}>
                  {t(language, 'retry')}
                </Button>
              </div>
            ) : actions.length === 0 ? (
              <div className="text-center p-4 text-muted-foreground text-sm">
                {t(language, 'noActionsAvailable')}
              </div>
            ) : actions.map((action: any) => {
              const isLocked = !debugMode && skillState.level < action.level;
              const isCurrentAction = activeTask?.actionId === action.id && activeTask?.skillId === skillId;
              
              return (
                <div 
                  key={action.id}
                  onClick={() => {
                    if (isLocked) return;
                    if (activeTravel) return;
                    setSelectedAction(action);
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border transition-all",
                    isCurrentAction
                       ? "bg-primary/10 border-primary shadow-lg"
                       : isLocked 
                          ? "bg-muted/20 border-border opacity-50" 
                          : "bg-card border-border active:scale-[0.98]"
                  )}
                  data-testid={`action-card-mobile-${action.id}`}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden relative",
                    isLocked ? "bg-muted" : "bg-primary/10"
                  )}>
                    {ITEM_IMAGES[getActionImageKey(action)] ? (
                      <img 
                        src={ITEM_IMAGES[getActionImageKey(action)]} 
                        alt={getActionDisplayName(action)} 
                        className={cn("w-full h-full object-cover", isLocked && "grayscale opacity-50")}
                      />
                    ) : (
                      <Icon className={cn("w-6 h-6", isLocked ? "text-muted-foreground" : "text-primary")} weight="bold" />
                    )}
                    {isLocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <ShieldStar className="w-5 h-5 text-white/80" weight="fill" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm">{getActionDisplayName(action)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t(language, 'level')} {action.level} • {action.xp} {t(language, 'xp')} • {action.time / 1000}s
                      {action.requiredBait && (
                        <span className={cn(
                          "ml-1",
                          (inventory[action.requiredBait] || 0) >= (action.baitAmount || 1)
                            ? "text-cyan-400"
                            : "text-red-400"
                        )}>
                          • x{action.baitAmount || 1} {translateItemName(action.requiredBait, language)} ({inventory[action.requiredBait] || 0})
                        </span>
                      )}
                    </div>
                  </div>
                  {isCurrentAction ? (
                    <Badge className="bg-primary text-primary-foreground animate-pulse text-[10px]">{t(language, 'working')}</Badge>
                  ) : !isLocked && (
                    <PlayCircle className="w-6 h-6 text-primary" weight="bold" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Detail Dialog */}
          <Dialog open={!!selectedAction} onOpenChange={(open) => { if (!open) { setSelectedActionRaw(null); setShowInlinePicker(false); } }}>
            <DialogContent className="bg-gradient-to-b from-card to-card/95 border-primary/30 max-w-sm">
              {selectedAction && (() => {
                const isSelectedActive = activeTask?.actionId === selectedAction.id && activeTask?.skillId === skillId;

                if (isQueueV2 && showInlinePicker) {
                  return (
                    <>
                      <DialogHeader>
                        <DialogTitle className="text-center text-lg font-bold">
                          {getActionDisplayName(selectedAction)}
                        </DialogTitle>
                      </DialogHeader>
                      <InlineDurationPicker
                        onConfirm={(durationMs) => {
                          const action = selectedAction;
                          addToQueue({
                            type: 'skill',
                            skillId,
                            actionId: action.id,
                            name: action.name,
                            xpReward: action.xp,
                            durationMs,
                            actionDuration: action.time,
                            requiredBait: action.requiredBait,
                            baitAmount: action.baitAmount,
                            itemId: action.itemId,
                          });
                          setSelectedAction(null);
                          setShowInlinePicker(false);
                        }}
                        onBack={() => setShowInlinePicker(false)}
                        maxAvailableMs={maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat)}
                        activityName={getActionDisplayName(selectedAction)}
                        mode={(activeTask || activeCombat) ? 'queue' : 'start'}
                      />
                    </>
                  );
                }

                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="text-center text-lg font-bold">
                        {getActionDisplayName(selectedAction)}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-20 h-20 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
                        {ITEM_IMAGES[getActionImageKey(selectedAction)] ? (
                          <img
                            src={ITEM_IMAGES[getActionImageKey(selectedAction)]}
                            alt={getActionDisplayName(selectedAction)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Icon className={cn("w-10 h-10", skillColor)} weight="bold" />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 w-full text-sm">
                        <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t(language, 'level')}</div>
                          <div className="font-bold text-base">{selectedAction.level}</div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t(language, 'xp')}</div>
                          <div className="font-bold text-base text-green-400">{selectedAction.xp}</div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2.5 text-center col-span-2">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t(language, 'duration')}</div>
                          <div className="font-bold text-base flex items-center justify-center gap-1">
                            <Timer className="w-4 h-4 text-primary" weight="bold" />
                            {selectedAction.time / 1000}s
                          </div>
                        </div>
                        {selectedAction.requiredBait && (
                          <div className="bg-muted/30 rounded-lg p-2.5 text-center col-span-2">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t(language, 'required')}</div>
                            <div className="font-bold text-sm flex items-center justify-center gap-2">
                              <span>x{selectedAction.baitAmount || 1} {translateItemName(selectedAction.requiredBait, language)}</span>
                              <span className={cn(
                                "text-xs",
                                (inventory[selectedAction.requiredBait] || 0) >= (selectedAction.baitAmount || 1)
                                  ? "text-cyan-400"
                                  : "text-red-400"
                              )}>
                                ({inventory[selectedAction.requiredBait] || 0})
                              </span>
                            </div>
                          </div>
                        )}
                        {selectedAction.itemId && (() => {
                          const producedItem = getBaseItem(selectedAction.itemId);
                          const foodHeal = getFoodHealAmount(selectedAction.itemId);
                          return (
                            <div className="bg-muted/30 rounded-lg p-2.5 text-center col-span-2">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t(language, 'produces')}</div>
                              <div className="font-bold text-sm flex items-center justify-center gap-2">
                                {ITEM_IMAGES[selectedAction.itemId] && (
                                  <img src={ITEM_IMAGES[selectedAction.itemId]} alt={selectedAction.itemId} className="w-5 h-5 object-contain" />
                                )}
                                <span>{translateItemName(selectedAction.itemId, language)}</span>
                              </div>
                              {producedItem && (
                                <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                                  {translateItemDescription(producedItem.name || producedItem.id, language)}
                                </div>
                              )}
                              {foodHeal > 0 && (
                                <div className="text-xs text-green-400 font-medium mt-1">
                                  {t(language, 'healsHp')} +{foodHeal} {t(language, 'hp')}
                                </div>
                              )}
                              {producedItem?.stats && (
                                <div className="flex flex-wrap items-center justify-center gap-2 mt-1.5">
                                  {producedItem.stats.attackBonus ? <span className="text-[10px] text-red-400">ATK +{producedItem.stats.attackBonus}</span> : null}
                                  {producedItem.stats.strengthBonus ? <span className="text-[10px] text-orange-400">STR +{producedItem.stats.strengthBonus}</span> : null}
                                  {producedItem.stats.defenceBonus ? <span className="text-[10px] text-blue-400">DEF +{producedItem.stats.defenceBonus}</span> : null}
                                  {producedItem.stats.accuracyBonus ? <span className="text-[10px] text-yellow-400">ACC +{producedItem.stats.accuracyBonus}</span> : null}
                                  {producedItem.stats.hitpointsBonus ? <span className="text-[10px] text-green-400">HP +{producedItem.stats.hitpointsBonus}</span> : null}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      {isSelectedActive ? (
                        <Button
                          onClick={() => {
                            stopTask();
                            setSelectedAction(null);
                          }}
                          variant="destructive"
                          className="w-full font-bold"
                          data-testid="dialog-stop-task"
                        >
                          <Stop className="w-4 h-4 mr-2" weight="fill" />
                          {t(language, 'stop')}
                        </Button>
                      ) : isQueueV2 ? (
                        <Button
                          onClick={() => {
                            setShowInlinePicker(true);
                          }}
                          className="w-full bg-primary font-bold"
                          data-testid="dialog-start-task"
                        >
                          {(activeTask || activeCombat) ? (
                            <ListPlus className="w-4 h-4 mr-2" weight="bold" />
                          ) : (
                            <PlayCircle className="w-4 h-4 mr-2" weight="bold" />
                          )}
                          {(activeTask || activeCombat) ? t(language, 'addToQueue') : t(language, 'start')}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => {
                            if (activeTask) stopTask();
                            startTask(skillId, selectedAction.id, selectedAction.time, selectedAction.name, selectedAction.xp, selectedAction.requiredBait, selectedAction.baitAmount, undefined, selectedAction.itemId);
                            setSelectedAction(null);
                          }}
                          className="w-full bg-primary font-bold"
                          data-testid="dialog-start-task"
                        >
                          <PlayCircle className="w-4 h-4 mr-2" weight="bold" />
                          {t(language, 'start')}
                        </Button>
                      )}
                    </div>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>

          {/* Collapsible Inventory */}
          <Collapsible open={inventoryOpen} onOpenChange={setInventoryOpen}>
            <Card className="bg-card/50 border-border/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="py-2 px-3 cursor-pointer hover:bg-muted/10">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Backpack className="w-4 h-4" weight="bold" />
                      {t(language, 'inventory')}
                      {skillInventory.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1">
                          {skillInventory.length}
                        </Badge>
                      )}
                    </span>
                    <CaretDown className={cn(
                      "w-4 h-4 transition-transform",
                      inventoryOpen && "rotate-180"
                    )} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="py-0 px-2 pb-2">
                  <div className="grid grid-cols-4 gap-1.5">
                    {[...Array(16)].map((_, i) => {
                      const item = skillInventory[i];
                      const rarityClass = item ? getItemRarity(item[0], actions) : "";
                      
                      return (
                        <div 
                          key={i} 
                          className={cn(
                            "aspect-square rounded-lg flex items-center justify-center relative",
                            item 
                              ? `border ${rarityClass} hover:brightness-110 hover:ring-1 hover:ring-white/20 cursor-pointer` 
                              : "bg-muted/30 border border-dashed border-border/50"
                          )}
                          onClick={() => item && openInspect({ name: item[0], quantity: item[1] })}
                          data-testid={item ? `skill-inv-mobile-${item[0]}` : `skill-inv-mobile-empty-${i}`}
                        >
                          {item ? (
                            <>
                              <div className="absolute top-0.5 left-1 text-[9px] font-bold font-mono z-10">
                                {formatNumber(item[1])}
                              </div>
                              {ITEM_IMAGES[item[0]] ? (
                                <img 
                                  src={ITEM_IMAGES[item[0]]} 
                                  alt={item[0]} 
                                  className="w-[90%] h-[90%] object-cover rounded"
                                />
                              ) : (
                                <Icon className={cn("w-[70%] h-[70%]", skillColor)} weight="bold" />
                              )}
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Floating Action Button with Idle Timer */}
          {isActive && isQueueV2 && activeTask?.queueDurationMs && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2">
              <QueueCountdownTimer
                startTime={activeTask.startTime}
                durationMs={activeTask.queueDurationMs}
                onStop={stopTask}
              />
              <Button 
                onClick={stopTask}
                variant="destructive" 
                size="lg"
                className="h-14 px-8 rounded-full shadow-lg shadow-red-500/30 text-base"
                data-testid="fab-stop-task"
              >
                <Stop className="w-5 h-5 mr-2" weight="fill" />
                {t(language, 'stop')}
              </Button>
            </div>
          )}
        </div>
    );
  }

  return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
        
        {/* Left Column: Active Action & Visuals */}
        <div className="lg:col-span-2 flex flex-col h-full gap-6">
          
          {/* Hero Section */}
          <div className="relative rounded-lg overflow-hidden border border-border group h-2/3 flex flex-col shadow-lg">
             {/* Background Image */}
             <div className="absolute inset-0 z-0">
               {bgImage ? (
                 <img 
                   src={bgImage} 
                   alt="Background" 
                   className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-1000"
                 />
               ) : (
                 <div className="w-full h-full bg-sidebar/50" />
               )}
               <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
             </div>

             {/* Content */}
             <div className="relative z-10 p-8 flex flex-col h-full justify-between">
               <div className="flex justify-between items-start">
                 <div className="flex items-center gap-4">
                   <div className="p-3 bg-black/50 backdrop-blur-md rounded-xl border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                     <Icon className={cn("w-8 h-8", skillColor)} weight="bold" />
                   </div>
                   <div>
                     <h1 className="text-4xl font-display font-bold text-white tracking-tight drop-shadow-md">
                       {skillName}
                     </h1>
                     <div className="flex items-center gap-2 mt-1">
                       <Badge variant="secondary" className="bg-white/10 text-white border-white/20 backdrop-blur-sm">
                         {t(language, 'level')} {skillState.level}
                       </Badge>
                       <span className="text-white/60 text-sm font-ui cursor-help" title={`${skillState.xp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP`}>
                         {skillState.xp.toLocaleString()} / {nextLevelXp.toLocaleString()} {t(language, 'xp')}
                       </span>
                     </div>
                   </div>
                 </div>
                 
                 {(() => {
                   const currentXpPerHour = activeTask?.skillId === skillId 
                     ? (activeTask.xpReward / (activeTask.duration / 1000)) * 3600 
                     : 0;
                   const xpRemaining = nextLevelXp - skillState.xp;
                   const timeToLevelSec = currentXpPerHour > 0 ? (xpRemaining / currentXpPerHour) * 3600 : 0;
                   const formatTTL = (sec: number) => {
                     if (!isFinite(sec) || sec <= 0) return "";
                     const h = Math.floor(sec / 3600);
                     const m = Math.floor((sec % 3600) / 60);
                     const s = Math.floor(sec % 60);
                     return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                   };
                   return (
                     <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10">
                       <div className="text-xs text-muted-foreground uppercase tracking-widest font-ui mb-1">{t(language, 'xpPerHour')}</div>
                       <div className="text-xl font-bold text-green-400 font-mono" title={`${Math.round(currentXpPerHour).toLocaleString()} XP/h`}>
                         {formatNumber(currentXpPerHour)}
                       </div>
                       {timeToLevelSec > 0 && (
                         <div className="text-xs text-cyan-400 font-mono mt-0.5" title={`${xpRemaining.toLocaleString()} XP remaining`}>
                           {formatTTL(timeToLevelSec)}
                         </div>
                       )}
                     </div>
                   );
                 })()}
               </div>

               {isActive && partySynergyBonuses.membersDoingSameSkill >= 2 && (
                 <div className="flex items-center gap-2 px-4 py-2 bg-violet-500/15 border border-violet-500/30 rounded-lg max-w-md mx-auto" data-testid="desktop-party-synergy-indicator">
                   <Users className="w-4 h-4 text-violet-400" weight="fill" />
                   <span className="text-sm font-medium text-violet-300">
                     {language === 'tr' ? 'Parti Sinerjisi' : 'Party Synergy'}: {partySynergyBonuses.membersDoingSameSkill} {language === 'tr' ? 'üye' : 'members'}
                   </span>
                   <div className="flex items-center gap-2 ml-auto">
                     {partySynergyBonuses.speedBonus > 0 && (
                       <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0">
                         +{Math.round(partySynergyBonuses.speedBonus * 100)}% {language === 'tr' ? 'Hız' : 'Speed'}
                       </Badge>
                     )}
                     {partySynergyBonuses.xpBonus > 0 && (
                       <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] px-1.5 py-0">
                         +{Math.round(partySynergyBonuses.xpBonus * 100)}% XP
                       </Badge>
                     )}
                   </div>
                 </div>
               )}

               {/* Skill Animation - Desktop */}
               {isActive && activeTask && (skillId === 'woodcutting' || skillId === 'mining' || skillId === 'fishing' || skillId === 'hunting') && (
                 <div className="flex justify-center py-4">
                   <SkillAnimation 
                     skillId={skillId}
                     actionImage={ITEM_IMAGES[getActionImageKey(actions.find(a => a.name === activeTask.name) || { name: activeTask.name })]}
                     actionName={activeTask.name}
                   />
                 </div>
               )}

               {/* Active Progress */}
               <div className="max-w-2xl w-full mx-auto mb-8 bg-black/60 backdrop-blur-md p-6 rounded-xl border border-white/10 transition-all duration-500">
                 {isActive && activeTask ? (
                   <>
                     <div className="flex justify-between items-center mb-3">
                       <span className="text-lg font-bold text-white flex items-center gap-2">
                         <Timer className="w-5 h-5 text-primary animate-pulse" weight="bold" />
                         {activeTask.name || t(language, 'working')}
                       </span>
                       <span className="text-primary font-mono">
                         {taskDuration}s
                       </span>
                     </div>
                     <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-[width] duration-100 ease-linear"
                         style={{ width: `${taskProgress}%` }}
                       />
                     </div>
                     {/* Idle Timer with Stop Button */}
                     <div className="mt-4 flex flex-col items-center gap-3">
                       {isQueueV2 && activeTask.queueDurationMs ? (
                         <QueueCountdownTimer
                           startTime={activeTask.startTime}
                           durationMs={activeTask.queueDurationMs}
                           onStop={stopTask}
                         />
                       ) : null}
                       <Button 
                          onClick={stopTask}
                          variant="destructive" 
                          size="sm" 
                          className="w-full font-bold tracking-wide"
                       >
                          <PauseCircle className="w-5 h-5 mr-2" weight="bold" /> {t(language, 'stop')}
                       </Button>
                     </div>
                   </>
                 ) : (
                   <div className="text-center py-4 text-muted-foreground font-ui">
                     {t(language, 'selectActionPrompt')}
                   </div>
                 )}
               </div>
             </div>
          </div>

          {/* Action Selection */}
          <Card className="flex-1 bg-card/50 backdrop-blur-sm border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-ui uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Target className="w-5 h-5" weight="bold" /> {t(language, 'availableActions')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48 pr-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {skillActionsLoading ? (
                    <div className="col-span-2 flex items-center justify-center p-8">
                      <Icon className={cn("w-8 h-8 animate-pulse", skillColor)} weight="bold" />
                    </div>
                  ) : skillActionsError ? (
                    <div className="col-span-2 text-center p-4">
                      <p className="text-muted-foreground mb-2">{t(language, 'failedToLoad')}</p>
                      <Button variant="outline" size="sm" onClick={loadSkillActions}>
                        {t(language, 'retry')}
                      </Button>
                    </div>
                  ) : actions.length === 0 ? (
                    <div className="col-span-2 text-center p-4 text-muted-foreground">
                      {t(language, 'noActionsAvailable')}
                    </div>
                  ) : actions.map((action: any) => {
                    const isLocked = !debugMode && skillState.level < action.level;
                    const isCurrentAction = activeTask?.actionId === action.id && activeTask?.skillId === skillId;
                    
                    return (
                      <div 
                        key={action.id}
                        onClick={() => {
                          if (isLocked) return;
                          if (activeTravel) return;
                          if (isQueueV2) {
                            setDurationPickerAction(action);
                          } else {
                            if (activeTask) stopTask();
                            startTask(skillId, action.id, action.time, action.name, action.xp, action.requiredBait, action.baitAmount, undefined, action.itemId);
                          }
                        }}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer group select-none",
                          isCurrentAction
                             ? "bg-primary/10 border-primary shadow-[0_0_10px_rgba(234,179,8,0.2)]"
                             : isLocked 
                                ? "bg-muted/20 border-border opacity-50 cursor-not-allowed" 
                                : "bg-card hover:bg-accent/50 hover:border-primary/50 border-border"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded flex items-center justify-center overflow-hidden relative",
                            isLocked ? "bg-muted" : "bg-primary/10"
                          )}>
                             {ITEM_IMAGES[getActionImageKey(action)] ? (
                               <img 
                                 src={ITEM_IMAGES[getActionImageKey(action)]} 
                                 alt={getActionDisplayName(action)} 
                                 className={cn("w-full h-full object-cover", isLocked && "grayscale opacity-50")}
                               />
                             ) : (
                               <Icon className={cn("w-5 h-5", isLocked ? "text-muted-foreground" : "text-primary")} weight="bold" />
                             )}
                             {isLocked && (
                               <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                 <ShieldStar className="w-4 h-4 text-white/80" weight="fill" />
                               </div>
                             )}
                          </div>
                          <div>
                             <div className="font-bold text-sm">{getActionDisplayName(action)}</div>
                             <div className="text-xs text-muted-foreground">
                               {t(language, 'level')} {action.level} • {action.xp} {t(language, 'xp')} • {action.time / 1000}s
                               {action.requiredBait && (
                                 <span className={cn(
                                   "ml-1",
                                   (inventory[action.requiredBait] || 0) >= (action.baitAmount || 1)
                                     ? "text-cyan-400"
                                     : "text-red-400"
                                 )}>
                                   • x{action.baitAmount || 1} {translateItemName(action.requiredBait, language)} ({inventory[action.requiredBait] || 0})
                                 </span>
                               )}
                             </div>
                          </div>
                        </div>
                        {!isLocked && (
                          <div className={cn("transition-opacity", isCurrentAction ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                            {isCurrentAction ? (
                               <div className="flex gap-2">
                                  <Badge className="bg-primary text-primary-foreground animate-pulse">{t(language, 'active')}</Badge>
                               </div>
                            ) : (
                               <div className="flex items-center gap-1">
                                 <Button
                                   size="icon"
                                   variant="ghost"
                                   className="h-8 w-8"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     if (isQueueV2) {
                                       setDurationPickerAction(action);
                                     } else {
                                       setQueueDialogAction(action);
                                     }
                                   }}
                                   data-testid={`button-queue-action-${action.id}`}
                                 >
                                   <ListPlus className="w-5 h-5 text-amber-400" weight="bold" />
                                 </Button>
                                 <Button size="icon" variant="ghost">
                                   <PlayCircle className="w-6 h-6 text-primary" weight="bold" />
                                 </Button>
                               </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {queueDialogAction && (
            <AddToQueueDialog
              open={!!queueDialogAction}
              onClose={() => setQueueDialogAction(null)}
              queueItem={{
                type: 'skill',
                skillId,
                actionId: queueDialogAction.id,
                name: queueDialogAction.name,
                xpReward: queueDialogAction.xp,
                requiredBait: queueDialogAction.requiredBait,
                baitAmount: queueDialogAction.baitAmount,
                itemId: queueDialogAction.itemId,
                actionDuration: queueDialogAction.time,
              }}
            />
          )}

        </div>

        {/* Right Column: Skill Inventory */}
        <div className="flex flex-col h-full">
           <Card className="flex-1 bg-card border-border flex flex-col shadow-lg overflow-hidden">
             <CardHeader className="border-b border-border bg-muted/30">
               <CardTitle className="flex items-center gap-2 text-sm font-ui uppercase tracking-widest text-muted-foreground">
                 <Backpack className="w-5 h-5" weight="bold" /> {t(language, 'skillInventory')}
               </CardTitle>
             </CardHeader>

             <CardContent className="flex-1 p-4 bg-card">
               <ScrollArea className="h-[calc(100vh-20rem)] pr-2">
                 <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
                   {/* Create grid slots */}
                   {[...Array(24)].map((_, i) => {
                     const item = skillInventory[i];
                     const rarityClass = item ? getItemRarity(item[0], actions) : "";
                     
                     return (
                       <div 
                        key={i} 
                        className={cn(
                          "aspect-square rounded-lg flex items-center justify-center relative transition-all group select-none",
                          item 
                            ? `border ${rarityClass} shadow-sm hover:brightness-110 hover:ring-1 hover:ring-white/20 cursor-pointer` 
                            : "bg-muted/50 border border-dashed border-border"
                        )}
                        onClick={() => item && openInspect({ name: item[0], quantity: item[1] })}
                        data-testid={item ? `skill-inv-item-${item[0]}` : `skill-inv-empty-${i}`}
                       >
                          {item ? (
                            <>
                              <div className="absolute top-1 left-1.5 text-[10px] font-bold text-foreground z-10 font-mono">
                                {formatNumber(item[1])}
                              </div>

                              <div className="relative z-0 transform group-hover:scale-105 transition-transform duration-200 w-[90%] h-[90%]">
                                {ITEM_IMAGES[item[0]] ? (
                                  <img 
                                    src={ITEM_IMAGES[item[0]]} 
                                    alt={item[0]} 
                                    className="w-full h-full object-cover rounded"
                                  />
                                ) : (
                                  <Icon className={cn("w-full h-full", skillColor)} weight="bold" />
                                )}
                              </div>

                              <div className="absolute bottom-1 right-1.5 text-[10px] font-bold text-muted-foreground font-mono">
                                1
                              </div>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/30 font-mono select-none">{t(language, 'emptySlot')}</span>
                          )}
                       </div>
                     );
                   })}
                 </div>
               </ScrollArea>
             </CardContent>
           </Card>
        </div>

        {isQueueV2 && durationPickerAction && (
          <DurationPickerDialog
            open={!!durationPickerAction}
            onClose={() => setDurationPickerAction(null)}
            onConfirm={(durationMs) => {
              const action = durationPickerAction;
              addToQueue({
                type: 'skill',
                skillId,
                actionId: action.id,
                name: action.name,
                xpReward: action.xp,
                durationMs,
                actionDuration: action.time,
                requiredBait: action.requiredBait,
                baitAmount: action.baitAmount,
                itemId: action.itemId,
              });
              setDurationPickerAction(null);
            }}
            maxAvailableMs={maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat)}
            activityName={durationPickerAction.name}
            mode={(activeTask || activeCombat) ? 'queue' : 'start'}
            taskQueue={taskQueue}
            onRemoveFromQueue={removeFromQueue}
          />
        )}

      </div>
  );
}
