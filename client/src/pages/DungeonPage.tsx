import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { usePartyWebSocket } from "@/hooks/usePartyWebSocket";
import { usePartyInvites } from "@/hooks/usePartyInvites";
import { useLocation } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { trackDungeonEntered, trackDungeonKeyUsed } from "@/hooks/useAchievementTracker";
import { getItemImage } from "@/lib/itemImages";
import { getMonsterImage } from "@/lib/monsterImages";
import { translateItemName, formatItemIdAsName, getItemRarityColor } from "@/lib/items";
import { getLocalizedMonsterName } from "@/lib/gameTranslations";
import { formatNumber } from "@/lib/gameMath";
import type { Language } from "@/lib/i18n";
import {
  Key,
  Skull,
  Stairs,
  Warning,
  CaretRight,
  Spiral,
  Sword,
  Crown,
  Star,
  Package,
  Lightning,
  Trophy,
  Play,
  UsersThree,
  Moon,
  CheckCircle,
  MagnifyingGlass,
  UserPlus,
  Shield,
  XCircle,
  Users,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Translation objects for tester gate
const TESTER_GATE_TITLES: Record<string, string> = {
  en: "Under Construction",
  tr: "Yapım Aşamasında",
  ru: "В разработке",
  es: "En Construcción",
  fr: "En Construction",
  zh: "建设中",
  ar: "قيد الإنشاء",
  hi: "निर्माणाधीन",
};

const TESTER_GATE_DESCRIPTIONS: Record<string, string> = {
  en: "Dungeons are currently in testing phase. Only testers can access this content. Join our Discord to become a tester!",
  tr: "Zindanlar şu anda test aşamasında. Sadece tester'lar bu içeriğe erişebilir. Tester olmak için Discord'umuza katıl!",
  ru: "Подземелья сейчас в стадии тестирования. Только тестеры могут получить доступ. Присоединяйтесь к нашему Discord, чтобы стать тестером!",
  es: "Las mazmorras están en fase de pruebas. Solo los testers pueden acceder. ¡Únete a nuestro Discord para ser tester!",
  fr: "Les donjons sont actuellement en phase de test. Seuls les testeurs peuvent y accéder. Rejoignez notre Discord pour devenir testeur !",
  zh: "地牢目前处于测试阶段。只有测试人员才能访问。加入我们的Discord成为测试人员！",
  ar: "الأبراج المحصنة حالياً في مرحلة الاختبار. فقط المختبرون يمكنهم الوصول. انضم إلى Discord لتصبح مختبراً!",
  hi: "डंजन वर्तमान में परीक्षण चरण में हैं। केवल टेस्टर ही इस सामग्री तक पहुंच सकते हैं। टेस्टर बनने के लिए हमारे Discord में शामिल हों!",
};

const DISCORD_BUTTON_LABELS: Record<string, string> = {
  en: "Join Discord",
  tr: "Discord'a Katıl",
  ru: "Присоединиться к Discord",
  es: "Únete a Discord",
  fr: "Rejoindre Discord",
  zh: "加入Discord",
  ar: "انضم إلى Discord",
  hi: "Discord में शामिल हों",
};

const TESTER_BANNER_TEXTS: Record<string, string> = {
  en: "Tester exclusive content! Don't forget to give feedback!",
  tr: "Tester'a özel içerik! Feedback vermeyi unutma!",
  ru: "Эксклюзивный контент для тестеров! Не забудьте оставить отзыв!",
  es: "¡Contenido exclusivo para testers! ¡No olvides dar tu feedback!",
  fr: "Contenu exclusif pour testeurs ! N'oubliez pas de donner votre avis !",
  zh: "测试人员专属内容！别忘了提供反馈！",
  ar: "محتوى حصري للمختبرين! لا تنسَ إعطاء ملاحظاتك!",
  hi: "टेस्टर विशेष सामग्री! फीडबैक देना न भूलें!",
};

interface DungeonLootDrop {
  itemId: string;
  weight: number;
}

interface DungeonLootTable {
  floorRangeStart: number;
  floorRangeEnd: number;
  possibleDrops: DungeonLootDrop[];
  guaranteedDrops: string[];
  partyExclusiveDrops?: { itemId: string; partyWeight: number; soloWeight: number }[];
}

interface DungeonConfig {
  requiredKeys: number;
  maxMembers: number;
  maxFloors: number;
  maxRunTimeMinutes: number;
}

interface DungeonProgress {
  highestFloor: number;
  totalClears: number;
}

interface DungeonData {
  id: string;
  name: string;
  description: string;
  tier: number;
  keyType: string;
  floorCount: number | null;
  isEndless: number;
  minLevel: number;
  recommendedLevel: number;
  icon: string | null;
  nameTranslations: Record<string, string>;
  descriptionTranslations: Record<string, string>;
  localizedName: string;
  localizedDescription: string;
  config: DungeonConfig | null;
  lootTables: DungeonLootTable[];
  playerKeyCount: number;
  playerProgress: DungeonProgress | null;
}

interface ActiveSession {
  id: string;
  dungeonId: string;
  currentFloor: number;
  status: string;
}

const TIER_STYLES: Record<number, { radial: string; border: string; text: string; badge: string }> = {
  1: {
    radial: "bg-[radial-gradient(ellipse_at_center,_#2a2215_0%,_#1f1a10_40%,_#0d0d0a_100%)]",
    border: "border-amber-900/50",
    text: "text-amber-600",
    badge: "bg-amber-950/80 text-amber-500 border-amber-800/50",
  },
  2: {
    radial: "bg-[radial-gradient(ellipse_at_center,_#1e2028_0%,_#181a22_40%,_#0d0d12_100%)]",
    border: "border-slate-700/50",
    text: "text-slate-400",
    badge: "bg-slate-900/80 text-slate-300 border-slate-700/50",
  },
  3: {
    radial: "bg-[radial-gradient(ellipse_at_center,_#12162e_0%,_#0f1328_40%,_#080a1a_100%)]",
    border: "border-blue-900/50",
    text: "text-blue-400",
    badge: "bg-blue-950/80 text-blue-400 border-blue-800/50",
  },
  4: {
    radial: "bg-[radial-gradient(ellipse_at_center,_#2a1215_0%,_#1f1012_40%,_#0d080a_100%)]",
    border: "border-red-900/50",
    text: "text-red-400",
    badge: "bg-red-950/80 text-red-400 border-red-800/50",
  },
  5: {
    radial: "bg-[radial-gradient(ellipse_at_center,_#1a122e_0%,_#150f28_40%,_#0a081a_100%)]",
    border: "border-purple-900/50",
    text: "text-purple-400",
    badge: "bg-purple-950/80 text-purple-400 border-purple-800/50",
  },
};

const KEY_STYLES: Record<string, { text: string; bg: string; border: string }> = {
  bronze: { text: "text-amber-500", bg: "bg-amber-600/15", border: "border-amber-600/40" },
  silver: { text: "text-slate-300", bg: "bg-slate-400/15", border: "border-slate-400/40" },
  gold: { text: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/40" },
  void: { text: "text-purple-400", bg: "bg-purple-600/15", border: "border-purple-600/40" },
};

function getTierStyle(tier: number) {
  return TIER_STYLES[Math.min(tier, 5)] || TIER_STYLES[5];
}

function getKeyStyle(keyType: string) {
  return KEY_STYLES[keyType] || KEY_STYLES.bronze;
}

function getDifficulty(totalLevel: number, recommendedLevel: number) {
  const ratio = totalLevel / Math.max(recommendedLevel, 1);
  if (ratio >= 1.5) return { label: "Easy", color: "text-green-400", barColor: "bg-green-500", percent: 25 };
  if (ratio >= 1.1) return { label: "Normal", color: "text-yellow-400", barColor: "bg-yellow-500", percent: 50 };
  if (ratio >= 0.8) return { label: "Hard", color: "text-orange-400", barColor: "bg-orange-500", percent: 70 };
  if (ratio >= 0.5) return { label: "Deadly", color: "text-red-400", barColor: "bg-red-500", percent: 90 };
  return { label: "Impossible", color: "text-red-600", barColor: "bg-red-700", percent: 100 };
}

function getAllUniqueDrops(lootTables: DungeonLootTable[]): { itemId: string; totalWeight: number }[] {
  const dropMap = new Map<string, number>();
  for (const lt of lootTables) {
    for (const drop of (lt.possibleDrops || [])) {
      dropMap.set(drop.itemId, (dropMap.get(drop.itemId) || 0) + drop.weight);
    }
  }
  return Array.from(dropMap.entries())
    .map(([itemId, totalWeight]) => ({ itemId, totalWeight }))
    .sort((a, b) => b.totalWeight - a.totalWeight);
}

function getAllPartyExclusiveDrops(lootTables: DungeonLootTable[]): { itemId: string; partyWeight: number; soloWeight: number }[] {
  const dropMap = new Map<string, { partyWeight: number; soloWeight: number }>();
  for (const lt of lootTables) {
    for (const drop of (lt.partyExclusiveDrops || [])) {
      const existing = dropMap.get(drop.itemId);
      if (!existing || drop.partyWeight > existing.partyWeight) {
        dropMap.set(drop.itemId, { partyWeight: drop.partyWeight, soloWeight: drop.soloWeight });
      }
    }
  }
  return Array.from(dropMap.entries())
    .map(([itemId, weights]) => ({ itemId, ...weights }))
    .sort((a, b) => b.partyWeight - a.partyWeight);
}

function calcDropPercent(weight: number, totalWeight: number): string {
  if (totalWeight === 0) return "0%";
  const pct = (weight / totalWeight) * 100;
  if (pct < 0.1) return "<0.1%";
  if (pct < 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(0)}%`;
}

function DungeonCard({
  dungeon,
  totalLevel,
  language,
  mode,
  onEnterSolo,
  onEnterOffline,
  onStartParty,
  onCreateParty,
  isEntering,
  isCreatingParty,
  hasParty,
  debugMode,
  allMembersReady,
}: {
  dungeon: DungeonData;
  totalLevel: number;
  language: Language;
  mode: "solo" | "party";
  onEnterSolo: (id: string) => void;
  onEnterOffline: (id: string) => void;
  onStartParty: (id: string) => void;
  onCreateParty: (dungeonId: string) => void;
  isEntering: boolean;
  isCreatingParty?: boolean;
  hasParty: boolean;
  debugMode: boolean;
  allMembersReady?: boolean;
}) {
  const [showLoot, setShowLoot] = useState(false);
  const tierStyle = getTierStyle(dungeon.tier);
  const keyStyle = getKeyStyle(dungeon.keyType);
  const difficulty = getDifficulty(totalLevel, dungeon.recommendedLevel);
  const keyCount = dungeon.playerKeyCount;
  const requiredKeys = dungeon.config?.requiredKeys || 1;
  const canEnter = debugMode || keyCount >= requiredKeys;
  const allDrops = getAllUniqueDrops(dungeon.lootTables || []);
  const partyExclusiveDrops = getAllPartyExclusiveDrops(dungeon.lootTables || []);
  const totalWeight = allDrops.reduce((sum, d) => sum + d.totalWeight, 0);
  const visibleDrops = showLoot ? allDrops : allDrops.slice(0, 4);
  const floorCount = dungeon.isEndless ? null : (dungeon.floorCount || dungeon.config?.maxFloors || 100);
  const progress = dungeon.playerProgress;

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-200 border",
        tierStyle.radial,
        tierStyle.border,
        !canEnter && "opacity-60"
      )}
      data-testid={`dungeon-card-${dungeon.id}`}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Skull className={cn("w-5 h-5 shrink-0", tierStyle.text)} weight="fill" />
              <h3
                className="text-base font-bold text-gray-100 truncate"
                data-testid={`dungeon-name-${dungeon.id}`}
              >
                {dungeon.localizedName}
              </h3>
            </div>
            <p className="text-xs text-gray-400 mt-1 line-clamp-2 italic">
              &ldquo;{dungeon.localizedDescription}&rdquo;
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-xs font-bold", tierStyle.badge)}
            data-testid={`dungeon-tier-${dungeon.id}`}
          >
            Tier {dungeon.tier}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Lightning className={cn("w-4 h-4", difficulty.color)} weight="fill" />
            <span className="text-xs text-gray-400">Power:</span>
            <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", difficulty.barColor)}
                style={{ width: `${difficulty.percent}%` }}
              />
            </div>
            <span className={cn("text-xs font-semibold", difficulty.color)} data-testid={`dungeon-difficulty-${dungeon.id}`}>
              {difficulty.label}
            </span>
            {difficulty.label === "Impossible" && <Skull className="w-3 h-3 text-red-600" weight="fill" />}
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded border", keyStyle.bg, keyStyle.border)}>
              <Key className={cn("w-3.5 h-3.5", keyStyle.text)} weight="fill" />
              <span className={cn("font-medium capitalize", keyStyle.text)}>
                {dungeon.keyType} × {requiredKeys}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-gray-400">
              {dungeon.isEndless ? (
                <>
                  <Spiral className="w-3.5 h-3.5" />
                  <span>Endless</span>
                </>
              ) : (
                <>
                  <Stairs className="w-3.5 h-3.5" weight="duotone" />
                  <span>{floorCount} Floors</span>
                </>
              )}
            </div>

            {keyCount > 0 && (
              <div className="flex items-center gap-1 ml-auto">
                <Key className={cn("w-3 h-3", keyStyle.text)} weight="fill" />
                <span className={cn("text-xs font-bold", keyStyle.text)} data-testid={`dungeon-key-owned-${dungeon.id}`}>
                  ×{keyCount}
                </span>
              </div>
            )}
          </div>
        </div>

        {allDrops.length > 0 && (
          <div className="space-y-1.5">
            <button
              onClick={() => setShowLoot(!showLoot)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-gray-100 transition-colors"
              data-testid={`dungeon-loot-toggle-${dungeon.id}`}
            >
              <Package className="w-3.5 h-3.5" weight="fill" />
              <span>Possible Loot ({allDrops.length})</span>
              <CaretRight className={cn("w-3 h-3 transition-transform", showLoot && "rotate-90")} />
            </button>

            <div className="grid grid-cols-1 gap-1">
              {visibleDrops.map((drop) => {
                const itemImg = getItemImage(drop.itemId);
                const itemName = translateItemName(drop.itemId, language);
                const rarityColor = getItemRarityColor(drop.itemId);
                const pct = calcDropPercent(drop.totalWeight, totalWeight);

                return (
                  <div
                    key={drop.itemId}
                    className="flex items-center gap-2 px-2 py-1 rounded bg-black/20 hover:bg-black/30 transition-colors"
                    data-testid={`dungeon-loot-item-${drop.itemId}`}
                  >
                    {itemImg ? (
                      <img src={itemImg} alt={itemName} className="w-5 h-5 object-contain rounded" />
                    ) : (
                      <div className="w-5 h-5 bg-gray-700 rounded flex items-center justify-center">
                        <Package className="w-3 h-3 text-gray-500" />
                      </div>
                    )}
                    <span className={cn("text-xs flex-1 truncate", rarityColor || "text-gray-300")}>
                      {itemName}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">{pct}</span>
                  </div>
                );
              })}
            </div>

            {allDrops.length > 4 && !showLoot && (
              <button
                onClick={() => setShowLoot(true)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors pl-5"
              >
                +{allDrops.length - 4} more...
              </button>
            )}
          </div>
        )}

        {partyExclusiveDrops.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Users className="w-3.5 h-3.5" weight="fill" />
              <span>{language === 'tr' ? 'Parti Özel Loot' : 'Party Exclusive Loot'}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-gray-500 cursor-help">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm">
                      {language === 'tr'
                        ? 'Bu itemler partide çok daha yüksek oranda düşer. Solo: %0.01-0.05, Parti: %1-5'
                        : 'These items drop at much higher rates in party mode. Solo: 0.01-0.05%, Party: 1-5%'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-1 gap-1">
              {partyExclusiveDrops.map((drop) => {
                const itemImg = getItemImage(drop.itemId);
                const itemName = translateItemName(drop.itemId, language);
                const rarityColor = getItemRarityColor(drop.itemId);
                return (
                  <div
                    key={drop.itemId}
                    className="flex items-center gap-2 px-2 py-1 rounded bg-emerald-900/20 hover:bg-emerald-900/30 border border-emerald-700/20 transition-colors"
                    data-testid={`dungeon-party-loot-${drop.itemId}`}
                  >
                    {itemImg ? (
                      <img src={itemImg} alt={itemName} className="w-5 h-5 object-contain rounded" />
                    ) : (
                      <div className="w-5 h-5 bg-emerald-900/30 rounded flex items-center justify-center">
                        <Star className="w-3 h-3 text-emerald-500" weight="fill" />
                      </div>
                    )}
                    <span className={cn("text-xs flex-1 truncate", rarityColor || "text-emerald-300")}>
                      {itemName}
                    </span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-700/40 text-emerald-400 bg-emerald-900/30">
                        <Users className="w-2.5 h-2.5 mr-0.5" />{drop.partyWeight}%
                      </Badge>
                      <span className="text-[9px] text-gray-600">|</span>
                      <span className="text-[9px] text-gray-500 font-mono">{drop.soloWeight}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {progress && (progress.highestFloor > 0 || progress.totalClears > 0) && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-amber-400">
              <Trophy className="w-3.5 h-3.5" weight="fill" />
              <span>Best: Floor {progress.highestFloor}</span>
            </div>
            {progress.totalClears > 0 && (
              <div className="flex items-center gap-1 text-green-400">
                <Crown className="w-3.5 h-3.5" weight="fill" />
                <span>{progress.totalClears} Clear{progress.totalClears !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        )}

        {mode === "solo" ? (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={canEnter ? "default" : "secondary"}
              disabled={!canEnter || isEntering}
              onClick={() => onEnterSolo(dungeon.id)}
              data-testid={`enter-dungeon-solo-${dungeon.id}`}
            >
              {isEntering ? (
                <span className="flex items-center gap-1.5">
                  <Spiral className="w-4 h-4 animate-spin" />
                  Entering...
                </span>
              ) : !canEnter ? (
                <span className="flex items-center gap-1.5">
                  <Key className="w-4 h-4" weight="fill" />
                  Need Key
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Sword className="w-4 h-4" weight="bold" />
                  Enter Solo
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              className="border-indigo-800/50 text-indigo-300 hover:bg-indigo-950/50"
              disabled={!canEnter || isEntering}
              onClick={() => onEnterOffline(dungeon.id)}
              data-testid={`enter-dungeon-offline-${dungeon.id}`}
            >
              <Moon className="w-4 h-4 mr-1" weight="fill" />
              Offline
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <UsersThree className="w-4 h-4" weight="fill" />
              <span>Up to {dungeon.config?.maxMembers || 5} members</span>
            </div>
            {!hasParty ? (
              <Button
                className="w-full"
                variant="default"
                disabled={isEntering || isCreatingParty}
                onClick={() => onCreateParty(dungeon.id)}
                data-testid={`enter-dungeon-party-${dungeon.id}`}
              >
                <span className="flex items-center gap-1.5">
                  <UsersThree className="w-4 h-4" weight="fill" />
                  Create Party
                </span>
              </Button>
            ) : (
              <Button
                className="w-full"
                variant={canEnter && allMembersReady ? "default" : "secondary"}
                disabled={!canEnter || isEntering || !allMembersReady}
                onClick={() => onStartParty(dungeon.id)}
                data-testid={`enter-dungeon-party-${dungeon.id}`}
              >
                {isEntering ? (
                  <span className="flex items-center gap-1.5">
                    <Spiral className="w-4 h-4 animate-spin" />
                    Starting...
                  </span>
                ) : !canEnter ? (
                  <span className="flex items-center gap-1.5">
                    <Key className="w-4 h-4" weight="fill" />
                    Need Key
                  </span>
                ) : !allMembersReady ? (
                  <span className="flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" />
                    Members Not Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Play className="w-4 h-4" weight="fill" />
                    Start Party Dungeon
                  </span>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function DungeonPage() {
  const { player, totalLevel, language, debugMode, activeTask, activeCombat, stopTask } = useGame();
  const { t } = useLanguage();
  const { isMobile } = useMobile();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enteringDungeonId, setEnteringDungeonId] = useState<string | null>(null);
  const [inviteSearch, setInviteSearch] = useState("");
  const [searchDebounce, setSearchDebounce] = useState("");
  const [showInviteCurrentDialog, setShowInviteCurrentDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("solo");

  const { data: myParty } = useQuery({
    queryKey: ["/api/v2/dungeon-party/my"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/v2/dungeon-party/my");
        return res.json();
      } catch {
        return { party: null };
      }
    },
    enabled: !!player,
  });

  const { data: activePartySessionData } = useQuery({
    queryKey: ["/api/v2/dungeon-party/session/active"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/v2/dungeon-party/session/active");
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: !!player && !!myParty?.party,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (activePartySessionData?.sessionId) {
      navigate("/party-dungeon-run");
      return;
    }
    if (myParty?.party && activeTab !== "party") {
      setActiveTab("party");
    }
  }, [myParty, activePartySessionData, navigate, activeTab]);

  const [pendingInviteMembers, setPendingInviteMembers] = useState<any[]>([]);
  const [showTaskWarning, setShowTaskWarning] = useState(false);
  const [pendingDungeonAction, setPendingDungeonAction] = useState<{ type: 'solo' | 'offline' | 'party'; dungeonId: string } | null>(null);
  const [showSocialPartyWarning, setShowSocialPartyWarning] = useState(false);

  const { data: dungeonsData, isLoading: dungeonsLoading, error: dungeonsError } = useQuery({
    queryKey: ["/api/v2/dungeons", `lang=${language}`],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/v2/dungeons?lang=${language}`);
        return res.json();
      } catch { return { dungeons: [] }; }
    },
    enabled: !!player,
  });

  const { data: activeSessionData } = useQuery({
    queryKey: ["/api/v2/dungeons/solo/active"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/v2/dungeons/solo/active");
        return res.json();
      } catch { return { session: null }; }
    },
    enabled: !!player,
    refetchInterval: 30000,
  });

  const { data: partyData } = useQuery({
    queryKey: ["/api/parties/current"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/parties/current");
        const data = await res.json();
        return data.party || null;
      } catch { return null; }
    },
    enabled: !!player,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });

  const handlePartyWsEvent = useCallback((event: any) => {
    if (event.type === 'party_started' && event.payload?.sessionId) {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
      navigate('/party-dungeon-run');
    }
    if (event.type === 'party_disbanded' || (event.type === 'party_member_kicked' && event.payload?.playerId === player?.id)) {
      toast({ title: "Party", description: event.type === 'party_disbanded' ? "The party has been disbanded." : "You have been removed from the party." });
    }
  }, [player?.id, navigate, toast, queryClient]);

  usePartyWebSocket({
    playerId: player?.id || null,
    partyId: partyData?.id || null,
    enabled: !!player,
    onEvent: handlePartyWsEvent,
  });

  const { data: searchResults } = useQuery({
    queryKey: ["/api/players/search", searchDebounce],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/players/search?username=${encodeURIComponent(searchDebounce)}`);
        return res.json();
      } catch { return { players: [] }; }
    },
    enabled: !!searchDebounce && searchDebounce.length >= 2 && !!(partyData?.id),
  });

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(inviteSearch), 300);
    return () => clearTimeout(timer);
  }, [inviteSearch]);

  const readyMutation = useMutation({
    mutationFn: async (isReady: boolean) => {
      const res = await apiRequest("PATCH", `/api/parties/${partyData?.id}/ready`, { isReady });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { sentInvites, inviteMutation: partyInviteMutation, cancelInviteMutation } = usePartyInvites(partyData?.id);

  const startSoloMutation = useMutation({
    mutationFn: async ({ dungeonId, goOffline }: { dungeonId: string; goOffline: boolean }) => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/v2/dungeons/solo/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ dungeonId, goOffline }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to start dungeon" }));
        throw new Error(err.error || "Failed to start dungeon");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
      trackDungeonEntered();
      trackDungeonKeyUsed();
      if (!variables.goOffline) {
        navigate("/dungeon-run");
      } else {
        toast({
          title: "Offline Dungeon Started",
          description: "Your dungeon run is progressing while you're away!",
        });
      }
      setEnteringDungeonId(null);
    },
    onError: (error: Error) => {
      toast({
        title: t("error") || "Error",
        description: error.message,
        variant: "destructive",
      });
      setEnteringDungeonId(null);
    },
  });

  const startPartyMutation = useMutation({
    mutationFn: async ({ dungeonId, partyId }: { dungeonId: string; partyId: string }) => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/v2/dungeons/party/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ dungeonId, partyId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to start party dungeon" }));
        throw new Error(err.error || "Failed to start party dungeon");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons"] });
      trackDungeonEntered();
      trackDungeonKeyUsed();
      navigate("/party-dungeon-run");
      setEnteringDungeonId(null);
    },
    onError: (error: Error) => {
      toast({
        title: t("error") || "Error",
        description: error.message,
        variant: "destructive",
      });
      setEnteringDungeonId(null);
    },
  });

  const createPartyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/parties", { description: null, name: null, partyType: "dungeon" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      toast({ title: "Dungeon Party Created!" });
    },
    onError: (error: Error) => {
      toast({
        title: t("error") || "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const leavePartyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/parties/${partyData?.id}/leave`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
    },
  });

  const [selectedDungeonId, setSelectedDungeonId] = useState<string | null>(null);

  const handleCreateParty = (dungeonId: string) => {
    setSelectedDungeonId(dungeonId);
    if (hasParty) {
      if (partyData?.partyType === 'social') {
        setShowSocialPartyWarning(true);
      } else {
        navigate(`/dungeon-party?dungeonId=${dungeonId}`);
      }
    } else {
      navigate(`/dungeon-party?dungeonId=${dungeonId}`);
    }
  };

  const handleConfirmLeaveSocialParty = async () => {
    setShowSocialPartyWarning(false);
    try {
      await apiRequest("POST", `/api/parties/${partyData?.id}/leave`);
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      if (selectedDungeonId) {
        navigate(`/dungeon-party?dungeonId=${selectedDungeonId}`);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCreateWithInvites = async () => {
    setShowInviteCurrentDialog(false);
    const oldMembers = partyMembers.filter((m: any) => m.playerId !== player?.id);
    setPendingInviteMembers(oldMembers);
    try {
      await apiRequest("POST", `/api/parties/${partyData?.id}/leave`);
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      const res = await apiRequest("POST", "/api/parties", { description: null, name: null, partyType: "dungeon" });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      toast({ title: "Dungeon Party Created!" });
      if (data.party?.id && oldMembers.length > 0) {
        for (const member of oldMembers) {
          try {
            await apiRequest("POST", `/api/parties/${data.party.id}/invite`, { inviteeId: member.playerId });
          } catch (e) {
            console.error('Failed to invite member:', member.username);
          }
        }
        toast({ title: "Invites Sent", description: `Invited ${oldMembers.length} former party member(s).` });
      }
      setPendingInviteMembers([]);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setPendingInviteMembers([]);
    }
  };

  const handleCreateWithoutInvites = async () => {
    setShowInviteCurrentDialog(false);
    try {
      await apiRequest("POST", `/api/parties/${partyData?.id}/leave`);
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      const res = await apiRequest("POST", "/api/parties", { description: null, name: null, partyType: "dungeon" });
      await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      toast({ title: "Dungeon Party Created!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const checkAndExecuteDungeonAction = (type: 'solo' | 'offline' | 'party', dungeonId: string) => {
    if (activeTask || activeCombat) {
      setPendingDungeonAction({ type, dungeonId });
      setShowTaskWarning(true);
      return;
    }
    executeDungeonAction(type, dungeonId);
  };

  const executeDungeonAction = (type: 'solo' | 'offline' | 'party', dungeonId: string) => {
    if (type === 'solo') {
      setEnteringDungeonId(dungeonId);
      startSoloMutation.mutate({ dungeonId, goOffline: false });
    } else if (type === 'offline') {
      setEnteringDungeonId(dungeonId);
      startSoloMutation.mutate({ dungeonId, goOffline: true });
    } else if (type === 'party') {
      if (!partyData?.id) return;
      setEnteringDungeonId(dungeonId);
      startPartyMutation.mutate({ dungeonId, partyId: partyData.id });
    }
  };

  const handleConfirmDungeonAction = () => {
    if (pendingDungeonAction) {
      stopTask();
      executeDungeonAction(pendingDungeonAction.type, pendingDungeonAction.dungeonId);
    }
    setShowTaskWarning(false);
    setPendingDungeonAction(null);
  };

  const handleEnterSolo = (dungeonId: string) => {
    checkAndExecuteDungeonAction('solo', dungeonId);
  };

  const handleEnterOffline = (dungeonId: string) => {
    checkAndExecuteDungeonAction('offline', dungeonId);
  };

  const handleStartParty = (dungeonId: string) => {
    checkAndExecuteDungeonAction('party', dungeonId);
  };

  const dungeons: DungeonData[] = (dungeonsData?.dungeons || []).sort(
    (a: DungeonData, b: DungeonData) => a.tier - b.tier
  );

  const activeSession: ActiveSession | null = (activeSessionData?.session && ['active', 'voting'].includes(activeSessionData.session.status)) ? activeSessionData.session : null;
  const hasParty = !!(partyData?.id);
  const partyMembers: { playerId: number; username: string; role: string; isReady: number }[] = partyData?.members || [];
  const isLeader = !!(player && partyData?.leaderId && player.id === partyData.leaderId);
  const allMembersReady = hasParty && partyMembers.length > 0 && partyMembers.every((m: any) => m.isReady === 1);
  const currentMember = partyMembers.find((m: any) => String(m.playerId) === String(player?.id));
  const currentPlayerReady = currentMember?.isReady === 1;

  const filteredSearchResults = (searchResults?.players || []).filter(
    (p: any) => !partyMembers.some((m: any) => m.playerId === p.playerId)
  );

  const allKeyTypes = ["bronze", "silver", "gold", "void"];
  const keyCountMap = new Map<string, number>();
  for (const d of dungeons) {
    if (!keyCountMap.has(d.keyType)) {
      keyCountMap.set(d.keyType, d.playerKeyCount);
    }
  }

  if (dungeonsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]" data-testid="dungeons-loading">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spiral className="w-4 h-4 animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  if (dungeonsError) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]" data-testid="dungeons-error">
        <div className="text-red-400 text-sm flex items-center gap-2">
          <Warning className="w-4 h-4" weight="fill" />
          {t("failedToLoadDungeons") || "Failed to load dungeons"}
        </div>
      </div>
    );
  }

  // Check if player is a tester
  if (player?.isTester !== 1) {
    const langKey = language as keyof typeof TESTER_GATE_TITLES;
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen p-4" data-testid="dungeon-tester-gate">
        <Card className="w-full max-w-md bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)] border-purple-900/50">
          <CardContent className="flex flex-col items-center justify-center py-12 px-6">
            <div className="mb-6 p-4 bg-purple-950/40 rounded-full">
              <Warning className="w-12 h-12 text-purple-400" weight="fill" />
            </div>
            <h2 className="text-2xl font-bold text-gray-100 mb-3 text-center">
              {TESTER_GATE_TITLES[langKey] || TESTER_GATE_TITLES.en}
            </h2>
            <p className="text-gray-400 text-center mb-6 text-sm leading-relaxed">
              {TESTER_GATE_DESCRIPTIONS[langKey] || TESTER_GATE_DESCRIPTIONS.en}
            </p>
            <a
              href="https://discord.gg/idlethrone"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="discord-join-btn"
            >
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2">
                <span className="flex items-center gap-2">
                  <Spiral className="w-4 h-4" />
                  {DISCORD_BUTTON_LABELS[langKey] || DISCORD_BUTTON_LABELS.en}
                </span>
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4 p-4 max-w-5xl mx-auto", isMobile && "pb-24")} data-testid="dungeon-page">
      {player?.isTester === 1 && (
        <div
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-950/40 to-purple-950/40 border border-indigo-700/50 text-xs text-gray-200"
          data-testid="dungeon-tester-banner"
        >
          <Star className="w-4 h-4 text-indigo-400" weight="fill" />
          <span>
            {(TESTER_BANNER_TEXTS[language as keyof typeof TESTER_BANNER_TEXTS] || TESTER_BANNER_TEXTS.en)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)] rounded-lg border border-gray-700/50">
            <Skull className="w-6 h-6 text-gray-300" weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground" data-testid="dungeon-page-title">
              Dungeons
            </h1>
            <p className="text-sm text-muted-foreground">Dangerous depths await...</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" data-testid="dungeon-key-summary">
          {allKeyTypes.map((keyType) => {
            const count = keyCountMap.get(keyType) ?? 0;
            const style = getKeyStyle(keyType);
            return (
              <div
                key={keyType}
                className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg border", style.bg, style.border)}
                data-testid={`key-count-${keyType}`}
              >
                <Key className={cn("w-4 h-4", style.text)} weight="fill" />
                <span className={cn("text-sm font-medium", style.text)}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {activeSession && (
        <div
          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[radial-gradient(ellipse_at_center,_#1a2a1a_0%,_#162a16_40%,_#0d1a0d_100%)] border border-green-800/50"
          data-testid="active-dungeon-banner"
        >
          <div className="flex items-center gap-2">
            <Lightning className="w-5 h-5 text-green-400" weight="fill" />
            <div>
              <p className="text-sm font-semibold text-green-300">Active Dungeon Run</p>
              <p className="text-xs text-green-400/70">Floor {activeSession.currentFloor || 1}</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/dungeon-run")}
            className="bg-green-700 hover:bg-green-600 text-white"
            data-testid="continue-dungeon-btn"
          >
            <CaretRight className="w-4 h-4 mr-1" weight="bold" />
            Continue
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-2 bg-black/30 border border-gray-700/40" data-testid="dungeon-mode-tabs">
          <TabsTrigger
            value="solo"
            className="data-[state=active]:bg-gray-800 data-[state=active]:text-gray-100"
            data-testid="tab-solo"
          >
            <Sword className="w-4 h-4 mr-1.5" weight="bold" />
            Solo Mode
          </TabsTrigger>
          <TabsTrigger
            value="party"
            className="data-[state=active]:bg-gray-800 data-[state=active]:text-gray-100"
            data-testid="tab-party"
          >
            <UsersThree className="w-4 h-4 mr-1.5" weight="fill" />
            Party Mode
          </TabsTrigger>
        </TabsList>

        <TabsContent value="solo" className="mt-4">
          {dungeons.length === 0 ? (
            <Card className="bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)] border-gray-700/30">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Skull className="w-12 h-12 text-gray-600 mb-3" weight="duotone" />
                <p className="text-gray-500 text-center">No dungeons available yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
              {dungeons.map((dungeon) => (
                <DungeonCard
                  key={dungeon.id}
                  dungeon={dungeon}
                  totalLevel={totalLevel}
                  language={language as Language}
                  mode="solo"
                  onEnterSolo={handleEnterSolo}
                  onEnterOffline={handleEnterOffline}
                  onStartParty={handleStartParty}
                  onCreateParty={handleCreateParty}
                  isEntering={enteringDungeonId === dungeon.id}
                  isCreatingParty={createPartyMutation.isPending}
                  hasParty={hasParty}
                  debugMode={debugMode}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="party" className="mt-4">
          <div
            className="mb-4 rounded-xl border border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)] overflow-hidden"
            data-testid="party-panel"
          >
            <div className="p-4 space-y-4">
              {!hasParty ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="flex items-center gap-2">
                    <UsersThree className="w-5 h-5 text-indigo-400" weight="fill" />
                    <h3 className="text-sm font-bold text-gray-100">No Party</h3>
                  </div>
                  <p className="text-xs text-gray-400 text-center">Select a dungeon below and tap "Create Party" to start.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-indigo-400" weight="fill" />
                      <h3 className="text-sm font-bold text-gray-100">Party Members</h3>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          allMembersReady
                            ? "border-green-700/50 text-green-400 bg-green-950/30"
                            : "border-yellow-700/50 text-yellow-400 bg-yellow-950/30"
                        )}
                        data-testid="party-ready-status"
                      >
                        {allMembersReady ? "All Ready" : "Not Ready"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant={currentPlayerReady ? "default" : "outline"}
                      className={cn(
                        "h-7 text-xs",
                        currentPlayerReady
                          ? "bg-green-700 hover:bg-green-600 text-white"
                          : "border-gray-600 text-gray-300 hover:bg-gray-800"
                      )}
                      onClick={() => readyMutation.mutate(!currentPlayerReady)}
                      disabled={readyMutation.isPending}
                      data-testid="toggle-ready-btn"
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" weight={currentPlayerReady ? "fill" : "regular"} />
                      {currentPlayerReady ? "Ready" : "Not Ready"}
                    </Button>
                  </div>

                  <div className="space-y-1.5" data-testid="party-member-list">
                    {partyMembers.map((member: any) => (
                      <div
                        key={member.playerId}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/20 hover:bg-black/30 transition-colors"
                        data-testid={`party-member-${member.playerId}`}
                      >
                        <div className="flex items-center gap-2">
                          {member.playerId === partyData?.leaderId && (
                            <Crown className="w-3.5 h-3.5 text-amber-400" weight="fill" />
                          )}
                          <span className="text-sm text-gray-200">{member.username}</span>
                          {member.playerId === player?.id && (
                            <span className="text-[10px] text-gray-500">(You)</span>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            member.isReady === 1
                              ? "border-green-700/50 text-green-400 bg-green-950/30"
                              : "border-red-700/50 text-red-400 bg-red-950/30"
                          )}
                          data-testid={`member-ready-badge-${member.playerId}`}
                        >
                          {member.isReady === 1 ? (
                            <><CheckCircle className="w-3 h-3 mr-0.5" weight="fill" /> Ready</>
                          ) : (
                            <><XCircle className="w-3 h-3 mr-0.5" weight="fill" /> Not Ready</>
                          )}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {isLeader && (
                    <div className="space-y-2 pt-2 border-t border-gray-700/30">
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-semibold text-gray-300">Invite Player</span>
                      </div>
                      <div className="relative">
                        <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                        <input
                          type="text"
                          placeholder="Search by username..."
                          value={inviteSearch}
                          onChange={(e) => setInviteSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 text-sm bg-black/30 border border-gray-700/50 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-600/50 focus:ring-1 focus:ring-indigo-600/30"
                          data-testid="invite-search-input"
                        />
                      </div>
                      {inviteSearch.length >= 2 && filteredSearchResults.length > 0 && (
                        <div className="space-y-1 max-h-32 overflow-y-auto" data-testid="invite-search-results">
                          {filteredSearchResults.map((p: any) => (
                            <div
                              key={p.playerId}
                              className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors"
                              data-testid={`invite-result-${p.playerId}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-200">{p.username}</span>
                                {p.isOnline ? (
                                  <span className="w-2 h-2 rounded-full bg-green-500" />
                                ) : (
                                  <span className="w-2 h-2 rounded-full bg-gray-600" />
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] border-indigo-700/50 text-indigo-300 hover:bg-indigo-950/50"
                                onClick={() => { partyInviteMutation.mutate(p.playerId); setInviteSearch(""); }}
                                disabled={partyInviteMutation.isPending}
                                data-testid={`invite-btn-${p.playerId}`}
                              >
                                <UserPlus className="w-3 h-3 mr-0.5" />
                                Invite
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {inviteSearch.length >= 2 && filteredSearchResults.length === 0 && searchDebounce === inviteSearch && (
                        <p className="text-xs text-gray-500 text-center py-2" data-testid="invite-no-results">No players found</p>
                      )}

                      {sentInvites.length > 0 && (
                        <div className="space-y-1 pt-2 border-t border-gray-700/30">
                          <div className="flex items-center gap-1.5">
                            <PaperPlaneTilt className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-[10px] font-semibold text-gray-400">Pending Invites</span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-700/40 text-amber-400">{sentInvites.length}</Badge>
                          </div>
                          {sentInvites.map((inv) => (
                            <div
                              key={inv.id}
                              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/20"
                              data-testid={`sent-invite-${inv.id}`}
                            >
                              <span className="text-xs text-gray-300">{inv.invitee.username}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0 text-red-400 hover:text-red-300"
                                onClick={() => cancelInviteMutation.mutate(inv.id)}
                                disabled={cancelInviteMutation.isPending}
                                data-testid={`cancel-invite-${inv.id}`}
                              >
                                <XCircle className="w-3.5 h-3.5" weight="fill" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {dungeons.length === 0 ? (
            <Card className="bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)] border-gray-700/30">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Skull className="w-12 h-12 text-gray-600 mb-3" weight="duotone" />
                <p className="text-gray-500 text-center">No dungeons available yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
              {dungeons.map((dungeon) => (
                <DungeonCard
                  key={dungeon.id}
                  dungeon={dungeon}
                  totalLevel={totalLevel}
                  language={language as Language}
                  mode="party"
                  onEnterSolo={handleEnterSolo}
                  onEnterOffline={handleEnterOffline}
                  onStartParty={handleStartParty}
                  onCreateParty={handleCreateParty}
                  isEntering={enteringDungeonId === dungeon.id}
                  isCreatingParty={createPartyMutation.isPending}
                  hasParty={hasParty}
                  debugMode={debugMode}
                  allMembersReady={allMembersReady}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showTaskWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-full max-w-sm mx-4 border-amber-600/50 bg-[radial-gradient(ellipse_at_center,_#2a2215_0%,_#1f1a10_40%,_#0d0d0a_100%)]">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Warning className="w-5 h-5 text-amber-400" weight="fill" />
                <span className="font-bold text-amber-300">Active Task Warning</span>
              </div>
              <p className="text-sm text-gray-300">
                You currently have an active task or combat. Starting a dungeon will cancel your current activity. Continue?
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-white font-bold"
                  onClick={handleConfirmDungeonAction}
                  data-testid="confirm-dungeon-start"
                >
                  Continue
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-gray-600"
                  onClick={() => { setShowTaskWarning(false); setPendingDungeonAction(null); }}
                  data-testid="cancel-dungeon-start"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showSocialPartyWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSocialPartyWarning(false)}>
          <div className="bg-[#1a1a2e] border border-amber-700/50 rounded-xl p-6 max-w-sm mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Warning className="w-5 h-5 text-amber-400" weight="fill" />
              <h3 className="text-lg font-bold text-gray-100" data-testid="social-party-warning-title">Leave Social Party?</h3>
            </div>
            <p className="text-sm text-gray-400">
              You're in a social party. Creating a dungeon party will remove you from it. Continue?
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-white font-bold"
                onClick={handleConfirmLeaveSocialParty}
                data-testid="confirm-leave-social-btn"
              >
                Continue
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-gray-600"
                onClick={() => setShowSocialPartyWarning(false)}
                data-testid="cancel-leave-social-btn"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {showInviteCurrentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowInviteCurrentDialog(false)}>
          <div className="bg-[#1a1a2e] border border-gray-700/50 rounded-xl p-6 max-w-sm mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <UsersThree className="w-5 h-5 text-indigo-400" weight="fill" />
              <h3 className="text-lg font-bold text-gray-100">Create New Party</h3>
            </div>
            <p className="text-sm text-gray-400">
              You are already in a party with {partyMembers.length} member(s). Would you like to invite your current party members to the new party?
            </p>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full bg-indigo-700 hover:bg-indigo-600 text-white"
                onClick={handleCreateWithInvites}
                data-testid="invite-current-yes-btn"
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                Yes, Invite Them
              </Button>
              <Button
                variant="outline"
                className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
                onClick={handleCreateWithoutInvites}
                data-testid="invite-current-no-btn"
              >
                No, Just Create New
              </Button>
              <Button
                variant="ghost"
                className="w-full text-gray-500 hover:text-gray-300"
                onClick={() => setShowInviteCurrentDialog(false)}
                data-testid="invite-current-cancel-btn"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
