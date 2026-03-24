import { useState, useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash, Plus, CaretDown, CaretRight, Upload } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";

interface ItemEditorProps {
  item: any | null;
  isCreating: boolean;
  onSave: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
  regions: any[];
  allItems: any[];
  adminKey: string;
  allMonsters: any[];
  getAdminHeaders: (key: string) => Promise<Record<string, string>>;
  staffRole?: string | null;
}

const ITEM_TYPES = ["material", "equipment", "food", "potion", "misc"];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const EQUIP_SLOTS = ["weapon", "helmet", "body", "legs", "boots", "gloves", "cape", "ring", "amulet", "shield"];
const WEAPON_CATEGORIES = ["dagger", "sword", "axe", "hammer", "bow", "staff", "2h_sword", "2h_axe", "2h_warhammer"];
const WEAPON_TYPES = ["sword_shield", "dagger", "2h_sword", "2h_axe", "2h_warhammer", "bow", "staff"];
const ARMOR_TYPES = ["plate", "leather", "cloth"];
const ARMOR_SLOTS = ["helmet", "body", "legs", "boots", "gloves", "cape"];
const STAFF_TYPES = ["dps", "healer"];
const BUFF_TYPES = ["damage", "defence", "speed"];
const WEAPON_SKILL_TYPES = ["critical_strike", "poison", "burn", "bleed", "lifedrain", "stun", "armor_break", "damage_boost", "combo_attack", "double_strike", "execute", "slow"];
const DAMAGE_TYPES = ["flat", "percent"];
const EFFECT_TYPES = ["attack_boost", "strength_boost", "defence_boost", "hp_regen", "maxHpBoost", "crit_chance", "damage_reduction", "xp_boost", "poison_immunity", "lifesteal"];
const LANGUAGES = ["en", "tr", "ru", "ar", "fr", "es", "zh", "hi"];
const LANGUAGE_LABELS: Record<string, string> = { en: "English", tr: "Turkish", ru: "Russian", ar: "Arabic", fr: "French", es: "Spanish", zh: "Chinese", hi: "Hindi" };

const RARITY_VENDOR_PRICES: Record<string, number> = {
  common: 5, uncommon: 25, rare: 100, epic: 500, legendary: 2500
};

const SKILL_TYPE_FIELDS: Record<string, string[]> = {
  critical_strike: ["damage", "damageType"],
  poison: ["damage", "duration"],
  burn: ["damage", "duration"],
  bleed: ["damage", "duration"],
  lifedrain: ["value"],
  stun: ["duration"],
  armor_break: ["value", "duration"],
  damage_boost: ["value", "duration"],
  combo_attack: ["damage"],
  double_strike: ["damage"],
  execute: ["value"],
  slow: ["value", "duration"],
};

interface WeaponSkillForm {
  id: string;
  name: string;
  type: string;
  chance: number;
  damageType: string;
  damage: number;
  value: number;
  duration: number;
  description: string;
}

function emptyWeaponSkill(): WeaponSkillForm {
  return { id: "", name: "", type: "critical_strike", chance: 0, damageType: "flat", damage: 0, value: 0, duration: 0, description: "" };
}

export default function ItemEditor({ item, isCreating, onSave, onCancel, saving, regions, allItems, adminKey, allMonsters, getAdminHeaders, staffRole }: ItemEditorProps) {
  const [isDraft, setIsDraft] = useState(0);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("material");
  const [rarity, setRarity] = useState("common");
  const [vendorPrice, setVendorPrice] = useState(0);
  const [levelRequired, setLevelRequired] = useState(0);
  const [skillRequired, setSkillRequired] = useState("");
  const [masteryRequired, setMasteryRequired] = useState(1);
  const [icon, setIcon] = useState("");
  const [equipSlot, setEquipSlot] = useState("");
  const [weaponCategory, setWeaponCategory] = useState("");
  const [weaponType, setWeaponType] = useState("");
  const [armorType, setArmorType] = useState("");
  const [staffType, setStaffType] = useState("");

  const [attackBonus, setAttackBonus] = useState(0);
  const [strengthBonus, setStrengthBonus] = useState(0);
  const [defenceBonus, setDefenceBonus] = useState(0);
  const [accuracyBonus, setAccuracyBonus] = useState(0);
  const [hitpointsBonus, setHitpointsBonus] = useState(0);
  const [critChance, setCritChance] = useState(0);
  const [critDamage, setCritDamage] = useState(0);
  const [lifestealPercent, setLifestealPercent] = useState(0);
  const [attackSpeedMs, setAttackSpeedMs] = useState(0);
  const [healPower, setHealPower] = useState(0);
  const [buffPower, setBuffPower] = useState(0);
  const [buffType, setBuffType] = useState("");
  const [aggroModifier, setAggroModifier] = useState(0);
  const [skillDamageBonus, setSkillDamageBonus] = useState(0);
  const [attackSpeedBonus, setAttackSpeedBonus] = useState(0);
  const [healingReceivedBonus, setHealingReceivedBonus] = useState(0);
  const [onHitHealingPercent, setOnHitHealingPercent] = useState(0);
  const [buffDurationBonus, setBuffDurationBonus] = useState(0);
  const [partyDpsBuff, setPartyDpsBuff] = useState(0);
  const [partyDefenceBuff, setPartyDefenceBuff] = useState(0);
  const [partyAttackSpeedBuff, setPartyAttackSpeedBuff] = useState(0);
  const [lootChanceBonus, setLootChanceBonus] = useState(0);

  const [salvageMinScrap, setSalvageMinScrap] = useState(0);
  const [salvageMaxScrap, setSalvageMaxScrap] = useState(0);

  const [weaponSkills, setWeaponSkills] = useState<WeaponSkillForm[]>([]);

  const [healAmount, setHealAmount] = useState(0);

  const [duration, setDuration] = useState(0);
  const [effectType, setEffectType] = useState("attack_boost");
  const [effectValue, setEffectValue] = useState(0);
  const [effectPercentage, setEffectPercentage] = useState(false);

  const [nameTranslations, setNameTranslations] = useState<Record<string, string>>({});
  const [descriptionTranslations, setDescriptionTranslations] = useState<Record<string, string>>({});
  const isTranslator = staffRole === 'translator';
  const [translationsOpen, setTranslationsOpen] = useState(isTranslator);

  const [vendorPriceManuallySet, setVendorPriceManuallySet] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 2MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const ext = file.name.substring(file.name.lastIndexOf('.'));
      const sanitizedId = (id || 'item').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${sanitizedId}_${Date.now()}${ext}`;

      const response = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: { ...(await getAdminHeaders(adminKey)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: base64, fileName, folder: 'items' }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }

      const result = await response.json();
      setIcon(result.path);
      toast({ title: "Image uploaded", description: `Saved to ${result.path}` });
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAutoTranslate = async () => {
    if (!name) return;
    setTranslating(true);
    try {
      const texts: { key: string; value: string }[] = [
        { key: "name", value: name },
      ];
      if (description) {
        texts.push({ key: "description", value: description });
      }
      weaponSkills.forEach((skill, idx) => {
        if (skill.description) {
          texts.push({ key: `weaponSkill_${idx}_description`, value: skill.description });
        }
      });

      const targetLanguages = ["tr", "ru", "ar", "fr", "es", "zh", "hi"];
      const response = await fetch('/api/admin/translate', {
        method: 'POST',
        headers: { ...(await getAdminHeaders(adminKey)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, targetLanguages }),
      });

      if (!response.ok) throw new Error('Translation failed');
      const result = await response.json();
      const translations = result.translations;

      if (translations.name) {
        setNameTranslations(prev => {
          const updated = { ...prev };
          for (const lang of targetLanguages) {
            if (!updated[lang] && translations.name[lang]) {
              updated[lang] = translations.name[lang];
            }
          }
          return updated;
        });
      }

      if (translations.description) {
        setDescriptionTranslations(prev => {
          const updated = { ...prev };
          for (const lang of targetLanguages) {
            if (!updated[lang] && translations.description[lang]) {
              updated[lang] = translations.description[lang];
            }
          }
          return updated;
        });
      }

      setTranslationsOpen(true);
      toast({ title: "Translations filled", description: "Empty translation fields have been auto-filled." });
    } catch (error) {
      toast({ title: "Translation failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  const suggestedVendorPrice = useMemo(() => {
    const base = RARITY_VENDOR_PRICES[rarity] || 5;
    return base * Math.max(1, Math.floor(levelRequired / 10));
  }, [rarity, levelRequired]);

  const isDuplicateId = useMemo(() => {
    if (!isCreating || !id) return false;
    return allItems.some((item: any) => item.id === id);
  }, [isCreating, id, allItems]);

  const droppingMonsters = useMemo(() => {
    if (!id || !allMonsters) return [];
    return allMonsters.filter((m: any) => {
      const lootData = typeof m.loot === "string" ? JSON.parse(m.loot) : (m.loot || []);
      return lootData.some((l: any) => l.itemId === id);
    }).map((m: any) => {
      const lootData = typeof m.loot === "string" ? JSON.parse(m.loot) : (m.loot || []);
      const entry = lootData.find((l: any) => l.itemId === id);
      return {
        name: m.name || m.id,
        regionId: m.regionId || "",
        chance: entry ? (entry.chance * 100) : 0,
      };
    });
  }, [id, allMonsters]);

  const getDuplicateSkillIds = (skills: WeaponSkillForm[], currentIdx: number): boolean => {
    const currentId = skills[currentIdx]?.id;
    if (!currentId) return false;
    return skills.some((s, i) => i !== currentIdx && s.id === currentId);
  };

  useEffect(() => {
    if (item) {
      setIsDraft(item.isDraft || 0);
      setId(item.id || "");
      setName(item.name || "");
      setDescription(item.description || "");
      setType(item.type || "material");
      setRarity(item.rarity || "common");
      setVendorPrice(item.vendorPrice || 0);
      setLevelRequired(item.levelRequired || 0);
      setSkillRequired(item.skillRequired || "");
      setMasteryRequired(item.masteryRequired || 1);
      setIcon(item.icon || "");
      setEquipSlot(item.equipSlot || "");
      setWeaponCategory(item.weaponCategory || "");
      setWeaponType(item.weaponType || "");
      setArmorType(item.armorType || "");
      setStaffType(item.staffType || "");
      setVendorPriceManuallySet(true);

      const stats = typeof item.stats === "string" ? JSON.parse(item.stats) : (item.stats || {});
      setAttackBonus(stats.attackBonus || 0);
      setStrengthBonus(stats.strengthBonus || 0);
      setDefenceBonus(stats.defenceBonus || 0);
      setAccuracyBonus(stats.accuracyBonus || 0);
      setHitpointsBonus(stats.hitpointsBonus || 0);

      setCritChance(item.critChance || 0);
      setCritDamage(item.critDamage || 0);
      setLifestealPercent(item.lifestealPercent || 0);
      setAttackSpeedMs(item.attackSpeedMs || 0);
      setHealPower(item.healPower || 0);
      setBuffPower(item.buffPower || 0);
      setBuffType(item.buffType || "");
      setAggroModifier(item.aggroModifier || 0);
      setSkillDamageBonus(item.skillDamageBonus || 0);
      setAttackSpeedBonus(item.attackSpeedBonus || 0);
      setHealingReceivedBonus(item.healingReceivedBonus || 0);
      setOnHitHealingPercent(item.onHitHealingPercent || 0);
      setBuffDurationBonus(item.buffDurationBonus || 0);
      setPartyDpsBuff(item.partyDpsBuff || 0);
      setPartyDefenceBuff(item.partyDefenceBuff || 0);
      setPartyAttackSpeedBuff(item.partyAttackSpeedBuff || 0);
      setLootChanceBonus(item.lootChanceBonus || 0);

      const so = typeof item.salvageOverride === "string" ? JSON.parse(item.salvageOverride) : (item.salvageOverride || {});
      setSalvageMinScrap(so.minScrap || 0);
      setSalvageMaxScrap(so.maxScrap || 0);

      const ws = typeof item.weaponSkills === "string" ? JSON.parse(item.weaponSkills) : (item.weaponSkills || []);
      setWeaponSkills(ws.map((s: any) => ({
        id: s.id || "",
        name: s.name || "",
        type: s.type || "critical_strike",
        chance: s.chance || 0,
        damageType: s.damageType || "flat",
        damage: s.damage || 0,
        value: s.value || 0,
        duration: s.duration || 0,
        description: s.description || "",
      })));

      setHealAmount(item.healAmount || 0);
      setDuration(item.duration || 0);

      const eff = typeof item.effect === "string" ? JSON.parse(item.effect) : (item.effect || {});
      setEffectType(eff.type || "attack_boost");
      setEffectValue(eff.value || 0);
      setEffectPercentage(eff.percentage || false);

      const nt = typeof item.nameTranslations === "string" ? JSON.parse(item.nameTranslations) : (item.nameTranslations || {});
      setNameTranslations(nt);
      const dt = typeof item.descriptionTranslations === "string" ? JSON.parse(item.descriptionTranslations) : (item.descriptionTranslations || {});
      setDescriptionTranslations(dt);
      if (Object.keys(nt).length > 0 || Object.keys(dt).length > 0) {
        setTranslationsOpen(true);
      }
    }
  }, [item]);

  useEffect(() => {
    if (!vendorPriceManuallySet) {
      setVendorPrice(suggestedVendorPrice);
    }
  }, [suggestedVendorPrice, vendorPriceManuallySet]);

  const handleSave = () => {
    const statsObj: Record<string, number> = {};
    if (attackBonus) statsObj.attackBonus = attackBonus;
    if (strengthBonus) statsObj.strengthBonus = strengthBonus;
    if (defenceBonus) statsObj.defenceBonus = defenceBonus;
    if (accuracyBonus) statsObj.accuracyBonus = accuracyBonus;
    if (hitpointsBonus) statsObj.hitpointsBonus = hitpointsBonus;

    const data: any = {
      id,
      name,
      description,
      type,
      isDraft,
      rarity,
      vendorPrice: vendorPrice || 0,
      levelRequired: levelRequired || 0,
      skillRequired: skillRequired || null,
      masteryRequired: masteryRequired || 1,
      icon: icon || null,
      equipSlot: type === "equipment" ? (equipSlot || null) : null,
      weaponCategory: type === "equipment" && equipSlot === "weapon" ? (weaponCategory || null) : null,
      weaponType: type === "equipment" && equipSlot === "weapon" ? (weaponType || null) : null,
      armorType: type === "equipment" && equipSlot !== "weapon" && ARMOR_SLOTS.includes(equipSlot) ? (armorType || null) : null,
      staffType: type === "equipment" && weaponCategory === "staff" ? (staffType || null) : null,
      stats: Object.keys(statsObj).length > 0 ? statsObj : null,
      critChance: critChance || 0,
      critDamage: critDamage || 0,
      lifestealPercent: lifestealPercent || 0,
      attackSpeedMs: attackSpeedMs || null,
      healPower: healPower || 0,
      buffPower: buffPower || 0,
      buffType: buffPower > 0 ? (buffType || null) : null,
      aggroModifier: aggroModifier || 0,
      skillDamageBonus: skillDamageBonus || 0,
      attackSpeedBonus: attackSpeedBonus || 0,
      healingReceivedBonus: healingReceivedBonus || 0,
      onHitHealingPercent: onHitHealingPercent || 0,
      buffDurationBonus: buffDurationBonus || 0,
      partyDpsBuff: partyDpsBuff || 0,
      partyDefenceBuff: partyDefenceBuff || 0,
      partyAttackSpeedBuff: partyAttackSpeedBuff || 0,
      lootChanceBonus: lootChanceBonus || 0,
      weaponSkills: type === "equipment" && equipSlot === "weapon" ? weaponSkills.map(s => {
        const skill: any = { id: s.id, name: s.name, type: s.type, chance: s.chance };
        if (s.damageType) skill.damageType = s.damageType;
        if (s.damage) skill.damage = s.damage;
        if (s.value) skill.value = s.value;
        if (s.duration) skill.duration = s.duration;
        if (s.description) skill.description = s.description;
        return skill;
      }) : [],
      healAmount: type === "food" ? (healAmount || 0) : null,
      duration: type === "potion" ? (duration || 0) : null,
      effect: type === "potion" ? { type: effectType, value: effectValue, percentage: effectPercentage } : null,
      nameTranslations: Object.keys(nameTranslations).length > 0 ? nameTranslations : {},
      descriptionTranslations: Object.keys(descriptionTranslations).length > 0 ? descriptionTranslations : {},
      salvageOverride: (salvageMinScrap > 0 || salvageMaxScrap > 0) ? { minScrap: salvageMinScrap, maxScrap: salvageMaxScrap } : null,
    };

    onSave(data);
  };

  const updateWeaponSkill = (index: number, field: keyof WeaponSkillForm, value: any) => {
    setWeaponSkills(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addWeaponSkill = () => {
    setWeaponSkills(prev => [...prev, emptyWeaponSkill()]);
  };

  const removeWeaponSkill = (index: number) => {
    setWeaponSkills(prev => prev.filter((_, i) => i !== index));
  };

  const selectClass = "flex h-10 w-full rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const inputClass = "bg-zinc-800 border-zinc-600 text-white";
  const labelClass = "text-sm font-medium text-zinc-300 mb-1 block";
  const cardClass = "bg-zinc-900 border-zinc-700";

  const hasDuplicateSkillId = weaponSkills.some((_, idx) => getDuplicateSkillIds(weaponSkills, idx));
  const saveDisabled = saving || !id || !name || isDuplicateId || hasDuplicateSkillId || (isCreating && isTranslator);

  return (
    <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-2" data-testid="item-editor">
      {!isTranslator && (<>
      <Card className={cardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`flex items-center gap-3 p-3 rounded-md border ${isDraft ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-green-500/50 bg-green-500/10'}`}>
            <div className="flex items-center gap-3 w-full">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${isDraft ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40' : 'bg-green-500/20 text-green-400 border border-green-500/40'}`}>
                {isDraft ? 'DRAFT' : 'LIVE'}
              </span>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  data-testid="checkbox-is-draft"
                  type="checkbox"
                  checked={isDraft === 1}
                  onChange={e => setIsDraft(e.target.checked ? 1 : 0)}
                  className="w-4 h-4 rounded border-input"
                />
                <span className="font-medium text-zinc-300">Mark as Draft</span>
              </label>
              <span className="text-xs text-zinc-500 ml-auto">{isDraft ? 'Only testers can see this item' : 'Everyone can see this item'}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>ID</label>
              <Input
                data-testid="input-item-id"
                value={id}
                onChange={e => setId(e.target.value)}
                disabled={!isCreating}
                placeholder="item_id"
                className={`${inputClass} ${isDuplicateId ? 'border-red-500 ring-1 ring-red-500' : ''}`}
              />
              {isDuplicateId && (
                <p className="text-red-500 text-xs mt-1 font-medium" data-testid="text-duplicate-id-error">✕ ID already exists</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Name</label>
              <Input
                data-testid="input-item-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Item Name"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              data-testid="input-item-description"
              className="flex w-full rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[60px] resize-y"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Item description..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Type</label>
              <select
                data-testid="select-item-type"
                className={selectClass}
                value={type}
                onChange={e => setType(e.target.value)}
              >
                {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Skill Required</label>
              <Input
                data-testid="input-skill-required"
                value={skillRequired}
                onChange={e => setSkillRequired(e.target.value)}
                placeholder="e.g. attack, defence"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Vendor Price</label>
              <Input
                data-testid="input-vendor-price"
                type="number"
                value={vendorPrice}
                onChange={e => {
                  setVendorPrice(Number(e.target.value));
                  setVendorPriceManuallySet(true);
                }}
                className={inputClass}
              />
              <p className="text-xs text-zinc-500 mt-1">Suggested: {suggestedVendorPrice}</p>
            </div>
            <div>
              <label className={labelClass}>Level Required</label>
              <Input
                data-testid="input-level-required"
                type="number"
                value={levelRequired}
                onChange={e => {
                  setLevelRequired(Number(e.target.value));
                  if (!vendorPriceManuallySet) {
                    setVendorPrice(RARITY_VENDOR_PRICES[rarity] * Math.max(1, Math.floor(Number(e.target.value) / 10)));
                  }
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Mastery Required</label>
              <Input
                data-testid="input-mastery-required"
                type="number"
                value={masteryRequired}
                onChange={e => setMasteryRequired(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Icon / Image</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className={labelClass}>Icon Path</label>
            <div className="flex gap-2">
              <Input
                data-testid="input-icon"
                value={icon}
                onChange={e => setIcon(e.target.value)}
                placeholder="/images/items/example.webp"
                className={`${inputClass} flex-1`}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                data-testid="input-file-upload"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                data-testid="button-upload-icon"
                className="shrink-0"
              >
                <Upload className="w-4 h-4 mr-1" />
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
          {icon && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">Preview:</span>
              <img
                src={icon}
                alt="Icon preview"
                className="w-12 h-12 object-contain rounded border border-zinc-700 bg-zinc-800"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                data-testid="img-icon-preview"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Monster Drops</CardTitle>
        </CardHeader>
        <CardContent>
          {droppingMonsters.length === 0 ? (
            <p className="text-zinc-500 text-sm" data-testid="text-no-monster-drops">No monsters currently drop this item</p>
          ) : (
            <div className="space-y-1" data-testid="list-monster-drops">
              {droppingMonsters.map((m, i) => (
                <div key={i} className="text-sm text-zinc-300" data-testid={`monster-drop-${i}`}>
                  {m.name} ({m.regionId}) - Chance: {m.chance.toFixed(1)}%
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {type === "equipment" && (
        <Card className={cardClass}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Equipment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={`grid ${equipSlot === "weapon" ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              <div>
                <label className={labelClass}>Equip Slot</label>
                <select
                  data-testid="select-equip-slot"
                  className={selectClass}
                  value={equipSlot}
                  onChange={e => setEquipSlot(e.target.value)}
                >
                  <option value="">-- Select --</option>
                  {EQUIP_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {equipSlot === "weapon" && (
                <div>
                  <label className={labelClass}>Weapon Type</label>
                  <select
                    data-testid="select-weapon-type"
                    className={selectClass}
                    value={weaponType}
                    onChange={e => setWeaponType(e.target.value)}
                  >
                    <option value="">-- Select --</option>
                    {WEAPON_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              )}
            </div>
            {equipSlot === "weapon" && (
              <div className={`grid ${weaponCategory === "staff" ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                <div>
                  <label className={labelClass}>Weapon Category</label>
                  <select
                    data-testid="select-weapon-category"
                    className={selectClass}
                    value={weaponCategory}
                    onChange={e => setWeaponCategory(e.target.value)}
                  >
                    <option value="">-- Select --</option>
                    {WEAPON_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {weaponCategory === "staff" && (
                  <div>
                    <label className={labelClass}>Staff Type</label>
                    <select
                      data-testid="select-staff-type"
                      className={selectClass}
                      value={staffType}
                      onChange={e => setStaffType(e.target.value)}
                    >
                      <option value="">-- Select --</option>
                      {STAFF_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            {equipSlot && equipSlot !== "weapon" && ARMOR_SLOTS.includes(equipSlot) && (
              <div>
                <label className={labelClass}>Armor Type</label>
                <select
                  data-testid="select-armor-type"
                  className={selectClass}
                  value={armorType}
                  onChange={e => setArmorType(e.target.value)}
                >
                  <option value="">-- Select --</option>
                  {ARMOR_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {type === "equipment" && (
        <Card className={cardClass}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Combat Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-2">Offensive</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Attack Bonus", value: attackBonus, set: setAttackBonus, tid: "input-attack-bonus" },
                  { label: "Strength Bonus", value: strengthBonus, set: setStrengthBonus, tid: "input-strength-bonus" },
                  { label: "Accuracy Bonus", value: accuracyBonus, set: setAccuracyBonus, tid: "input-accuracy-bonus" },
                  { label: "Crit Chance (%)", value: critChance, set: setCritChance, tid: "input-crit-chance" },
                  { label: "Crit Damage (%)", value: critDamage, set: setCritDamage, tid: "input-crit-damage" },
                  { label: "Skill Damage (%)", value: skillDamageBonus, set: setSkillDamageBonus, tid: "input-skill-damage-bonus" },
                  { label: "Attack Speed (ms)", value: attackSpeedMs, set: setAttackSpeedMs, tid: "input-attack-speed" },
                  { label: "Attack Speed Bonus (%)", value: attackSpeedBonus, set: setAttackSpeedBonus, tid: "input-attack-speed-bonus" },
                  { label: "Lifesteal (%)", value: lifestealPercent, set: setLifestealPercent, tid: "input-lifesteal" },
                ].map(({ label, value, set, tid }) => (
                  <div key={tid}>
                    <label className={labelClass}>{label}</label>
                    <Input data-testid={tid} type="number" value={value} onChange={e => set(Number(e.target.value))} className={inputClass} />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-700 pt-4">
              <p className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-2">Defensive</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Defence Bonus", value: defenceBonus, set: setDefenceBonus, tid: "input-defence-bonus" },
                  { label: "Hitpoints Bonus", value: hitpointsBonus, set: setHitpointsBonus, tid: "input-hitpoints-bonus" },
                  { label: "Aggro Modifier", value: aggroModifier, set: setAggroModifier, tid: "input-aggro-modifier" },
                  { label: "Healing Received (%)", value: healingReceivedBonus, set: setHealingReceivedBonus, tid: "input-healing-received-bonus" },
                  { label: "On-Hit Healing (%)", value: onHitHealingPercent, set: setOnHitHealingPercent, tid: "input-on-hit-healing" },
                ].map(({ label, value, set, tid }) => (
                  <div key={tid}>
                    <label className={labelClass}>{label}</label>
                    <Input data-testid={tid} type="number" value={value} onChange={e => set(Number(e.target.value))} className={inputClass} />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-700 pt-4">
              <p className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-2">Party Buffs</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Party DPS Buff (%)", value: partyDpsBuff, set: setPartyDpsBuff, tid: "input-party-dps-buff" },
                  { label: "Party Defence Buff (%)", value: partyDefenceBuff, set: setPartyDefenceBuff, tid: "input-party-defence-buff" },
                  { label: "Party Attack Speed (%)", value: partyAttackSpeedBuff, set: setPartyAttackSpeedBuff, tid: "input-party-attack-speed-buff" },
                ].map(({ label, value, set, tid }) => (
                  <div key={tid}>
                    <label className={labelClass}>{label}</label>
                    <Input data-testid={tid} type="number" value={value} onChange={e => set(Number(e.target.value))} className={inputClass} />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-700 pt-4">
              <p className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-2">Special</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Heal Power", value: healPower, set: setHealPower, tid: "input-heal-power" },
                  { label: "Buff Power", value: buffPower, set: setBuffPower, tid: "input-buff-power" },
                  { label: "Buff Duration (%)", value: buffDurationBonus, set: setBuffDurationBonus, tid: "input-buff-duration-bonus" },
                  { label: "Loot Chance (%)", value: lootChanceBonus, set: setLootChanceBonus, tid: "input-loot-chance-bonus" },
                ].map(({ label, value, set, tid }) => (
                  <div key={tid}>
                    <label className={labelClass}>{label}</label>
                    <Input data-testid={tid} type="number" value={value} onChange={e => set(Number(e.target.value))} className={inputClass} />
                  </div>
                ))}
              </div>
              {buffPower > 0 && (
                <div className="mt-3">
                  <label className={labelClass}>Buff Type</label>
                  <select
                    data-testid="select-buff-type"
                    className={selectClass}
                    value={buffType}
                    onChange={e => setBuffType(e.target.value)}
                  >
                    <option value="">-- Select --</option>
                    {BUFF_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {type === "equipment" && equipSlot === "weapon" && (
        <Card className={cardClass}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Weapon Skills</span>
              <Button
                data-testid="button-add-weapon-skill"
                variant="outline"
                size="sm"
                onClick={addWeaponSkill}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Skill
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {weaponSkills.length === 0 && (
              <p className="text-sm text-zinc-500">No weapon skills defined.</p>
            )}
            {weaponSkills.map((skill, idx) => {
              const skillFields = SKILL_TYPE_FIELDS[skill.type] || [];
              const isSkillIdDuplicate = getDuplicateSkillIds(weaponSkills, idx);
              return (
                <div key={idx} className="border border-zinc-700 rounded-lg p-3 space-y-2 bg-zinc-800/50" data-testid={`weapon-skill-${idx}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-300">Skill #{idx + 1}</span>
                    <Button
                      data-testid={`button-remove-weapon-skill-${idx}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => removeWeaponSkill(idx)}
                    >
                      <Trash className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>ID</label>
                      <Input
                        data-testid={`input-ws-id-${idx}`}
                        value={skill.id}
                        onChange={e => updateWeaponSkill(idx, "id", e.target.value)}
                        placeholder="skill_id"
                        className={`${inputClass} ${isSkillIdDuplicate ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                      />
                      {isSkillIdDuplicate && (
                        <p className="text-red-500 text-xs mt-1 font-medium" data-testid={`text-duplicate-ws-id-${idx}`}>✕ Duplicate skill ID</p>
                      )}
                    </div>
                    <div>
                      <label className={labelClass}>Name</label>
                      <Input
                        data-testid={`input-ws-name-${idx}`}
                        value={skill.name}
                        onChange={e => updateWeaponSkill(idx, "name", e.target.value)}
                        placeholder="Skill Name"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Type</label>
                      <select
                        data-testid={`select-ws-type-${idx}`}
                        className={selectClass}
                        value={skill.type}
                        onChange={e => updateWeaponSkill(idx, "type", e.target.value)}
                      >
                        {WEAPON_SKILL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Chance (%)</label>
                      <Input
                        data-testid={`input-ws-chance-${idx}`}
                        type="number"
                        value={skill.chance}
                        onChange={e => updateWeaponSkill(idx, "chance", Number(e.target.value))}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {skillFields.includes("damageType") && (
                      <div>
                        <label className={labelClass}>Damage Type</label>
                        <select
                          data-testid={`select-ws-damage-type-${idx}`}
                          className={selectClass}
                          value={skill.damageType}
                          onChange={e => updateWeaponSkill(idx, "damageType", e.target.value)}
                        >
                          {DAMAGE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    )}
                    {skillFields.includes("damage") && (
                      <div>
                        <label className={labelClass}>Damage</label>
                        <Input
                          data-testid={`input-ws-damage-${idx}`}
                          type="number"
                          value={skill.damage}
                          onChange={e => updateWeaponSkill(idx, "damage", Number(e.target.value))}
                          className={inputClass}
                        />
                      </div>
                    )}
                    {skillFields.includes("value") && (
                      <div>
                        <label className={labelClass}>Value</label>
                        <Input
                          data-testid={`input-ws-value-${idx}`}
                          type="number"
                          value={skill.value}
                          onChange={e => updateWeaponSkill(idx, "value", Number(e.target.value))}
                          className={inputClass}
                        />
                      </div>
                    )}
                    {skillFields.includes("duration") && (
                      <div>
                        <label className={labelClass}>Duration</label>
                        <Input
                          data-testid={`input-ws-duration-${idx}`}
                          type="number"
                          value={skill.duration}
                          onChange={e => updateWeaponSkill(idx, "duration", Number(e.target.value))}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Description</label>
                    <Input
                      data-testid={`input-ws-description-${idx}`}
                      value={skill.description}
                      onChange={e => updateWeaponSkill(idx, "description", e.target.value)}
                      placeholder="Skill description"
                      className={inputClass}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {type === "food" && (
        <Card className={cardClass}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Food</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <label className={labelClass}>Heal Amount</label>
              <Input
                data-testid="input-heal-amount"
                type="number"
                value={healAmount}
                onChange={e => setHealAmount(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {type === "potion" && (
        <Card className={cardClass}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Potion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className={labelClass}>Duration (ms)</label>
              <Input
                data-testid="input-duration"
                type="number"
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="border border-zinc-700 rounded-lg p-3 space-y-3">
              <span className="text-sm font-medium text-zinc-300">Effect</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Effect Type</label>
                  <select
                    data-testid="select-effect-type"
                    className={selectClass}
                    value={effectType}
                    onChange={e => setEffectType(e.target.value)}
                  >
                    {EFFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Effect Value</label>
                  <Input
                    data-testid="input-effect-value"
                    type="number"
                    value={effectValue}
                    onChange={e => setEffectValue(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-zinc-300">
                <input
                  data-testid="checkbox-effect-percentage"
                  type="checkbox"
                  checked={effectPercentage}
                  onChange={e => setEffectPercentage(e.target.checked)}
                  className="w-4 h-4 rounded border-input"
                />
                Percentage value
              </label>
            </div>
          </CardContent>
        </Card>
      )}
      {type === "equipment" && (
      <Card className={cardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Salvage Override</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">Override formula-based salvage values. Leave both at 0 to use default calculation.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Min Scrap</label>
              <Input
                data-testid="input-salvage-min-scrap"
                type="number"
                value={salvageMinScrap}
                onChange={e => setSalvageMinScrap(Number(e.target.value))}
                className={inputClass}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Max Scrap</label>
              <Input
                data-testid="input-salvage-max-scrap"
                type="number"
                value={salvageMaxScrap}
                onChange={e => setSalvageMaxScrap(Number(e.target.value))}
                className={inputClass}
                min={0}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      )}
      </>)}

      <Card className={cardClass}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 cursor-pointer" onClick={() => setTranslationsOpen(!translationsOpen)}>
              {translationsOpen ? <CaretDown className="w-4 h-4" /> : <CaretRight className="w-4 h-4" />}
              Translations
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoTranslate}
              disabled={translating || !name}
              data-testid="button-auto-translate"
            >
              {translating ? "Translating..." : "Auto Translate"}
            </Button>
          </div>
        </CardHeader>
        {translationsOpen && (
          <CardContent className="space-y-4">
            <div>
              <span className="text-sm font-medium text-zinc-300 mb-2 block">Name Translations</span>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map(lang => (
                  <div key={`name-${lang}`}>
                    <label className={labelClass}>{LANGUAGE_LABELS[lang]} ({lang})</label>
                    <Input
                      data-testid={`input-name-translation-${lang}`}
                      value={nameTranslations[lang] || ""}
                      onChange={e => setNameTranslations(prev => ({ ...prev, [lang]: e.target.value }))}
                      placeholder={`Name in ${LANGUAGE_LABELS[lang]}`}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-zinc-300 mb-2 block">Description Translations</span>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map(lang => (
                  <div key={`desc-${lang}`}>
                    <label className={labelClass}>{LANGUAGE_LABELS[lang]} ({lang})</label>
                    <Input
                      data-testid={`input-desc-translation-${lang}`}
                      value={descriptionTranslations[lang] || ""}
                      onChange={e => setDescriptionTranslations(prev => ({ ...prev, [lang]: e.target.value }))}
                      placeholder={`Description in ${LANGUAGE_LABELS[lang]}`}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex items-center gap-3 sticky bottom-0 bg-zinc-950 py-3 border-t border-zinc-700">
        <Button
          data-testid="button-save-item"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saving ? "Saving..." : isCreating ? "Create Item" : "Save Changes"}
        </Button>
        <Button
          data-testid="button-cancel-item"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
