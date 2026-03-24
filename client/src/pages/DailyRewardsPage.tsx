import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { Gift, Star, Check, Clock, Trophy, Sword, Axe } from "@phosphor-icons/react";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMobile } from "@/hooks/useMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { trackDailyLoginClaimed, trackDailyQuestCompleted } from "@/hooks/useAchievementTracker";
import { getItemImage, ITEM_PLACEHOLDER } from "@/lib/itemImages";
import { Progress } from "@/components/ui/progress";

interface DailyReward {
  id: string;
  day: number;
  rewards: Array<{ itemId: string; quantity: number }>;
  is_bonus: number;
}

interface DailyLoginStatus {
  rewards: DailyReward[];
  currentDay: number;
  lastClaimDate: string | null;
  totalDaysClaimed: number;
  streakCount: number;
  canClaim: boolean;
}

interface DailyQuest {
  id: string;
  template_id: string;
  current_progress: number;
  target_quantity: number;
  is_accepted: number;
  is_completed: number;
  is_claimed: number;
  quest_type: string;
  target_type: string | null;
  reward_items: Array<{ itemId: string; quantity: number }>;
  reward_gold: number;
  difficulty: string;
  name_translations: Record<string, string>;
  description_translations: Record<string, string>;
}

function useCountdown() {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
      const diff = nextMidnight.getTime() - now.getTime();
      setTimeLeft({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return timeLeft;
}

export default function DailyRewardsPage() {
  const { player, refreshPlayer, setActiveDailyQuests } = useGame();
  const { language } = useLanguage();
  const { toast } = useToast();
  const { isMobile } = useMobile();
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const [claimPopupOpen, setClaimPopupOpen] = useState(false);
  const [claimedReward, setClaimedReward] = useState<DailyReward | null>(null);
  const [animatePopup, setAnimatePopup] = useState(false);
  const countdown = useCountdown();

  const { data: loginStatus, isLoading: loginLoading } = useQuery<DailyLoginStatus>({
    queryKey: ['/api/daily-login'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/daily-login');
      return res.json();
    },
    enabled: !!player,
  });

  const { data: questsData, isLoading: questsLoading } = useQuery<{ quests: DailyQuest[] }>({
    queryKey: ['/api/daily-quests'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/daily-quests');
      return res.json();
    },
    enabled: !!player,
  });

  useEffect(() => {
    if (questsData?.quests) {
      const activeAccepted = questsData.quests
        .filter(q => q.is_accepted === 1 && q.is_claimed !== 1)
        .map(q => ({ questType: q.quest_type, targetType: q.target_type }));
      setActiveDailyQuests(activeAccepted);
    }
  }, [questsData, setActiveDailyQuests]);

  const claimLoginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/daily-login/claim');
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-login'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-login-status-nav'] });
      refreshPlayer();
      trackDailyLoginClaimed();
      const reward = loginStatus?.rewards?.find(r => r.day === data.claimedDay);
      if (reward) {
        setClaimedReward(reward);
        setClaimPopupOpen(true);
        setTimeout(() => setAnimatePopup(true), 100);
      }
    },
    onError: () => {
      toast({
        title: t(language, 'error'),
        description: "Failed to claim reward",
        variant: "destructive",
      });
    },
  });

  const acceptQuestMutation = useMutation({
    mutationFn: async (questId: string) => {
      const res = await apiRequest('POST', `/api/daily-quests/${questId}/accept`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-quests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-login-status-nav'] });
      toast({
        title: t(language, 'questAccepted' as any) || "Quest Started!",
        duration: 3000,
      });
    },
  });

  const claimQuestMutation = useMutation({
    mutationFn: async (questId: string) => {
      const res = await apiRequest('POST', `/api/daily-quests/${questId}/claim`);
      return res.json();
    },
    onSuccess: () => {
      trackDailyQuestCompleted();
      queryClient.invalidateQueries({ queryKey: ['/api/daily-quests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-login-status-nav'] });
      refreshPlayer();
      toast({
        title: t(language, 'questCompleted' as any) || "Quest Completed!",
        duration: 3000,
      });
    },
  });

  const handleClaimLogin = async () => {
    if (!loginStatus?.canClaim) return;
    setClaiming(true);
    try {
      await claimLoginMutation.mutateAsync();
    } finally {
      setClaiming(false);
    }
  };

  const handleClosePopup = useCallback(() => {
    setAnimatePopup(false);
    setClaimPopupOpen(false);
    setClaimedReward(null);
  }, []);

  const getQuestIcon = (questType: string) => {
    switch (questType) {
      case 'kill_monsters': return <Sword className="w-5 h-5 text-red-400" />;
      case 'gather_resources': return <Axe className="w-5 h-5 text-yellow-400" />;
      case 'craft_items': return <Trophy className="w-5 h-5 text-orange-400" />;
      default: return <Star className="w-5 h-5 text-purple-400" />;
    }
  };

  const getQuestName = (quest: DailyQuest) => {
    if (quest.name_translations && quest.name_translations[language]) {
      return quest.name_translations[language];
    }
    return quest.name_translations?.en || quest.template_id;
  };

  const getQuestDescription = (quest: DailyQuest) => {
    if (quest.description_translations && quest.description_translations[language]) {
      return quest.description_translations[language];
    }
    return quest.description_translations?.en || "";
  };

  if (!player) return null;

  return (
    <div className={cn("container mx-auto p-2 sm:p-4 space-y-4 sm:space-y-6", isMobile && "pb-24")}>
      <style>{`
        @keyframes rewardPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.4); }
          50% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.7); }
        }
        @keyframes rewardReveal {
          0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(3deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .reward-pulse { animation: rewardPulse 2s ease-in-out infinite; }
        .reward-reveal { animation: rewardReveal 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .reward-shimmer {
          background: linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%);
          background-size: 200% 100%;
          animation: shimmer 3s infinite;
        }
      `}</style>

      <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-amber-500/30">
        <CardHeader className="pb-2 px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-amber-400 text-base sm:text-lg">
            <Gift className="w-5 h-5 sm:w-6 sm:h-6" />
            {t(language, 'dailyRewards')}
          </CardTitle>
          {loginStatus && (
            <div className="text-xs sm:text-sm text-slate-400">
              {t(language, 'day')} {loginStatus.currentDay}/15 • {t(language, 'streakLabel')}: {loginStatus.streakCount}
            </div>
          )}
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {loginLoading ? (
            <div className="text-center py-8 text-slate-400">{t(language, 'loading')}</div>
          ) : loginStatus ? (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-2.5 mb-4 justify-items-center">
                {(loginStatus.rewards || []).map((reward) => {
                  const isCurrent = reward.day === loginStatus.currentDay;
                  const isClaimed = reward.day < loginStatus.currentDay;
                  const isLocked = isCurrent && !loginStatus.canClaim;
                  const isBonus = reward.is_bonus === 1;
                  const mainItem = (reward.rewards || [])[0];

                  return (
                    <div
                      key={reward.day}
                      data-testid={`reward-day-${reward.day}`}
                      className={cn(
                        "relative rounded-lg border overflow-hidden transition-all cursor-default select-none",
                        "w-[80px] h-[80px] sm:w-[100px] sm:h-[100px]",
                        isClaimed && "border-green-500/40",
                        isLocked && "border-amber-500/30",
                        isCurrent && loginStatus.canClaim && "border-amber-500 reward-pulse",
                        !isClaimed && !isLocked && !isCurrent && "border-slate-600/60",
                        isBonus && !isCurrent && "border-purple-500/70 border-2",
                        isBonus && isCurrent && loginStatus.canClaim && "border-purple-500/70 border-2 reward-pulse"
                      )}
                    >
                      <div className={cn(
                        "absolute inset-0 flex items-center justify-center p-2",
                        isClaimed ? "bg-slate-900/40" : isLocked ? "bg-slate-800/70" : "bg-slate-800/60"
                      )}>
                        {mainItem && (
                          <img 
                            src={getItemImage(mainItem.itemId)} 
                            alt={mainItem.itemId}
                            className={cn(
                              "w-[80%] h-[80%] object-contain drop-shadow-lg",
                              isClaimed && "opacity-50 grayscale-[30%]"
                            )}
                            onError={(e) => { e.currentTarget.src = ITEM_PLACEHOLDER; }}
                          />
                        )}
                      </div>

                      <div className={cn(
                        "absolute top-0 left-0 right-0 text-center py-0.5 text-[9px] sm:text-[10px] font-semibold",
                        "bg-gradient-to-b from-black/70 to-transparent",
                        isClaimed ? "text-green-300/80" : isLocked ? "text-amber-300/60" : isCurrent && loginStatus.canClaim ? "text-amber-300" : "text-slate-300/80"
                      )}>
                        {t(language, 'day')} {reward.day}
                      </div>

                      {isClaimed && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="bg-green-500/90 rounded-full p-1">
                            <Check className="w-4 h-4 sm:w-5 sm:h-5 text-white" weight="bold" />
                          </div>
                        </div>
                      )}

                      {isLocked && (
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <div className="bg-amber-500/20 rounded-full p-1.5">
                            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400/70" weight="bold" />
                          </div>
                        </div>
                      )}

                      {isBonus && (
                        <div className="absolute bottom-0.5 left-0.5 sm:bottom-1 sm:left-1">
                          <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 drop-shadow-lg" weight="fill" />
                        </div>
                      )}

                      {isCurrent && loginStatus.canClaim && (
                        <div className="absolute inset-0 reward-shimmer pointer-events-none" />
                      )}
                    </div>
                  );
                })}
              </div>

              {loginStatus.canClaim && (
                <Button
                  onClick={handleClaimLogin}
                  disabled={claiming || claimLoginMutation.isPending}
                  className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400"
                  data-testid="claim-daily-reward-btn"
                >
                  <Gift className="w-5 h-5 mr-2" />
                  {claiming ? t(language, 'claimingReward') : t(language, 'claimDay').replace('{day}', String(loginStatus.currentDay))}
                </Button>
              )}
              {!loginStatus.canClaim && (
                <div className="text-center py-2 text-slate-400 flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{t(language, 'nextRewardIn')} {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}</span>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={claimPopupOpen} onOpenChange={(open) => { if (!open) handleClosePopup(); }}>
        <DialogContent className="bg-gradient-to-br from-slate-900 to-slate-800 border-amber-500/50 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-amber-400 text-center text-lg flex items-center justify-center gap-2">
              <Gift className="w-5 h-5" />
              {t(language, 'rewardClaimed')}
            </DialogTitle>
          </DialogHeader>
          {claimedReward && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="text-sm text-slate-400">
                {t(language, 'day')} {claimedReward.day}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4">
                {(claimedReward.rewards || []).map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-lg bg-slate-800/80 border border-amber-500/30",
                      animatePopup && "reward-reveal"
                    )}
                    style={{ animationDelay: `${idx * 150}ms` }}
                  >
                    <img
                      src={getItemImage(item.itemId)}
                      alt={item.itemId}
                      className="w-14 h-14 sm:w-16 sm:h-16 object-contain drop-shadow-lg"
                      onError={(e) => { e.currentTarget.src = ITEM_PLACEHOLDER; }}
                    />
                    <span className="text-amber-300 text-sm font-semibold">x{item.quantity}</span>
                  </div>
                ))}
              </div>
              <Button
                onClick={handleClosePopup}
                className="mt-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400"
                data-testid="close-claim-popup-btn"
              >
                {t(language, 'confirm')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-purple-500/30">
        <CardHeader className="pb-2 px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-purple-400 text-base sm:text-lg">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
            Daily Quests
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {questsLoading ? (
            <div className="text-center py-8 text-slate-400">Loading...</div>
          ) : questsData?.quests && questsData.quests.length > 0 ? (
            <div className="space-y-2 sm:space-y-3">
              {questsData.quests.map((quest) => {
                const progress = Math.min(100, (quest.current_progress / quest.target_quantity) * 100);
                const isAccepted = quest.is_accepted === 1;
                const isComplete = quest.is_completed === 1;
                const isClaimed = quest.is_claimed === 1;

                return (
                  <div
                    key={quest.id}
                    data-testid={`quest-${quest.template_id}`}
                    className={cn(
                      "p-2 sm:p-3 rounded-lg border transition-all",
                      isClaimed && "bg-green-900/20 border-green-500/30 opacity-60",
                      isComplete && !isClaimed && "bg-purple-900/30 border-purple-500/50",
                      isAccepted && !isComplete && "bg-slate-800/50 border-amber-500/30",
                      !isAccepted && !isComplete && !isClaimed && "bg-slate-800/50 border-slate-700"
                    )}
                  >
                    <div className="flex items-start justify-between mb-1.5 sm:mb-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                        {getQuestIcon(quest.quest_type)}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-200 text-sm sm:text-base truncate">{getQuestName(quest)}</div>
                          <div className="text-[10px] sm:text-xs text-slate-400 truncate">{getQuestDescription(quest)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-1 flex-shrink-0">
                        {isAccepted && !isComplete && !isClaimed && (
                          <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            {t(language, 'active' as any) || 'Active'}
                          </span>
                        )}
                        <div className={cn(
                          "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded",
                          quest.difficulty === 'easy' && "bg-green-500/20 text-green-400",
                          quest.difficulty === 'normal' && "bg-blue-500/20 text-blue-400",
                          quest.difficulty === 'hard' && "bg-red-500/20 text-red-400"
                        )}>
                          {quest.difficulty}
                        </div>
                      </div>
                    </div>

                    {isAccepted && (
                      <div className="mb-1.5 sm:mb-2">
                        <div className="flex justify-between text-[10px] sm:text-xs text-slate-400 mb-0.5 sm:mb-1">
                          <span>{t(language, 'progress' as any) || 'Progress'}</span>
                          <span>{quest.current_progress}/{quest.target_quantity}</span>
                        </div>
                        <Progress value={progress} className="h-1.5 sm:h-2" />
                      </div>
                    )}

                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs flex-wrap">
                        <span className="text-slate-400">{t(language, 'rewards' as any) || 'Rewards'}:</span>
                        {(quest.reward_items || []).map((item, idx) => (
                          <div key={idx} className="flex items-center gap-0.5">
                            <img 
                              src={getItemImage(item.itemId)} 
                              alt={item.itemId} 
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                              onError={(e) => { e.currentTarget.src = ITEM_PLACEHOLDER; }}
                            />
                            <span className="text-slate-300">x{item.quantity}</span>
                          </div>
                        ))}
                        {quest.reward_gold > 0 && (
                          <span className="text-yellow-400">{quest.reward_gold}g</span>
                        )}
                      </div>

                      {!isAccepted && !isClaimed && (
                        <Button
                          size="sm"
                          onClick={() => acceptQuestMutation.mutate(quest.id)}
                          disabled={acceptQuestMutation.isPending}
                          className="bg-amber-600 hover:bg-amber-500 text-xs px-2 py-1 h-auto"
                          data-testid={`accept-quest-${quest.template_id}`}
                        >
                          {t(language, 'startQuest' as any) || 'Start Quest'}
                        </Button>
                      )}
                      {isAccepted && isComplete && !isClaimed && (
                        <Button
                          size="sm"
                          onClick={() => claimQuestMutation.mutate(quest.id)}
                          disabled={claimQuestMutation.isPending}
                          className="bg-purple-600 hover:bg-purple-500 text-xs px-2 py-1 h-auto"
                          data-testid={`claim-quest-${quest.template_id}`}
                        >
                          {t(language, 'claim' as any) || 'Claim'}
                        </Button>
                      )}
                      {isClaimed && (
                        <span className="text-[10px] sm:text-xs text-green-400 flex items-center gap-0.5">
                          <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                          {t(language, 'claimed' as any) || 'Claimed'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              No quests available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
