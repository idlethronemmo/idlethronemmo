import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Drop,
  Lightning,
  Target,
  Skull,
  Sword,
  Shield,
  Heart,
  Warning,
  Fire,
  Eye,
  ShieldStar,
  ArrowsClockwise,
  Heartbeat,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";

interface SkillDetailPopupProps {
  skill: any;
  variant?: "badge" | "inline" | "icon";
  isMonsterSkill?: boolean;
  children?: React.ReactNode;
}

function getSkillIcon(type: string) {
  switch (type) {
    case "poison": return Drop;
    case "stun": return Lightning;
    case "critical":
    case "slow_crit": return Target;
    case "lifesteal_burst": return Skull;
    case "burn": return Fire;
    case "armor_break":
    case "damage": return Sword;
    case "combo": return Lightning;
    case "heal":
    case "groupHeal": return Heart;
    case "lifesteal": return Heart;
    case "buff": return Shield;
    case "debuff": return Drop;
    case "aoe": return Sword;
    case "enrage": return Warning;
    case "evasion_aura": return Eye;
    case "magic_shield": return ShieldStar;
    case "armor_repair": return ArrowsClockwise;
    case "regenerate_on_no_stun": return Heartbeat;
    case "reflect_damage": return ArrowCounterClockwise;
    default: return Lightning;
  }
}

function getWeaponSkillColors(type: string): { bg: string; text: string; border: string } {
  switch (type) {
    case "poison": return { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/60" };
    case "stun": return { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/60" };
    case "critical": return { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/60" };
    case "lifesteal_burst": return { bg: "bg-pink-500/20", text: "text-pink-400", border: "border-pink-500/60" };
    case "armor_break": return { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/60" };
    case "combo": return { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/60" };
    case "slow_crit": return { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/60" };
    case "damage": return { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/60" };
    case "heal":
    case "groupHeal": return { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/60" };
    case "lifesteal": return { bg: "bg-rose-500/20", text: "text-rose-400", border: "border-rose-500/60" };
    case "buff": return { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/60" };
    case "debuff": return { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/60" };
    case "aoe": return { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/60" };
    default: return { bg: "bg-gray-500/20", text: "text-gray-400", border: "border-gray-500/60" };
  }
}

function getMonsterSkillColors(type: string): { bg: string; text: string; border: string } {
  switch (type) {
    case "stun": return { bg: "bg-yellow-500/30", text: "text-yellow-400", border: "border-yellow-500/60" };
    case "poison": return { bg: "bg-green-500/30", text: "text-green-400", border: "border-green-500/60" };
    case "burn": return { bg: "bg-orange-500/30", text: "text-orange-400", border: "border-orange-500/60" };
    case "critical": return { bg: "bg-red-500/30", text: "text-red-400", border: "border-red-500/60" };
    case "combo": return { bg: "bg-pink-500/30", text: "text-pink-400", border: "border-pink-500/60" };
    case "enrage": return { bg: "bg-purple-500/30", text: "text-purple-400", border: "border-purple-500/60" };
    case "armor_break": return { bg: "bg-cyan-500/30", text: "text-cyan-400", border: "border-cyan-500/60" };
    case "evasion_aura": return { bg: "bg-indigo-500/30", text: "text-indigo-400", border: "border-indigo-500/60" };
    case "magic_shield": return { bg: "bg-violet-500/30", text: "text-violet-400", border: "border-violet-500/60" };
    case "armor_repair": return { bg: "bg-slate-500/30", text: "text-slate-300", border: "border-slate-500/60" };
    case "regenerate_on_no_stun": return { bg: "bg-emerald-500/30", text: "text-emerald-400", border: "border-emerald-500/60" };
    case "reflect_damage": return { bg: "bg-amber-500/30", text: "text-amber-400", border: "border-amber-500/60" };
    default: return { bg: "bg-red-500/30", text: "text-red-400", border: "border-red-500/60" };
  }
}

function getAutoSkillDescription(skill: any, language: string): string | null {
  const descriptions: Record<string, Record<string, string>> = {
    poison: {
      en: `Poisons the target, dealing ${skill.dotDamage || ''} damage over ${skill.dotDuration ? (skill.dotDuration/1000) + 's' : 'time'}.`,
      tr: `Hedefi zehirler, ${skill.dotDuration ? (skill.dotDuration/1000) + ' saniye' : 'süre'} boyunca ${skill.dotDamage || ''} hasar verir.`,
      ru: `Отравляет цель, нанося ${skill.dotDamage || ''} урона за ${skill.dotDuration ? (skill.dotDuration/1000) + ' сек' : 'время'}.`,
      ar: `يسمم الهدف، ويسبب ${skill.dotDamage || ''} ضرر على مدى ${skill.dotDuration ? (skill.dotDuration/1000) + ' ثانية' : 'الوقت'}.`,
      fr: `Empoisonne la cible, infligeant ${skill.dotDamage || ''} dégâts sur ${skill.dotDuration ? (skill.dotDuration/1000) + 's' : 'la durée'}.`,
      es: `Envenena al objetivo, causando ${skill.dotDamage || ''} daño durante ${skill.dotDuration ? (skill.dotDuration/1000) + 's' : 'el tiempo'}.`,
      zh: `使目标中毒，在${skill.dotDuration ? (skill.dotDuration/1000) + '秒' : '持续时间'}内造成${skill.dotDamage || ''}点伤害。`,
      hi: `लक्ष्य को ज़हर देता है, ${skill.dotDuration ? (skill.dotDuration/1000) + ' सेकंड' : 'समय'} में ${skill.dotDamage || ''} क्षति पहुँचाता है।`,
    },
    stun: {
      en: `Stuns the target for ${skill.stunDuration || skill.stunCycles || '?'} turns, preventing all actions.`,
      tr: `Hedefi ${skill.stunDuration || skill.stunCycles || '?'} tur boyunca sersemletir, tüm aksiyonları engeller.`,
      ru: `Оглушает цель на ${skill.stunDuration || skill.stunCycles || '?'} ходов, блокируя все действия.`,
      ar: `يصعق الهدف لمدة ${skill.stunDuration || skill.stunCycles || '?'} أدوار، مما يمنع جميع الإجراءات.`,
      fr: `Étourdit la cible pendant ${skill.stunDuration || skill.stunCycles || '?'} tours, empêchant toute action.`,
      es: `Aturde al objetivo durante ${skill.stunDuration || skill.stunCycles || '?'} turnos, impidiendo todas las acciones.`,
      zh: `击晕目标${skill.stunDuration || skill.stunCycles || '?'}回合，阻止所有行动。`,
      hi: `लक्ष्य को ${skill.stunDuration || skill.stunCycles || '?'} मोड़ के लिए स्तब्ध करता है, सभी क्रियाओं को रोकता है।`,
    },
    burn: {
      en: `Burns the target, dealing ${skill.dotDamage || ''} fire damage over ${skill.dotDuration ? (skill.dotDuration/1000) + 's' : 'time'}.`,
      tr: `Hedefi yakar, ${skill.dotDuration ? (skill.dotDuration/1000) + ' saniye' : 'süre'} boyunca ${skill.dotDamage || ''} ateş hasarı verir.`,
      ru: `Поджигает цель, нанося ${skill.dotDamage || ''} огненного урона за ${skill.dotDuration ? (skill.dotDuration/1000) + ' сек' : 'время'}.`,
      ar: `يحرق الهدف، ويسبب ${skill.dotDamage || ''} ضرر ناري على مدى ${skill.dotDuration ? (skill.dotDuration/1000) + ' ثانية' : 'الوقت'}.`,
      fr: `Brûle la cible, infligeant ${skill.dotDamage || ''} dégâts de feu sur ${skill.dotDuration ? (skill.dotDuration/1000) + 's' : 'la durée'}.`,
      es: `Quema al objetivo, causando ${skill.dotDamage || ''} daño de fuego durante ${skill.dotDuration ? (skill.dotDuration/1000) + 's' : 'el tiempo'}.`,
      zh: `灼烧目标，在${skill.dotDuration ? (skill.dotDuration/1000) + '秒' : '持续时间'}内造成${skill.dotDamage || ''}点火焰伤害。`,
      hi: `लक्ष्य को जलाता है, ${skill.dotDuration ? (skill.dotDuration/1000) + ' सेकंड' : 'समय'} में ${skill.dotDamage || ''} अग्नि क्षति पहुँचाता है।`,
    },
    armor_break: {
      en: `Breaks the target's armor, reducing defense by ${skill.armorBreakPercent || skill.armorReduction || '?'}%.`,
      tr: `Hedefin zırhını kırar, savunmayı %${skill.armorBreakPercent || skill.armorReduction || '?'} azaltır.`,
      ru: `Ломает броню цели, снижая защиту на ${skill.armorBreakPercent || skill.armorReduction || '?'}%.`,
      ar: `يكسر درع الهدف، ويقلل الدفاع بنسبة ${skill.armorBreakPercent || skill.armorReduction || '?'}%.`,
      fr: `Brise l'armure de la cible, réduisant la défense de ${skill.armorBreakPercent || skill.armorReduction || '?'}%.`,
      es: `Rompe la armadura del objetivo, reduciendo la defensa en un ${skill.armorBreakPercent || skill.armorReduction || '?'}%.`,
      zh: `破坏目标的护甲，降低${skill.armorBreakPercent || skill.armorReduction || '?'}%防御力。`,
      hi: `लक्ष्य के कवच को तोड़ता है, रक्षा को ${skill.armorBreakPercent || skill.armorReduction || '?'}% कम करता है।`,
    },
    damage: {
      en: `Deals ${skill.damage || ''} bonus damage to the target.`,
      tr: `Hedefe ${skill.damage || ''} ek hasar verir.`,
      ru: `Наносит ${skill.damage || ''} дополнительного урона цели.`,
      ar: `يسبب ${skill.damage || ''} ضرر إضافي للهدف.`,
      fr: `Inflige ${skill.damage || ''} dégâts supplémentaires à la cible.`,
      es: `Causa ${skill.damage || ''} daño adicional al objetivo.`,
      zh: `对目标造成${skill.damage || ''}额外伤害。`,
      hi: `लक्ष्य को ${skill.damage || ''} अतिरिक्त क्षति पहुँचाता है।`,
    },
    critical: {
      en: `A powerful critical strike dealing ${skill.critMultiplier || skill.damageMultiplier || '?'}x damage.`,
      tr: `${skill.critMultiplier || skill.damageMultiplier || '?'}x hasar veren güçlü bir kritik vuruş.`,
      ru: `Мощный критический удар, наносящий ${skill.critMultiplier || skill.damageMultiplier || '?'}x урона.`,
      ar: `ضربة حرجة قوية تسبب ${skill.critMultiplier || skill.damageMultiplier || '?'}x ضرر.`,
      fr: `Un coup critique puissant infligeant ${skill.critMultiplier || skill.damageMultiplier || '?'}x dégâts.`,
      es: `Un golpe crítico poderoso que causa ${skill.critMultiplier || skill.damageMultiplier || '?'}x daño.`,
      zh: `强力暴击，造成${skill.critMultiplier || skill.damageMultiplier || '?'}倍伤害。`,
      hi: `एक शक्तिशाली क्रिटिकल स्ट्राइक जो ${skill.critMultiplier || skill.damageMultiplier || '?'}x क्षति पहुँचाती है।`,
    },
    enrage: {
      en: `Enrages when HP drops below ${skill.enrageThreshold || '?'}%, increasing damage significantly.`,
      tr: `HP %${skill.enrageThreshold || '?'}'in altına düştüğünde çıldırır, hasarı önemli ölçüde artırır.`,
      ru: `Впадает в ярость при HP ниже ${skill.enrageThreshold || '?'}%, значительно увеличивая урон.`,
      ar: `يغضب عندما ينخفض HP إلى أقل من ${skill.enrageThreshold || '?'}%، مما يزيد الضرر بشكل كبير.`,
      fr: `S'enrage lorsque les PV tombent en dessous de ${skill.enrageThreshold || '?'}%, augmentant considérablement les dégâts.`,
      es: `Se enfurece cuando los PV caen por debajo del ${skill.enrageThreshold || '?'}%, aumentando el daño significativamente.`,
      zh: `当生命值降至${skill.enrageThreshold || '?'}%以下时狂暴化，大幅提升伤害。`,
      hi: `जब HP ${skill.enrageThreshold || '?'}% से नीचे गिरता है तो क्रोधित हो जाता है, क्षति में काफी वृद्धि होती है।`,
    },
    combo: {
      en: `Strikes ${skill.hits || '?'} times in rapid succession.`,
      tr: `Hızla arka arkaya ${skill.hits || '?'} kez vurur.`,
      ru: `Наносит ${skill.hits || '?'} ударов подряд.`,
      ar: `يضرب ${skill.hits || '?'} مرات متتالية بسرعة.`,
      fr: `Frappe ${skill.hits || '?'} fois en succession rapide.`,
      es: `Golpea ${skill.hits || '?'} veces en rápida sucesión.`,
      zh: `连续快速攻击${skill.hits || '?'}次。`,
      hi: `तेज़ी से लगातार ${skill.hits || '?'} बार प्रहार करता है।`,
    },
    lifesteal: {
      en: `Drains ${skill.lifestealPercent || '?'}% of damage dealt as health.`,
      tr: `Verilen hasarın %${skill.lifestealPercent || '?'}'ini can olarak çalar.`,
      ru: `Похищает ${skill.lifestealPercent || '?'}% нанесённого урона в виде здоровья.`,
      ar: `يمتص ${skill.lifestealPercent || '?'}% من الضرر كصحة.`,
      fr: `Draine ${skill.lifestealPercent || '?'}% des dégâts infligés en points de vie.`,
      es: `Drena ${skill.lifestealPercent || '?'}% del daño causado como salud.`,
      zh: `将${skill.lifestealPercent || '?'}%造成的伤害转化为生命值。`,
      hi: `${skill.lifestealPercent || '?'}% क्षति को स्वास्थ्य के रूप में चुराता है।`,
    },
    lifesteal_burst: {
      en: `A powerful burst that steals health from the target, dealing x${skill.damageMultiplier || skill.critMultiplier || '?'} damage.`,
      tr: `Hedeften can çalan güçlü bir patlama, x${skill.damageMultiplier || skill.critMultiplier || '?'} hasar verir.`,
      ru: `Мощный удар, похищающий здоровье цели, наносящий x${skill.damageMultiplier || skill.critMultiplier || '?'} урона.`,
      ar: `انفجار قوي يسرق صحة الهدف، يسبب x${skill.damageMultiplier || skill.critMultiplier || '?'} ضرر.`,
      fr: `Une explosion puissante qui vole la vie de la cible, infligeant x${skill.damageMultiplier || skill.critMultiplier || '?'} dégâts.`,
      es: `Un estallido poderoso que roba salud del objetivo, causando x${skill.damageMultiplier || skill.critMultiplier || '?'} daño.`,
      zh: `强力爆发攻击，从目标处窃取生命值，造成x${skill.damageMultiplier || skill.critMultiplier || '?'}倍伤害。`,
      hi: `एक शक्तिशाली विस्फोट जो लक्ष्य से स्वास्थ्य चुराता है, x${skill.damageMultiplier || skill.critMultiplier || '?'} क्षति पहुँचाता है।`,
    },
    slow_crit: {
      en: `A slow but devastating critical strike dealing x${skill.damageMultiplier || skill.critMultiplier || '?'} damage.`,
      tr: `Yavaş ama yıkıcı bir kritik vuruş, x${skill.damageMultiplier || skill.critMultiplier || '?'} hasar verir.`,
      ru: `Медленный, но разрушительный критический удар, наносящий x${skill.damageMultiplier || skill.critMultiplier || '?'} урона.`,
      ar: `ضربة حرجة بطيئة لكن مدمرة تسبب x${skill.damageMultiplier || skill.critMultiplier || '?'} ضرر.`,
      fr: `Un coup critique lent mais dévastateur infligeant x${skill.damageMultiplier || skill.critMultiplier || '?'} dégâts.`,
      es: `Un golpe crítico lento pero devastador que causa x${skill.damageMultiplier || skill.critMultiplier || '?'} daño.`,
      zh: `缓慢但毁灭性的暴击，造成x${skill.damageMultiplier || skill.critMultiplier || '?'}倍伤害。`,
      hi: `धीमा लेकिन विनाशकारी क्रिटिकल स्ट्राइक, x${skill.damageMultiplier || skill.critMultiplier || '?'} क्षति पहुँचाता है।`,
    },
    heal: {
      en: `Heals ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} health points.`,
      tr: `${skill.healAmount || skill.healPercent ? '%' + skill.healPercent : '?'} can puanı iyileştirir.`,
      ru: `Восстанавливает ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} здоровья.`,
      ar: `يشفي ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} نقاط صحة.`,
      fr: `Soigne ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} points de vie.`,
      es: `Cura ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} puntos de salud.`,
      zh: `恢复${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'}生命值。`,
      hi: `${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} स्वास्थ्य अंक ठीक करता है।`,
    },
    groupHeal: {
      en: `Heals all party members for ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} health.`,
      tr: `Tüm parti üyelerinin ${skill.healAmount || skill.healPercent ? '%' + skill.healPercent : '?'} canını iyileştirir.`,
      ru: `Лечит всех членов группы на ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} здоровья.`,
      ar: `يشفي جميع أعضاء الفريق بنسبة ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} صحة.`,
      fr: `Soigne tous les membres du groupe de ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} points de vie.`,
      es: `Cura a todos los miembros del grupo por ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} salud.`,
      zh: `为所有队伍成员恢复${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'}生命值。`,
      hi: `सभी पार्टी सदस्यों का ${skill.healAmount || skill.healPercent ? skill.healPercent + '%' : '?'} स्वास्थ्य ठीक करता है।`,
    },
    buff: {
      en: `Boosts defense by ${skill.defenceBoost || skill.shieldAmount || '?'} for a short duration.`,
      tr: `Kısa süreliğine savunmayı ${skill.defenceBoost || skill.shieldAmount || '?'} artırır.`,
      ru: `Увеличивает защиту на ${skill.defenceBoost || skill.shieldAmount || '?'} на короткое время.`,
      ar: `يعزز الدفاع بمقدار ${skill.defenceBoost || skill.shieldAmount || '?'} لفترة قصيرة.`,
      fr: `Augmente la défense de ${skill.defenceBoost || skill.shieldAmount || '?'} pendant une courte durée.`,
      es: `Aumenta la defensa en ${skill.defenceBoost || skill.shieldAmount || '?'} por un corto tiempo.`,
      zh: `短时间内提升${skill.defenceBoost || skill.shieldAmount || '?'}点防御力。`,
      hi: `थोड़े समय के लिए रक्षा ${skill.defenceBoost || skill.shieldAmount || '?'} बढ़ाता है।`,
    },
    debuff: {
      en: `Weakens the target, reducing their combat effectiveness.`,
      tr: `Hedefi zayıflatır, savaş etkinliğini azaltır.`,
      ru: `Ослабляет цель, снижая её боевую эффективность.`,
      ar: `يضعف الهدف، مما يقلل من فعاليته القتالية.`,
      fr: `Affaiblit la cible, réduisant son efficacité au combat.`,
      es: `Debilita al objetivo, reduciendo su efectividad en combate.`,
      zh: `削弱目标，降低其战斗效率。`,
      hi: `लक्ष्य को कमजोर करता है, उसकी लड़ाई की क्षमता कम करता है।`,
    },
    aoe: {
      en: `Strikes all enemies in range, dealing damage to multiple targets.`,
      tr: `Menzildeki tüm düşmanlara saldırır, birden fazla hedefe hasar verir.`,
      ru: `Поражает всех врагов в радиусе, нанося урон нескольким целям.`,
      ar: `يضرب جميع الأعداء في المدى، ويسبب ضررًا لأهداف متعددة.`,
      fr: `Frappe tous les ennemis à portée, infligeant des dégâts à plusieurs cibles.`,
      es: `Golpea a todos los enemigos en rango, causando daño a múltiples objetivos.`,
      zh: `攻击范围内所有敌人，对多个目标造成伤害。`,
      hi: `रेंज में सभी दुश्मनों पर हमला करता है, कई लक्ष्यों को क्षति पहुँचाता है।`,
    },
    evasion_aura: {
      en: `Moves with unnatural speed. Hard to land a hit.`,
      tr: `Doğaüstü bir hızla hareket ediyor. İsabet ettirmek güç.`,
      ru: `Двигается со сверхъестественной скоростью. Трудно попасть.`,
      ar: `يتحرك بسرعة خارقة. من الصعب إصابته.`,
      fr: `Se déplace à une vitesse surnaturelle. Difficile à toucher.`,
      es: `Se mueve con una velocidad sobrenatural. Difícil de acertar.`,
      zh: `以超自然的速度移动。很难命中。`,
      hi: `अलौकिक गति से चलता है। निशाना लगाना कठिन है।`,
    },
    magic_shield: {
      en: `Surrounded by a magical barrier. Physical strikes feel weaker.`,
      tr: `Büyülü bir bariyer ile çevrili. Fiziksel vuruşlar zayıf kalıyor.`,
      ru: `Окружён магическим барьером. Физические удары ослаблены.`,
      ar: `محاط بحاجز سحري. الضربات الجسدية تبدو أضعف.`,
      fr: `Entouré d'une barrière magique. Les coups physiques semblent plus faibles.`,
      es: `Rodeado por una barrera mágica. Los golpes físicos se sienten más débiles.`,
      zh: `被魔法屏障包围。物理攻击的效果减弱了。`,
      hi: `जादुई अवरोध से घिरा हुआ। शारीरिक प्रहार कमज़ोर लगते हैं।`,
    },
    armor_repair: {
      en: `Its armor mends itself between blows. Gets tougher the longer you fight.`,
      tr: `Zırhı darbeler arasında kendini onarıyor. Savaş uzadıkça güçleniyor.`,
      ru: `Его броня восстанавливается между ударами. Чем дольше бой, тем крепче.`,
      ar: `درعه يرمم نفسه بين الضربات. يزداد صلابة كلما طال القتال.`,
      fr: `Son armure se répare entre les coups. Plus le combat dure, plus il devient résistant.`,
      es: `Su armadura se repara entre golpes. Se vuelve más resistente cuanto más dura la pelea.`,
      zh: `它的护甲在攻击间隙自我修复。战斗越久越坚韧。`,
      hi: `इसका कवच प्रहारों के बीच खुद को ठीक करता है। लड़ाई जितनी लंबी, उतना मज़बूत।`,
    },
    regenerate_on_no_stun: {
      en: `Regenerates health each turn. Seems vulnerable when interrupted.`,
      tr: `Her tur canını yeniliyor. Engellendiğinde savunmasız görünüyor.`,
      ru: `Восстанавливает здоровье каждый ход. Кажется уязвимым при прерывании.`,
      ar: `يجدد صحته كل دور. يبدو ضعيفًا عند مقاطعته.`,
      fr: `Régénère sa vie à chaque tour. Semble vulnérable quand il est interrompu.`,
      es: `Regenera salud cada turno. Parece vulnerable cuando es interrumpido.`,
      zh: `每回合恢复生命值。被打断时似乎很脆弱。`,
      hi: `हर मोड़ पर स्वास्थ्य पुनर्जीवित करता है। बाधित होने पर कमज़ोर दिखता है।`,
    },
    reflect_damage: {
      en: `Its body is covered in sharp edges. Hitting it hurts you too.`,
      tr: `Vücudu keskin yüzeylerle kaplı. Vurmak sizi de yaralıyor.`,
      ru: `Его тело покрыто острыми гранями. Удары ранят и вас.`,
      ar: `جسمه مغطى بحواف حادة. ضربه يؤذيك أيضًا.`,
      fr: `Son corps est couvert de bords tranchants. Le frapper vous blesse aussi.`,
      es: `Su cuerpo está cubierto de bordes afilados. Golpearlo también te hiere.`,
      zh: `它的身体布满锋利的棱角。攻击它也会伤到你。`,
      hi: `इसका शरीर तीखे किनारों से ढका है। इसे मारना आपको भी घायल करता है।`,
    },
  };

  const typeDescs = descriptions[skill.type];
  if (!typeDescs) return null;
  return typeDescs[language] || typeDescs['en'] || null;
}

export function SkillDetailPopup({ skill, variant = "badge", isMonsterSkill = false, children }: SkillDetailPopupProps) {
  const { t, language } = useLanguage();

  const translatedName = skill.nameTranslations?.[language] || skill.name;
  const translatedDesc = skill.descriptionTranslations?.[language];
  const colors = isMonsterSkill ? getMonsterSkillColors(skill.type) : getWeaponSkillColors(skill.type);
  const Icon = getSkillIcon(skill.type);

  const renderStats = () => {
    const stats: React.ReactNode[] = [];

    stats.push(
      <div key="chance" className="flex justify-between text-xs">
        <span className="text-muted-foreground">{t('chancePercent')}:</span>
        <span className={colors.text}>{skill.chance}%</span>
      </div>
    );

    if (skill.stunDuration) {
      stats.push(
        <div key="stun" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('stunTurns')}:</span>
          <span className="text-yellow-400">{skill.stunDuration}</span>
        </div>
      );
    }
    if (skill.stunCycles) {
      stats.push(
        <div key="stunCycles" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('stunTurns')}:</span>
          <span className="text-yellow-400">{skill.stunCycles}</span>
        </div>
      );
    }
    if (skill.damage) {
      stats.push(
        <div key="damage" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('damage')}:</span>
          <span className="text-red-400">+{skill.damage}</span>
        </div>
      );
    }
    if (skill.dotDamage) {
      stats.push(
        <div key="dot" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('damage')} (DoT):</span>
          <span className="text-orange-400">{skill.dotDamage}{skill.dotDuration ? ` / ${skill.dotDuration}${t('seconds')}` : ''}</span>
        </div>
      );
    }
    if (skill.healAmount) {
      stats.push(
        <div key="heal" className="flex justify-between text-xs">
          <span className="text-muted-foreground">HP:</span>
          <span className="text-green-400">+{skill.healAmount}</span>
        </div>
      );
    }
    if (skill.healPercent) {
      stats.push(
        <div key="healPct" className="flex justify-between text-xs">
          <span className="text-muted-foreground">HP:</span>
          <span className="text-green-400">+{skill.healPercent}%</span>
        </div>
      );
    }
    if (skill.lifestealPercent) {
      stats.push(
        <div key="ls" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('lifesteal')}:</span>
          <span className="text-rose-400">{skill.lifestealPercent}%</span>
        </div>
      );
    }
    if (skill.healPerTick) {
      stats.push(
        <div key="regen" className="flex justify-between text-xs">
          <span className="text-muted-foreground">HP/tick:</span>
          <span className="text-emerald-400">+{skill.healPerTick}</span>
        </div>
      );
    }
    if (skill.shieldAmount) {
      stats.push(
        <div key="shield" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('defence')}:</span>
          <span className="text-cyan-400">🛡️ {skill.shieldAmount}</span>
        </div>
      );
    }
    if (skill.defenceBoost) {
      stats.push(
        <div key="defBoost" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('defence')}:</span>
          <span className="text-blue-400">+{skill.defenceBoost}</span>
        </div>
      );
    }
    if (skill.armorReduction) {
      stats.push(
        <div key="armorRed" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('defence')}:</span>
          <span className="text-purple-400">-{skill.armorReduction}%</span>
        </div>
      );
    }
    if (skill.armorBreakPercent) {
      stats.push(
        <div key="armorBreak" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('defence')}:</span>
          <span className="text-orange-400">-{skill.armorBreakPercent}%</span>
        </div>
      );
    }
    if (skill.critMultiplier) {
      stats.push(
        <div key="critMult" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('critMultiplier')}:</span>
          <span className="text-red-400">x{skill.critMultiplier}</span>
        </div>
      );
    }
    if (skill.damageMultiplier) {
      stats.push(
        <div key="dmgMult" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('damage')}:</span>
          <span className="text-red-400">x{skill.damageMultiplier}</span>
        </div>
      );
    }
    if (skill.targets) {
      stats.push(
        <div key="targets" className="flex justify-between text-xs">
          <span className="text-muted-foreground">Targets:</span>
          <span className="text-orange-400">{skill.targets}x</span>
        </div>
      );
    }
    if (skill.hits) {
      stats.push(
        <div key="hits" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('consecutiveHits')}:</span>
          <span className="text-pink-400">{skill.hits}x</span>
        </div>
      );
    }
    if (skill.healingReduction) {
      stats.push(
        <div key="healRed" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('healingReduced')}:</span>
          <span className="text-red-400">{(skill.healingReduction * 100)}%</span>
        </div>
      );
    }
    if (skill.enrageThreshold) {
      stats.push(
        <div key="enrage" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('belowHpActive')}:</span>
          <span className="text-purple-400">HP {skill.enrageThreshold}%</span>
        </div>
      );
    }
    if (skill.duration) {
      stats.push(
        <div key="dur" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('seconds')}:</span>
          <span className="text-muted-foreground">{(skill.duration / 1000).toFixed(0)}s</span>
        </div>
      );
    }
    if (skill.slowMultiplier) {
      stats.push(
        <div key="slow" className="flex justify-between text-xs">
          <span className="text-muted-foreground">Slow:</span>
          <span className="text-purple-400">x{skill.slowMultiplier}</span>
        </div>
      );
    }
    if (skill.poisonDamage && !skill.dotDamage) {
      stats.push(
        <div key="poison" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('damage')} (☠):</span>
          <span className="text-green-400">{skill.poisonDamage}{skill.poisonDuration ? ` / ${(skill.poisonDuration / 1000).toFixed(0)}s` : ''}</span>
        </div>
      );
    }
    if (skill.burnDamage && !skill.dotDamage) {
      stats.push(
        <div key="burn" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('damage')} (🔥):</span>
          <span className="text-orange-400">{skill.burnDamage}{skill.burnDuration ? ` / ${(skill.burnDuration / 1000).toFixed(0)}s` : ''}</span>
        </div>
      );
    }
    if (skill.ignoreDefence) {
      stats.push(
        <div key="ignDef" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('defence')} ✖:</span>
          <span className="text-yellow-400">-{skill.ignoreDefence}%</span>
        </div>
      );
    }
    if (skill.debuff === 'slow' && skill.debuffDuration) {
      stats.push(
        <div key="debuffSlow" className="flex justify-between text-xs">
          <span className="text-muted-foreground">Slow:</span>
          <span className="text-purple-400">{(skill.debuffDuration / 1000).toFixed(0)}s</span>
        </div>
      );
    }
    if (skill.lootBonus) {
      stats.push(
        <div key="lootBonus" className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('loot_chance')}:</span>
          <span className="text-amber-400">+{skill.lootBonus}%</span>
        </div>
      );
    }

    return stats;
  };

  const popoverContent = (
    <PopoverContent side="bottom" align="start" sideOffset={8} collisionPadding={16} className="w-56 p-3">
      <div className="space-y-2">
        <div className={cn("font-bold text-sm flex items-center gap-2", colors.text)}>
          <Icon className="w-5 h-5" weight="fill" />
          {translatedName}
        </div>
        {(() => {
          const desc = translatedDesc || getAutoSkillDescription(skill, language);
          return desc ? (
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          ) : null;
        })()}
        <div className="space-y-1 pt-1 border-t border-border/30">
          {renderStats()}
        </div>
      </div>
    </PopoverContent>
  );

  if (children) {
    return (
      <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        {popoverContent}
      </Popover>
    );
  }

  if (variant === "icon") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-10 h-10 min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center border-2 transition-all active:scale-95 hover:scale-110 shadow-sm cursor-pointer",
              colors.bg, colors.border, colors.text
            )}
            data-testid={`skill-icon-${skill.type}`}
          >
            <Icon className="w-4.5 h-4.5" weight="fill" />
          </button>
        </PopoverTrigger>
        {popoverContent}
      </Popover>
    );
  }

  if (variant === "inline") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-md border cursor-pointer hover:brightness-125 transition-all",
              isMonsterSkill
                ? "bg-red-500/15 text-red-300 border-red-500/20"
                : cn(colors.bg, colors.text, "border-border/20")
            )}
            data-testid={`skill-inline-${skill.type}`}
          >
            {translatedName}
          </span>
        </PopoverTrigger>
        {popoverContent}
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "px-2.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:brightness-125 transition-all",
            colors.bg, colors.text
          )}
          data-testid={`skill-badge-${skill.type}`}
        >
          <Icon className="w-3.5 h-3.5" weight="fill" />
          <span>{translatedName}</span>
          <span className="opacity-70">({skill.chance}%)</span>
        </button>
      </PopoverTrigger>
      {popoverContent}
    </Popover>
  );
}
