import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGame } from "@/context/GameContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { translateItemName, parseItemWithRarity, getItemById } from "@/lib/items";
import { RARITY_COLORS } from "@/lib/items-types";
import { useToast } from "@/hooks/use-toast";
import { Sword, Sparkle, Warning, Lightning, Drop, Skull, Plus, ArrowUp, Shield, Target, Heart, Eye, CrosshairSimple, ShieldCheck } from "@phosphor-icons/react";
import { getItemImage, ITEM_PLACEHOLDER } from "@/lib/itemImages";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { trackEnhancementAttempt } from "@/hooks/useAchievementTracker";
import { useAudio } from "@/context/AudioContext";

interface Enhancement {
  player_id: string;
  item_id: string;
  enhancement_level: number;
}

interface ItemModification {
  addedStats: { [statId: string]: number };
  addedSkills: string[];
  enhancementLevel: number;
}

interface EnhancementPity {
  statFails: number;
  skillFails: number;
  upgradeFails: number;
}

interface EnhancementsData {
  enhancements: Enhancement[];
  cursedItems: string[];
  itemModifications: Record<string, ItemModification>;
  enhancementPity: EnhancementPity;
}

const PAGE_TRANSLATIONS = {
  title: { en: "Weapon Enhancement", tr: "Silah Geliştirme", zh: "武器强化", es: "Mejora de Armas", fr: "Amélioration d'Arme", ar: "تعزيز السلاح", ru: "Улучшение оружия", hi: "हथियार सुधार" },
  addStat: { en: "Add Stat", tr: "Stat Ekle", zh: "添加属性", es: "Añadir Stat", fr: "Ajouter Stat", ar: "إضافة إحصائية", ru: "Добавить стат", hi: "स्टेट जोड़ें" },
  upgradeLevel: { en: "Upgrade Level", tr: "Seviye Yükselt", zh: "升级等级", es: "Subir Nivel", fr: "Améliorer Niveau", ar: "رفع المستوى", ru: "Повысить уровень", hi: "स्तर अपग्रेड" },
  addSkill: { en: "Add Skill", tr: "Skill Ekle", zh: "添加技能", es: "Añadir Habilidad", fr: "Ajouter Compétence", ar: "إضافة مهارة", ru: "Добавить скилл", hi: "स्किल जोड़ें" },
  selectWeapon: { en: "Select Equipment", tr: "Ekipman Seç", zh: "选择装备", es: "Seleccionar Equipo", fr: "Sélectionner Équipement", ar: "اختر المعدات", ru: "Выбрать снаряжение", hi: "उपकरण चुनें" },
  noEquipment: { en: "No equipment in inventory", tr: "Envanterde ekipman yok", zh: "背包中没有装备", es: "Sin equipo en inventario", fr: "Aucun équipement", ar: "لا توجد معدات", ru: "Нет снаряжения", hi: "इन्वेंटरी में उपकरण नहीं" },
  successRate: { en: "Success Rate", tr: "Başarı Şansı", zh: "成功率", es: "Tasa de Éxito", fr: "Taux de Réussite", ar: "معدل النجاح", ru: "Шанс успеха", hi: "सफलता दर" },
  curseRisk: { en: "Curse Risk", tr: "Lanetlenme Riski", zh: "诅咒风险", es: "Riesgo de Maldición", fr: "Risque de Malédiction", ar: "خطر اللعنة", ru: "Риск проклятия", hi: "अभिशाप जोखिम" },
  burnRate: { en: "Burn Rate", tr: "Yanma Riski", zh: "销毁率", es: "Tasa de Destrucción", fr: "Taux de Destruction", ar: "معدل الحرق", ru: "Шанс сгорания", hi: "नष्ट होने का जोखिम" },
  currentLevel: { en: "Current Level", tr: "Mevcut Seviye", zh: "当前等级", es: "Nivel Actual", fr: "Niveau Actuel", ar: "المستوى الحالي", ru: "Текущий уровень", hi: "वर्तमान स्तर" },
  maxLevel: { en: "Max Level", tr: "Maksimum Seviye", zh: "最高等级", es: "Nivel Máximo", fr: "Niveau Maximum", ar: "المستوى الأقصى", ru: "Макс. уровень", hi: "अधिकतम स्तर" },
  cursed: { en: "CURSED", tr: "LANETLİ", zh: "被诅咒", es: "MALDITO", fr: "MAUDIT", ar: "ملعون", ru: "ПРОКЛЯТО", hi: "शापित" },
  addedStats: { en: "Added Stats", tr: "Eklenen Statlar", zh: "已添加属性", es: "Stats Añadidos", fr: "Stats Ajoutés", ar: "الإحصائيات المضافة", ru: "Добавленные статы", hi: "जोड़े गए स्टेट्स" },
  addedSkills: { en: "Added Skills", tr: "Eklenen Skilller", zh: "已添加技能", es: "Habilidades Añadidas", fr: "Compétences Ajoutées", ar: "المهارات المضافة", ru: "Добавленные скиллы", hi: "जोड़े गए स्किल्स" },
  enhance: { en: "Enhance", tr: "Geliştir", zh: "强化", es: "Mejorar", fr: "Améliorer", ar: "تعزيز", ru: "Улучшить", hi: "सुधारें" },
  enhancing: { en: "Enhancing...", tr: "Geliştiriliyor...", zh: "强化中...", es: "Mejorando...", fr: "Amélioration...", ar: "جاري التعزيز...", ru: "Улучшение...", hi: "सुधार हो रहा है..." },
  inInventory: { en: "in inventory", tr: "envanterde", zh: "在背包中", es: "en inventario", fr: "en inventaire", ar: "في المخزون", ru: "в инвентаре", hi: "इन्वेंटरी में" },
  chaosStoneDesc: { en: "Adds a random stat. Curse on fail.", tr: "Rastgele stat ekler. Başarısızlıkta lanetlenir.", zh: "添加随机属性。失败会被诅咒。", es: "Añade stat aleatorio. Maldición si falla.", fr: "Ajoute stat aléatoire. Maudit si échec.", ar: "يضيف إحصائية عشوائية. لعنة عند الفشل.", ru: "Добавляет случайный стат. Проклятие при неудаче.", hi: "रैंडम स्टेट जोड़ता है। असफलता पर अभिशाप।" },
  juraxGemDesc: { en: "Upgrades level (+5% stats). May burn on fail.", tr: "Seviye yükseltir (+5% stat). Başarısızlıkta yanabilir.", zh: "升级等级（+5%属性）。失败可能销毁。", es: "Sube nivel (+5% stats). Puede destruirse si falla.", fr: "Améliore niveau (+5% stats). Peut brûler si échec.", ar: "يرفع المستوى (+5% إحصائيات). قد يحترق عند الفشل.", ru: "Повышает уровень (+5% статов). Может сгореть при неудаче.", hi: "स्तर अपग्रेड (+5% स्टेट्स)। असफलता पर नष्ट हो सकता है।" },
  deathLiquidDesc: { en: "Adds a random skill. Curse on fail.", tr: "Rastgele skill ekler. Başarısızlıkta lanetlenir.", zh: "添加随机技能。失败会被诅咒。", es: "Añade habilidad aleatoria. Maldición si falla.", fr: "Ajoute compétence aléatoire. Maudit si échec.", ar: "يضيف مهارة عشوائية. لعنة عند الفشل.", ru: "Добавляет случайный скилл. Проклятие при неудаче.", hi: "रैंडम स्किल जोड़ता है। असफलता पर अभिशाप।" },
  maxStats: { en: "Max stats reached (3)", tr: "Maksimum stat eklendi (3)", zh: "已达最大属性数(3)", es: "Stats máximos alcanzados (3)", fr: "Stats max atteints (3)", ar: "الحد الأقصى للإحصائيات (3)", ru: "Макс. статов достигнуто (3)", hi: "अधिकतम स्टेट्स पहुंच गए (3)" },
  maxSkills: { en: "Max skills reached (2)", tr: "Maksimum skill eklendi (2)", zh: "已达最大技能数(2)", es: "Habilidades máximas alcanzadas (2)", fr: "Compétences max atteintes (2)", ar: "الحد الأقصى للمهارات (2)", ru: "Макс. скиллов достигнуто (2)", hi: "अधिकतम स्किल्स पहुंच गए (2)" },
  noMaterial: { en: "No material available", tr: "Malzeme yok", zh: "没有材料", es: "Sin material disponible", fr: "Aucun matériau", ar: "لا يوجد مادة", ru: "Нет материала", hi: "सामग्री उपलब्ध नहीं" },
  baseStats: { en: "Base Stats", tr: "Temel Statlar", zh: "基础属性", es: "Stats Base", fr: "Stats de Base", ar: "الإحصائيات الأساسية", ru: "Базовые статы", hi: "बेस स्टेट्स" },
  enhancementBonus: { en: "Enhancement Bonus", tr: "Geliştirme Bonusu", zh: "强化加成", es: "Bonus de Mejora", fr: "Bonus d'Amélioration", ar: "مكافأة التعزيز", ru: "Бонус улучшения", hi: "एन्हांसमेंट बोनस" },
  continue: { en: "Continue", tr: "Devam", zh: "继续", es: "Continuar", fr: "Continuer", ar: "متابعة", ru: "Продолжить", hi: "जारी रखें" },
  success: { en: "SUCCESS!", tr: "BAŞARILI!", zh: "成功!", es: "ÉXITO!", fr: "SUCCÈS!", ar: "نجاح!", ru: "УСПЕХ!", hi: "सफलता!" },
  failed: { en: "FAILED!", tr: "BAŞARISIZ!", zh: "失败!", es: "FALLIDO!", fr: "ÉCHOUÉ!", ar: "فشل!", ru: "НЕУДАЧА!", hi: "असफल!" },
  destroyed: { en: "DESTROYED!", tr: "YOK OLDU!", zh: "已销毁!", es: "DESTRUIDO!", fr: "DÉTRUIT!", ar: "دمر!", ru: "УНИЧТОЖЕНО!", hi: "नष्ट!" },
  weaponDetails: { en: "Weapon Details", tr: "Silah Detayları", zh: "武器详情", es: "Detalles del Arma", fr: "Détails de l'Arme", ar: "تفاصيل السلاح", ru: "Детали оружия", hi: "हथियार विवरण" },
  pityBonus: { en: "Pity Bonus", tr: "Pity Bonusu", zh: "保底加成", es: "Bonus Pity", fr: "Bonus Pitié", ar: "مكافأة الشفقة", ru: "Пити бонус", hi: "पिटी बोनस" },
  pityStacks: { en: "stacks", tr: "yığın", zh: "层", es: "acumulaciones", fr: "cumuls", ar: "تكديسات", ru: "стаков", hi: "स्टैक" },
};

const STAT_NAMES: Record<string, Record<string, string>> = {
  bonusAttack: { en: "Attack", tr: "Saldırı", zh: "攻击", es: "Ataque", fr: "Attaque", ar: "هجوم", ru: "Атака", hi: "हमला" },
  bonusDefence: { en: "Defence", tr: "Savunma", zh: "防御", es: "Defensa", fr: "Défense", ar: "دفاع", ru: "Защита", hi: "रक्षा" },
  bonusStrength: { en: "Strength", tr: "Güç", zh: "力量", es: "Fuerza", fr: "Force", ar: "قوة", ru: "Сила", hi: "ताकत" },
  bonusHitpoints: { en: "Hitpoints", tr: "Can", zh: "生命", es: "Vida", fr: "Points de vie", ar: "نقاط الصحة", ru: "Здоровье", hi: "जीवन" },
  accuracy: { en: "Accuracy", tr: "İsabet", zh: "命中", es: "Precisión", fr: "Précision", ar: "دقة", ru: "Точность", hi: "सटीकता" },
  evasion: { en: "Evasion", tr: "Kaçınma", zh: "闪避", es: "Evasión", fr: "Évasion", ar: "مراوغة", ru: "Уклонение", hi: "चकमा" },
  critChance: { en: "Crit Chance", tr: "Kritik Şansı", zh: "暴击率", es: "Probabilidad Crítica", fr: "Chance Critique", ar: "فرصة حرجة", ru: "Шанс крита", hi: "क्रिट चांस" },
  critDamage: { en: "Crit Damage", tr: "Kritik Hasar", zh: "暴击伤害", es: "Daño Crítico", fr: "Dégâts Critiques", ar: "ضرر حرج", ru: "Крит. урон", hi: "क्रिट डैमेज" },
  lifesteal: { en: "Lifesteal", tr: "Hayat Çalma", zh: "吸血", es: "Robo de Vida", fr: "Vol de vie", ar: "سرقة الحياة", ru: "Вампиризм", hi: "लाइफस्टील" },
  damageReduction: { en: "Damage Reduction", tr: "Hasar Azaltma", zh: "伤害减免", es: "Reducción de Daño", fr: "Réduction de Dégâts", ar: "تقليل الضرر", ru: "Снижение урона", hi: "डैमेज में कमी" },
  attackSpeed: { en: "Attack Speed", tr: "Saldırı Hızı", zh: "攻击速度", es: "Velocidad de Ataque", fr: "Vitesse d'Attaque", ar: "سرعة الهجوم", ru: "Скорость атаки", hi: "हमले की गति" },
};

const BASE_STAT_NAMES: Record<string, Record<string, string>> = {
  attackBonus: { en: "Attack", tr: "Saldırı", zh: "攻击", es: "Ataque", fr: "Attaque", ar: "هجوم", ru: "Атака", hi: "हमला" },
  strengthBonus: { en: "Strength", tr: "Güç", zh: "力量", es: "Fuerza", fr: "Force", ar: "قوة", ru: "Сила", hi: "ताकत" },
  defenceBonus: { en: "Defence", tr: "Savunma", zh: "防御", es: "Defensa", fr: "Défense", ar: "دفاع", ru: "Защита", hi: "रक्षा" },
  accuracyBonus: { en: "Accuracy", tr: "İsabet", zh: "命中", es: "Precisión", fr: "Précision", ar: "دقة", ru: "Точность", hi: "सटीकता" },
  hitpointsBonus: { en: "Hitpoints", tr: "Can", zh: "生命", es: "Vida", fr: "Points de vie", ar: "نقاط الصحة", ru: "Здоровье", hi: "जीवन" },
};

const SKILL_NAMES: Record<string, Record<string, string>> = {
  poison: { en: "Poison", tr: "Zehir", zh: "毒", es: "Veneno", fr: "Poison", ar: "سم", ru: "Яд", hi: "ज़हर" },
  burn: { en: "Burn", tr: "Yanma", zh: "燃烧", es: "Quemadura", fr: "Brûlure", ar: "حرق", ru: "Ожог", hi: "जलना" },
  bleed: { en: "Bleed", tr: "Kanama", zh: "流血", es: "Sangrado", fr: "Saignement", ar: "نزيف", ru: "Кровотечение", hi: "रक्तस्राव" },
  stun: { en: "Stun", tr: "Sersemletme", zh: "眩晕", es: "Aturdimiento", fr: "Étourdissement", ar: "صعق", ru: "Оглушение", hi: "स्तब्ध" },
  freeze: { en: "Freeze", tr: "Dondurma", zh: "冰冻", es: "Congelación", fr: "Gel", ar: "تجميد", ru: "Заморозка", hi: "फ्रीज" },
  vampiric: { en: "Vampiric", tr: "Vampirik", zh: "吸血", es: "Vampírico", fr: "Vampirique", ar: "مصاص دماء", ru: "Вампирический", hi: "वैम्पायरिक" },
  execute: { en: "Execute", tr: "İnfaz", zh: "处决", es: "Ejecución", fr: "Exécution", ar: "إعدام", ru: "Казнь", hi: "निष्पादन" },
  armor_pierce: { en: "Armor Pierce", tr: "Zırh Delme", zh: "破甲", es: "Perforar Armadura", fr: "Perce-Armure", ar: "اختراق الدروع", ru: "Пробивание брони", hi: "आर्मर पियर्स" },
};

function getStatSuccessRate(existingStatCount: number): number {
  const rates = [60, 45, 30];
  return rates[Math.min(existingStatCount, rates.length - 1)];
}

function getSkillSuccessRate(existingSkillCount: number): number {
  const rates = [50, 35];
  return rates[Math.min(existingSkillCount, rates.length - 1)];
}

type AnimationPhase = 'idle' | 'charging' | 'burst' | 'result';

interface AnimationState {
  phase: AnimationPhase;
  enhancementType: 'stat' | 'upgrade' | 'skill';
  result: any | null;
}

function EnhancementAnimation({ 
  state, 
  weaponImage,
  weaponName,
  onContinue,
  language,
}: { 
  state: AnimationState;
  weaponImage: string;
  weaponName: string;
  onContinue: () => void;
  language: string;
}) {
  const t = (key: keyof typeof PAGE_TRANSLATIONS) => 
    PAGE_TRANSLATIONS[key][language as keyof typeof PAGE_TRANSLATIONS.title] || PAGE_TRANSLATIONS[key].en;
  const getStatName = (statId: string) => 
    STAT_NAMES[statId]?.[language] || STAT_NAMES[statId]?.en || statId;
  const getSkillName = (skillId: string) => 
    SKILL_NAMES[skillId]?.[language] || SKILL_NAMES[skillId]?.en || skillId;

  const colorMap = {
    stat: { glow: 'rgba(239,68,68,0.8)', ring: '#ef4444', particle: '#f97316' },
    upgrade: { glow: 'rgba(59,130,246,0.8)', ring: '#3b82f6', particle: '#06b6d4' },
    skill: { glow: 'rgba(168,85,247,0.8)', ring: '#a855f7', particle: '#ec4899' },
  };
  const colors = colorMap[state.enhancementType];

  const isSuccess = state.result?.success;
  const isBurned = state.result?.burned;
  const isCursed = state.result?.cursed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backdropFilter: 'blur(8px)' }}>
      <div className="absolute inset-0 bg-black/70" />
      
      <div className="relative flex flex-col items-center gap-6 z-10">
        <div className="relative">
          {state.phase === 'charging' && (
            <>
              <div 
                className="absolute inset-0 rounded-full animate-enhancement-pulse"
                style={{
                  width: 200, height: 200,
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
                }}
              />
              <div 
                className="absolute animate-enhancement-ring"
                style={{
                  width: 180, height: 180,
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  border: `2px solid ${colors.ring}`,
                  borderRadius: '50%',
                  boxShadow: `0 0 20px ${colors.ring}, inset 0 0 20px ${colors.ring}`,
                }}
              />
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute animate-enhancement-particle"
                  style={{
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: colors.particle,
                    boxShadow: `0 0 8px ${colors.particle}`,
                    left: '50%', top: '50%',
                    transformOrigin: '0 0',
                    animationDelay: `${i * 0.25}s`,
                    '--particle-angle': `${i * 45}deg`,
                  } as any}
                />
              ))}
            </>
          )}

          {state.phase === 'burst' && (
            <div 
              className="absolute animate-enhancement-burst"
              style={{
                width: 300, height: 300,
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                background: `radial-gradient(circle, ${isSuccess ? 'rgba(250,204,21,0.9)' : 'rgba(239,68,68,0.9)'} 0%, transparent 70%)`,
                borderRadius: '50%',
              }}
            />
          )}

          <div className={cn(
            "relative w-24 h-24 rounded-xl border-2 overflow-hidden transition-all duration-500 z-10",
            state.phase === 'charging' && "animate-enhancement-weapon-glow",
            state.phase === 'burst' && "scale-125",
            state.phase === 'result' && "scale-110",
            isBurned && state.phase === 'result' && "opacity-30 grayscale",
            isCursed && state.phase === 'result' && "border-red-500",
          )}
          style={{
            borderColor: state.phase === 'result' 
              ? (isSuccess ? '#facc15' : isCursed ? '#ef4444' : '#6b7280') 
              : colors.ring,
            boxShadow: state.phase === 'result' && isSuccess 
              ? '0 0 30px rgba(250,204,21,0.5)' 
              : state.phase === 'charging' 
                ? `0 0 20px ${colors.glow}` 
                : 'none',
          }}>
            <img 
              src={weaponImage}
              alt={weaponName}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = ITEM_PLACEHOLDER; }}
            />
            {isCursed && state.phase === 'result' && (
              <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                <Skull className="w-10 h-10 text-red-500" weight="fill" />
              </div>
            )}
          </div>
        </div>

        <div className="text-center font-bold text-lg text-amber-200">{weaponName}</div>

        {state.phase === 'result' && state.result && (
          <div className="text-center space-y-3 animate-fade-in">
            <div className={cn(
              "text-2xl font-black tracking-wider",
              isSuccess ? "text-yellow-400" : isBurned ? "text-red-500" : isCursed ? "text-red-400" : "text-gray-400"
            )}>
              {isBurned ? t("destroyed") : isSuccess ? t("success") : t("failed")}
            </div>
            
            <div className="text-sm text-gray-300 max-w-xs">
              {state.result.message}
            </div>

            {isSuccess && state.enhancementType === 'stat' && state.result.addedStat && (
              <div className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/40 rounded-lg inline-block">
                <span className="text-blue-400 font-medium">
                  +{state.result.addedStat.value} {getStatName(state.result.addedStat.id)}
                </span>
              </div>
            )}

            {isSuccess && state.enhancementType === 'upgrade' && (
              <div className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 rounded-lg inline-block">
                <span className="text-amber-400 font-medium">
                  +{state.result.newLevel} (+{state.result.newLevel * 5}% stats)
                </span>
              </div>
            )}

            {isSuccess && state.enhancementType === 'skill' && state.result.addedSkill && (
              <div className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/40 rounded-lg inline-block">
                <span className="text-purple-400 font-medium">
                  {getSkillName(state.result.addedSkill.id)}
                </span>
              </div>
            )}

            <div>
              <Button
                data-testid="button-enhancement-continue"
                onClick={onContinue}
                className="mt-2 px-8 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500"
              >
                {t("continue")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EnhancementPage() {
  const { player, language, inventory, refreshPlayer, applyServerData } = useGame();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isMobile } = useMobile();
  const { stopAmbient } = useAudio();

  useEffect(() => {
    stopAmbient();
    return () => { stopAmbient(); };
  }, [stopAmbient]);
  
  const [selectedWeapon, setSelectedWeapon] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("add-stat");
  const [animState, setAnimState] = useState<AnimationState>({ phase: 'idle', enhancementType: 'stat', result: null });
  const pendingResult = useRef<any>(null);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  
  const t = (key: keyof typeof PAGE_TRANSLATIONS) => 
    PAGE_TRANSLATIONS[key][language as keyof typeof PAGE_TRANSLATIONS.title] || PAGE_TRANSLATIONS[key].en;
  
  const getStatName = (statId: string) => 
    STAT_NAMES[statId]?.[language] || STAT_NAMES[statId]?.en || statId;
  
  const getSkillName = (skillId: string) => 
    SKILL_NAMES[skillId]?.[language] || SKILL_NAMES[skillId]?.en || skillId;
  
  const getBaseStatName = (statId: string) =>
    BASE_STAT_NAMES[statId]?.[language] || BASE_STAT_NAMES[statId]?.en || statId;

  const { data: enhancementsData, refetch: refetchEnhancements } = useQuery<EnhancementsData>({
    queryKey: ["/api/enhancements"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/enhancements");
      return response.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    enabled: !!player,
  });

  const enhancements = enhancementsData?.enhancements || [];
  const cursedItems = enhancementsData?.cursedItems || [];
  const itemModifications = enhancementsData?.itemModifications || {};
  const enhancementPity = enhancementsData?.enhancementPity || { statFails: 0, skillFails: 0, upgradeFails: 0 };
  
  const enhancementMap = useMemo(() => {
    const map: Record<string, number> = {};
    enhancements.forEach(e => {
      map[e.item_id] = e.enhancement_level;
    });
    return map;
  }, [enhancements]);

  const inventoryItems = useMemo(() => {
    if (!inventory) return [];
    return Object.entries(inventory)
      .filter(([itemId, count]) => {
        if (count <= 0) return false;
        const baseId = itemId.split(' (')[0].split('#')[0];
        const item = getItemById(baseId);
        return item?.type === "equipment" && item?.equipSlot === "weapon";
      })
      .map(([itemId, count]) => ({ itemId, count }));
  }, [inventory]);

  const materialCounts = useMemo(() => ({
    chaos_stone: (inventory?.['chaos_stone'] as number) || 0,
    jurax_gem: (inventory?.['jurax_gem'] as number) || 0,
    death_liquid: (inventory?.['death_liquid'] as number) || 0,
  }), [inventory]);

  const startAnimation = useCallback((type: 'stat' | 'upgrade' | 'skill') => {
    setAnimState({ phase: 'charging', enhancementType: type, result: null });
    pendingResult.current = null;
  }, []);

  const showResult = useCallback((result: any) => {
    pendingResult.current = result;
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (animState.phase === 'charging') {
      const burstTimer = setTimeout(() => {
        setAnimState(prev => ({ ...prev, phase: 'burst' }));
      }, 2200);
      timersRef.current.push(burstTimer);
      return () => clearTimeout(burstTimer);
    }
    if (animState.phase === 'burst') {
      const resultTimer = setTimeout(() => {
        if (pendingResult.current) {
          setAnimState(prev => ({ ...prev, phase: 'result', result: pendingResult.current }));
        }
      }, 600);
      timersRef.current.push(resultTimer);
      return () => clearTimeout(resultTimer);
    }
  }, [animState.phase]);

  const handleContinue = useCallback(() => {
    setAnimState({ phase: 'idle', enhancementType: 'stat', result: null });
    pendingResult.current = null;
  }, []);

  const handleEnhancementSuccess = useCallback((data: any) => {
    if (data.enhancementPity) {
      queryClient.setQueryData<EnhancementsData>(["/api/enhancements"], (old) => {
        if (!old) return old;
        return { ...old, enhancementPity: data.enhancementPity };
      });
    }
    if (data.inventory) {
      applyServerData({ inventory: data.inventory });
    }
    refetchEnhancements();
    refreshPlayer();
    queryClient.invalidateQueries({ queryKey: ["/api/enhancements"] });
    
    if (data.newItemId && data.newItemId !== selectedWeapon) {
      setSelectedWeapon(data.newItemId);
    }
    
    trackEnhancementAttempt(!!data.success);
    showResult(data);
  }, [refetchEnhancements, refreshPlayer, applyServerData, queryClient, selectedWeapon, showResult]);

  const addStatMutation = useMutation({
    mutationFn: async (itemId: string) => {
      startAnimation('stat');
      const response = await apiRequest("POST", "/api/enhancements/add-stat", { itemId });
      return response.json();
    },
    onSuccess: handleEnhancementSuccess,
    onError: (error: any) => {
      setAnimState({ phase: 'idle', enhancementType: 'stat', result: null });
      toast({ title: "Error", description: error.message || "Enhancement failed", variant: "destructive" });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      startAnimation('upgrade');
      const response = await apiRequest("POST", "/api/enhancements/upgrade", { 
        itemId, 
        materialId: 'jurax_gem',
        useDeathLiquid: false,
      });
      return response.json();
    },
    onSuccess: handleEnhancementSuccess,
    onError: (error: any) => {
      setAnimState({ phase: 'idle', enhancementType: 'upgrade', result: null });
      toast({ title: "Error", description: error.message || "Enhancement failed", variant: "destructive" });
    },
  });

  const addSkillMutation = useMutation({
    mutationFn: async (itemId: string) => {
      startAnimation('skill');
      const response = await apiRequest("POST", "/api/enhancements/add-skill", { itemId });
      return response.json();
    },
    onSuccess: handleEnhancementSuccess,
    onError: (error: any) => {
      setAnimState({ phase: 'idle', enhancementType: 'skill', result: null });
      toast({ title: "Error", description: error.message || "Enhancement failed", variant: "destructive" });
    },
  });

  const selectedItemMods = selectedWeapon ? (itemModifications[selectedWeapon] || { addedStats: {}, addedSkills: [], enhancementLevel: 0 }) : null;
  const selectedItemLevel = selectedWeapon ? (enhancementMap[selectedWeapon] || 0) : 0;
  const isSelectedCursed = selectedWeapon ? cursedItems.includes(selectedWeapon) : false;

  const existingStatCount = Object.keys(selectedItemMods?.addedStats || {}).length;
  const existingSkillCount = selectedItemMods?.addedSkills?.length || 0;
  const statBaseRate = getStatSuccessRate(existingStatCount);
  const skillBaseRate = getSkillSuccessRate(existingSkillCount);
  const statPityBonus = enhancementPity.statFails * 10;
  const skillPityBonus = enhancementPity.skillFails * 10;
  const upgradePityBonus = enhancementPity.upgradeFails * 10;
  const statSuccessRate = Math.min(100, statBaseRate + statPityBonus);
  const skillSuccessRate = Math.min(100, skillBaseRate + skillPityBonus);

  const canAddStat = selectedWeapon && 
    !isSelectedCursed && 
    materialCounts.chaos_stone > 0 && 
    existingStatCount < 3;

  const canUpgradeLevel = selectedWeapon && 
    !isSelectedCursed && 
    materialCounts.jurax_gem > 0 && 
    selectedItemLevel < 10;

  const canAddSkill = selectedWeapon && 
    !isSelectedCursed && 
    materialCounts.death_liquid > 0 && 
    existingSkillCount < 2;

  const isPending = addStatMutation.isPending || upgradeMutation.isPending || addSkillMutation.isPending;

  const selectedBaseItem = useMemo(() => {
    if (!selectedWeapon) return null;
    const baseId = selectedWeapon.split(' (')[0].split('#')[0];
    return getItemById(baseId);
  }, [selectedWeapon]);

  const selectedWeaponImage = useMemo(() => {
    if (!selectedWeapon) return ITEM_PLACEHOLDER;
    return getItemImage(selectedWeapon.split(' (')[0]);
  }, [selectedWeapon]);

  return (
    <div className={cn("min-h-screen bg-background p-4", isMobile && "pb-24")}>
      {animState.phase !== 'idle' && selectedWeapon && (
        <EnhancementAnimation
          state={animState}
          weaponImage={selectedWeaponImage}
          weaponName={translateItemName(selectedWeapon, language) + (selectedItemLevel > 0 ? ` +${selectedItemLevel}` : '')}
          onContinue={handleContinue}
          language={language}
        />
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold text-amber-400 flex items-center justify-center gap-2" data-testid="text-page-title">
            <Sparkle className="w-6 h-6 md:w-8 md:h-8" weight="fill" />
            {t("title")}
            <Sparkle className="w-6 h-6 md:w-8 md:h-8" weight="fill" />
          </h1>
        </div>

        <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
          <Card className="border-amber-500/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sword className="w-5 h-5 text-amber-400" />
                {t("selectWeapon")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inventoryItems.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">{t("noEquipment")}</p>
              ) : (
                <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1">
                  {inventoryItems.map(({ itemId, count }) => {
                    const level = enhancementMap[itemId] || 0;
                    const isSelected = selectedWeapon === itemId;
                    const isCursed = cursedItems.includes(itemId);
                    const mods = itemModifications[itemId];
                    const addedStatCount = Object.keys(mods?.addedStats || {}).length;
                    const addedSkillCount = mods?.addedSkills?.length || 0;
                    const { rarity } = parseItemWithRarity(itemId);
                    const rarityColorClass = rarity ? RARITY_COLORS[rarity] : "text-gray-400";
                    
                    return (
                      <button
                        key={itemId}
                        data-testid={`button-select-weapon-${itemId.replace(/[^a-zA-Z0-9]/g, '_')}`}
                        onClick={() => setSelectedWeapon(itemId)}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg border transition-all text-left",
                          isSelected 
                            ? "border-amber-500 bg-amber-500/20" 
                            : isCursed
                              ? "border-red-500/60 bg-red-500/10 hover:border-red-500"
                              : "border-border/50 bg-background/50 hover:border-amber-500/50"
                        )}
                      >
                        <div className="relative">
                          <img 
                            src={getItemImage(itemId.split(' (')[0])} 
                            alt={itemId}
                            className={cn("w-10 h-10 rounded", isCursed && "grayscale")}
                            onError={(e) => { (e.target as HTMLImageElement).src = ITEM_PLACEHOLDER; }}
                          />
                          {isCursed && (
                            <Skull className="absolute -top-1 -right-1 w-4 h-4 text-red-500" weight="fill" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            <span className={rarityColorClass}>
                              {translateItemName(itemId, language)}
                            </span>
                            {level > 0 && <span className="text-amber-400 ml-1">+{level}</span>}
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            {rarity && rarity !== "Common" && (
                              <span className={rarityColorClass}>{rarity}</span>
                            )}
                            {addedStatCount > 0 && (
                              <span className="text-blue-400">+{addedStatCount} stats</span>
                            )}
                            {addedSkillCount > 0 && (
                              <span className="text-purple-400">+{addedSkillCount} skills</span>
                            )}
                          </div>
                        </div>
                        {isCursed && (
                          <span className="text-xs text-red-500 font-bold">{t("cursed")}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {selectedWeapon && selectedBaseItem && (
              <Card className="border-amber-500/20 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
                    <Eye className="w-4 h-4" />
                    {t("weaponDetails")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img 
                      src={selectedWeaponImage}
                      alt={selectedWeapon}
                      className={cn("w-14 h-14 rounded-lg border border-amber-500/30", isSelectedCursed && "grayscale border-red-500")}
                      onError={(e) => { (e.target as HTMLImageElement).src = ITEM_PLACEHOLDER; }}
                    />
                    <div>
                      <div className="font-bold text-amber-200">
                        {translateItemName(selectedWeapon, language)}
                        {selectedItemLevel > 0 && <span className="text-amber-400 ml-1">+{selectedItemLevel}</span>}
                      </div>
                      {selectedItemLevel > 0 && (
                        <div className="text-xs text-green-400">+{selectedItemLevel * 5}% {t("enhancementBonus")}</div>
                      )}
                    </div>
                  </div>

                  {selectedBaseItem.stats && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 font-medium">{t("baseStats")}</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {Object.entries(selectedBaseItem.stats).map(([key, val]) => {
                          if (!val || val === 0) return null;
                          const baseName = getBaseStatName(key);
                          if (baseName === key && !BASE_STAT_NAMES[key]) return null;
                          const bonus = selectedItemLevel > 0 ? Math.floor(val * selectedItemLevel * 0.05) : 0;
                          return (
                            <div key={key} className="flex justify-between text-xs">
                              <span className="text-gray-400">{baseName}</span>
                              <span className="text-gray-200">
                                {val}
                                {bonus > 0 && <span className="text-green-400"> (+{bonus})</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {existingStatCount > 0 && (
                    <div>
                      <div className="text-xs text-blue-400 mb-1 font-medium">{t("addedStats")} ({existingStatCount}/3)</div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(selectedItemMods?.addedStats || {}).map(([statId, value]) => (
                          <span key={statId} className="px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded text-xs border border-blue-500/30">
                            +{value} {getStatName(statId)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {existingSkillCount > 0 && (
                    <div>
                      <div className="text-xs text-purple-400 mb-1 font-medium">{t("addedSkills")} ({existingSkillCount}/2)</div>
                      <div className="flex flex-wrap gap-1">
                        {(selectedItemMods?.addedSkills || []).map((skillId) => (
                          <span key={skillId} className="px-2 py-0.5 bg-purple-500/15 text-purple-400 rounded text-xs border border-purple-500/30">
                            {getSkillName(skillId)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {isSelectedCursed && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 border border-red-500/30">
                      <Skull className="w-3.5 h-3.5" weight="fill" />
                      {t("cursed")}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-blue-500/30 bg-card/50">
              <CardContent className="pt-6">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="add-stat" data-testid="tab-add-stat" className="text-xs">
                      <Plus className="w-3 h-3 mr-1" />
                      {t("addStat")}
                    </TabsTrigger>
                    <TabsTrigger value="upgrade" data-testid="tab-upgrade" className="text-xs">
                      <ArrowUp className="w-3 h-3 mr-1" />
                      {t("upgradeLevel")}
                    </TabsTrigger>
                    <TabsTrigger value="add-skill" data-testid="tab-add-skill" className="text-xs">
                      <Lightning className="w-3 h-3 mr-1" />
                      {t("addSkill")}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="add-stat" className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-red-500/40 bg-red-500/10">
                      <img 
                        src={getItemImage("chaos_stone")} 
                        alt="Chaos Stone"
                        className="w-12 h-12 rounded"
                        onError={(e) => { (e.target as HTMLImageElement).src = ITEM_PLACEHOLDER; }}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-red-400">Chaos Stone</div>
                        <div className="text-xs text-muted-foreground">{t("chaosStoneDesc")}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          x{materialCounts.chaos_stone} {t("inInventory")}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between text-sm">
                      <span>{t("successRate")}: <span className={cn("font-bold", statSuccessRate >= 50 ? "text-green-400" : statSuccessRate >= 35 ? "text-yellow-400" : "text-orange-400")}>{statSuccessRate}%</span>
                        {statPityBonus > 0 && <span className="text-cyan-400 text-xs ml-1">(+{statPityBonus}%)</span>}
                      </span>
                      <span>{t("curseRisk")}: <span className="text-red-400 font-bold">{100 - statSuccessRate}%</span></span>
                    </div>
                    {enhancementPity.statFails > 0 && (
                      <div className="text-xs text-cyan-400/80 flex items-center gap-1">
                        <Sparkle className="w-3 h-3" /> {t("pityBonus")}: {enhancementPity.statFails} {t("pityStacks")} (+{statPityBonus}%)
                      </div>
                    )}

                    {selectedWeapon && selectedItemMods && existingStatCount > 0 && (
                      <div className="text-sm">
                        <div className="text-muted-foreground mb-1">{t("addedStats")} ({existingStatCount}/3):</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(selectedItemMods.addedStats).map(([statId, value]) => (
                            <span key={statId} className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                              +{value} {getStatName(statId)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      data-testid="button-add-stat"
                      onClick={() => selectedWeapon && addStatMutation.mutate(selectedWeapon)}
                      disabled={!canAddStat || isPending}
                      className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500"
                    >
                      {isPending ? t("enhancing") : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          {existingStatCount >= 3 
                            ? t("maxStats") 
                            : materialCounts.chaos_stone === 0 
                              ? t("noMaterial")
                              : t("addStat")}
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="upgrade" className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-500/40 bg-blue-500/10">
                      <img 
                        src={getItemImage("jurax_gem")} 
                        alt="Jurax Gem"
                        className="w-12 h-12 rounded"
                        onError={(e) => { (e.target as HTMLImageElement).src = ITEM_PLACEHOLDER; }}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-blue-400">Jurax Gem</div>
                        <div className="text-xs text-muted-foreground">{t("juraxGemDesc")}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          x{materialCounts.jurax_gem} {t("inInventory")}
                        </div>
                      </div>
                    </div>

                    {selectedWeapon && (
                      <div className="text-center">
                        <div className="text-muted-foreground text-sm mb-1">{t("currentLevel")}</div>
                        <div className="text-3xl font-bold text-amber-400" data-testid="text-current-level">
                          +{selectedItemLevel}
                        </div>
                        <div className="text-xs text-green-400">+{selectedItemLevel * 5}% stats</div>
                      </div>
                    )}

                    {selectedWeapon && selectedBaseItem?.stats && selectedItemLevel > 0 && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
                        <div className="text-xs text-amber-400 mb-1 font-medium">{t("enhancementBonus")} (+{selectedItemLevel * 5}%)</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          {Object.entries(selectedBaseItem.stats).map(([key, val]) => {
                            if (!val || val === 0) return null;
                            const baseName = getBaseStatName(key);
                            if (baseName === key && !BASE_STAT_NAMES[key]) return null;
                            const bonus = Math.floor(val * selectedItemLevel * 0.05);
                            if (bonus === 0) return null;
                            return (
                              <div key={key} className="flex justify-between text-xs">
                                <span className="text-gray-400">{baseName}</span>
                                <span className="text-green-400">+{bonus}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedItemLevel < 10 && (() => {
                      const upgradeBaseRate = [100, 90, 80, 70, 60, 50, 40, 30, 20, 15][selectedItemLevel] + 15;
                      const upgradeTotal = Math.min(100, upgradeBaseRate + upgradePityBonus);
                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span>{t("successRate")}: <span className="text-green-400 font-bold">
                              {upgradeTotal}%
                            </span>
                              {upgradePityBonus > 0 && <span className="text-cyan-400 text-xs ml-1">(+{upgradePityBonus}%)</span>}
                            </span>
                            <span>{t("burnRate")}: <span className="text-red-400 font-bold">
                              {[0, 0, 0, 5, 10, 15, 25, 35, 45, 55][selectedItemLevel]}%
                            </span></span>
                          </div>
                          {enhancementPity.upgradeFails > 0 && (
                            <div className="text-xs text-cyan-400/80 flex items-center gap-1">
                              <Sparkle className="w-3 h-3" /> {t("pityBonus")}: {enhancementPity.upgradeFails} {t("pityStacks")} (+{upgradePityBonus}%)
                            </div>
                          )}
                        </>
                      );
                    })()}

                    <Button
                      data-testid="button-upgrade"
                      onClick={() => selectedWeapon && upgradeMutation.mutate(selectedWeapon)}
                      disabled={!canUpgradeLevel || isPending}
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500"
                    >
                      {isPending ? t("enhancing") : (
                        <>
                          <ArrowUp className="w-4 h-4 mr-2" />
                          {selectedItemLevel >= 10 
                            ? t("maxLevel") 
                            : materialCounts.jurax_gem === 0 
                              ? t("noMaterial")
                              : `${t("upgradeLevel")} → +${selectedItemLevel + 1}`}
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="add-skill" className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-purple-500/40 bg-purple-500/10">
                      <img 
                        src={getItemImage("death_liquid")} 
                        alt="Death Liquid"
                        className="w-12 h-12 rounded"
                        onError={(e) => { (e.target as HTMLImageElement).src = ITEM_PLACEHOLDER; }}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-purple-400">Death Liquid</div>
                        <div className="text-xs text-muted-foreground">{t("deathLiquidDesc")}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          x{materialCounts.death_liquid} {t("inInventory")}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span>{t("successRate")}: <span className={cn("font-bold", skillSuccessRate >= 50 ? "text-green-400" : "text-yellow-400")}>{skillSuccessRate}%</span>
                        {skillPityBonus > 0 && <span className="text-cyan-400 text-xs ml-1">(+{skillPityBonus}%)</span>}
                      </span>
                      <span>{t("curseRisk")}: <span className="text-red-400 font-bold">{100 - skillSuccessRate}%</span></span>
                    </div>
                    {enhancementPity.skillFails > 0 && (
                      <div className="text-xs text-cyan-400/80 flex items-center gap-1">
                        <Sparkle className="w-3 h-3" /> {t("pityBonus")}: {enhancementPity.skillFails} {t("pityStacks")} (+{skillPityBonus}%)
                      </div>
                    )}

                    {selectedWeapon && selectedItemMods && existingSkillCount > 0 && (
                      <div className="text-sm">
                        <div className="text-muted-foreground mb-1">{t("addedSkills")} ({existingSkillCount}/2):</div>
                        <div className="flex flex-wrap gap-1">
                          {(selectedItemMods.addedSkills || []).map((skillId) => (
                            <span key={skillId} className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                              {getSkillName(skillId)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      data-testid="button-add-skill"
                      onClick={() => selectedWeapon && addSkillMutation.mutate(selectedWeapon)}
                      disabled={!canAddSkill || isPending}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                    >
                      {isPending ? t("enhancing") : (
                        <>
                          <Lightning className="w-4 h-4 mr-2" />
                          {existingSkillCount >= 2 
                            ? t("maxSkills") 
                            : materialCounts.death_liquid === 0 
                              ? t("noMaterial")
                              : t("addSkill")}
                        </>
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>

                {isSelectedCursed && (
                  <div className="mt-4 p-3 rounded-lg border border-red-500 bg-red-500/20 flex items-center gap-2">
                    <Skull className="w-5 h-5 text-red-500" weight="fill" />
                    <span className="text-red-400 text-sm font-medium">
                      {t("cursed")} - Cannot be enhanced, traded, repaired or sold
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
