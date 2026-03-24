import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash, Plus, CaretDown, CaretRight, Upload } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";

interface MonsterEditorProps {
  monster: any | null;
  isCreating: boolean;
  onSave: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
  regions: any[];
  allItems: any[];
  adminKey: string;
  getAdminHeaders: (key: string) => Promise<Record<string, string>>;
  staffRole?: string | null;
}

const SKILL_TYPES = ["stun", "poison", "burn", "armor_break", "heal", "enrage", "summon", "aoe_attack"];
const LANGUAGES = ["en", "tr", "ru", "ar", "fr", "es", "zh", "hi"];
const LANGUAGE_LABELS: Record<string, string> = { en: "English", tr: "Turkish", ru: "Russian", ar: "Arabic", fr: "French", es: "Spanish", zh: "Chinese", hi: "Hindi" };

interface LootEntry {
  itemId: string;
  chance: number;
  minQty: number;
  maxQty: number;
}

interface SkillEntry {
  id: string;
  name: string;
  type: string;
  chance: number;
  damage: number;
  duration: number;
  description: string;
}

function emptyLoot(): LootEntry {
  return { itemId: "", chance: 0.1, minQty: 1, maxQty: 1 };
}

function emptySkill(): SkillEntry {
  return { id: "", name: "", type: "stun", chance: 10, damage: 0, duration: 0, description: "" };
}

export default function MonsterEditor({ monster, isCreating, onSave, onCancel, saving, regions, allItems, adminKey, getAdminHeaders, staffRole }: MonsterEditorProps) {
  const [isDraft, setIsDraft] = useState(0);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [regionId, setRegionId] = useState("");
  const [icon, setIcon] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  const [maxHitpoints, setMaxHitpoints] = useState(0);
  const [attackLevel, setAttackLevel] = useState(0);
  const [strengthLevel, setStrengthLevel] = useState(0);
  const [defenceLevel, setDefenceLevel] = useState(0);
  const [attackBonus, setAttackBonus] = useState(0);
  const [strengthBonus, setStrengthBonus] = useState(0);
  const [attackSpeed, setAttackSpeed] = useState(2400);

  const [xpAttack, setXpAttack] = useState(0);
  const [xpStrength, setXpStrength] = useState(0);
  const [xpDefence, setXpDefence] = useState(0);
  const [xpHitpoints, setXpHitpoints] = useState(0);

  const [loot, setLoot] = useState<LootEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);

  const [nameTranslations, setNameTranslations] = useState<Record<string, string>>({});
  const isTranslator = staffRole === 'translator';
  const [translationsOpen, setTranslationsOpen] = useState(isTranslator);

  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
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
      const sanitizedId = (id || 'monster').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${sanitizedId}_${Date.now()}${ext}`;

      const response = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: { ...(await getAdminHeaders(adminKey)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: base64, fileName, folder: 'monsters' }),
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
      const texts = [{ key: "name", value: name }];
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

      setTranslationsOpen(true);
      toast({ title: "Translations filled", description: "Empty translation fields have been auto-filled." });
    } catch (error) {
      toast({ title: "Translation failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  useEffect(() => {
    if (monster) {
      setIsDraft(monster.isDraft || 0);
      setId(monster.id || "");
      setName(monster.name || "");
      setRegionId(monster.regionId || "");
      setIcon(monster.icon || "");
      setSortOrder(monster.sortOrder || 0);

      setMaxHitpoints(monster.maxHitpoints || 0);
      setAttackLevel(monster.attackLevel || 0);
      setStrengthLevel(monster.strengthLevel || 0);
      setDefenceLevel(monster.defenceLevel || 0);
      setAttackBonus(monster.attackBonus || 0);
      setStrengthBonus(monster.strengthBonus || 0);
      setAttackSpeed(monster.attackSpeed || 2400);

      const xp = typeof monster.xpReward === "string" ? JSON.parse(monster.xpReward) : (monster.xpReward || {});
      setXpAttack(xp.attack || 0);
      setXpStrength(xp.strength || 0);
      setXpDefence(xp.defence || 0);
      setXpHitpoints(xp.hitpoints || 0);

      const lootData = typeof monster.loot === "string" ? JSON.parse(monster.loot) : (monster.loot || []);
      setLoot(lootData.map((l: any) => ({
        itemId: l.itemId || "",
        chance: l.chance || 0,
        minQty: l.minQty || 1,
        maxQty: l.maxQty || 1,
      })));

      const skillsData = typeof monster.skills === "string" ? JSON.parse(monster.skills) : (monster.skills || []);
      setSkills(skillsData.map((s: any) => ({
        id: s.id || "",
        name: s.name || "",
        type: s.type || "stun",
        chance: s.chance || 0,
        damage: s.damage || s.value || 0,
        duration: s.duration || 0,
        description: s.description || "",
      })));

      const nt = typeof monster.nameTranslations === "string" ? JSON.parse(monster.nameTranslations) : (monster.nameTranslations || {});
      setNameTranslations(nt);
      if (Object.keys(nt).length > 0) {
        setTranslationsOpen(true);
      }
    }
  }, [monster]);

  const handleSave = () => {
    if (!id || !name) {
      toast({ title: "Missing required fields", description: "ID and Name are required.", variant: "destructive" });
      return;
    }
    if (!regionId) {
      toast({ title: "Missing Region", description: "You must select a region before saving.", variant: "destructive" });
      return;
    }
    const data: any = {
      id,
      isDraft,
      name,
      regionId,
      icon: icon || null,
      sortOrder: sortOrder || 0,
      maxHitpoints,
      attackLevel,
      strengthLevel,
      defenceLevel,
      attackBonus: attackBonus || 0,
      strengthBonus: strengthBonus || 0,
      attackSpeed,
      xpReward: {
        attack: xpAttack || 0,
        strength: xpStrength || 0,
        defence: xpDefence || 0,
        hitpoints: xpHitpoints || 0,
      },
      loot: loot.map(l => ({
        itemId: l.itemId,
        chance: l.chance,
        minQty: l.minQty,
        maxQty: l.maxQty,
      })),
      skills: skills.map(s => {
        const skill: any = {
          id: s.id,
          name: s.name,
          type: s.type,
          chance: s.chance,
        };
        if (s.damage) skill.damage = s.damage;
        if (s.duration) skill.duration = s.duration;
        if (s.description) skill.description = s.description;
        return skill;
      }),
      nameTranslations: Object.keys(nameTranslations).length > 0 ? nameTranslations : {},
    };
    onSave(data);
  };

  const updateLoot = (index: number, field: keyof LootEntry, value: any) => {
    setLoot(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const updateSkill = (index: number, field: keyof SkillEntry, value: any) => {
    setSkills(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const getFilteredItems = (index: number) => {
    const search = (itemSearch[index] || "").toLowerCase();
    if (!search) return allItems.slice(0, 50);
    return allItems.filter(item =>
      item.id?.toLowerCase().includes(search) || item.name?.toLowerCase().includes(search)
    ).slice(0, 50);
  };

  return (
    <div className="space-y-4" data-testid="monster-editor">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white" data-testid="monster-editor-title">
          {isCreating ? "Create Monster" : `Edit: ${monster?.name || ""}`}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || (isCreating && isTranslator)} data-testid="button-save">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {!isTranslator && (<>
      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader><CardTitle className="text-white">Basic Info</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className={`flex items-center gap-3 p-3 rounded-md border ${isDraft ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-green-500/50 bg-green-500/10'}`}>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="checkbox-is-draft"
                type="checkbox"
                checked={isDraft === 1}
                onChange={e => setIsDraft(e.target.checked ? 1 : 0)}
                className="w-4 h-4 rounded border-input"
              />
              <span className="font-medium">{isDraft ? '📝 Draft Mode' : '🟢 Live'}</span>
            </label>
            <span className="text-xs text-muted-foreground">When enabled, only tester players can see this monster</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-zinc-400">ID</label>
              <Input
                value={id}
                onChange={e => setId(e.target.value)}
                disabled={!isCreating}
                placeholder="monster_id"
                data-testid="input-id"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Monster Name"
                data-testid="input-name"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-zinc-400">Region *</label>
              <select
                value={regionId}
                onChange={e => setRegionId(e.target.value)}
                data-testid="select-region"
                className="w-full h-10 rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 text-sm"
              >
                <option value="">Select Region</option>
                {regions.map(r => (
                  <option key={r.id} value={r.id}>{r.name || r.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400">Icon</label>
              <div className="flex gap-2 items-center">
                <Input
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  placeholder="/icons/monster.png"
                  data-testid="input-icon"
                  className="bg-zinc-800 border-zinc-600 text-white flex-1"
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
                  {uploading ? "..." : "Upload"}
                </Button>
                {icon && (
                  <img
                    src={icon}
                    alt="icon preview"
                    className="w-8 h-8 object-contain rounded"
                    data-testid="img-icon-preview"
                    onError={e => (e.currentTarget.style.display = "none")}
                  />
                )}
              </div>
            </div>
            <div>
              <label className="text-sm text-zinc-400">Sort Order</label>
              <Input
                type="number"
                value={sortOrder}
                onChange={e => setSortOrder(Number(e.target.value))}
                data-testid="input-sort-order"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader><CardTitle className="text-white">Combat Stats</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-sm text-zinc-400">Max Hitpoints *</label>
              <Input
                type="number"
                value={maxHitpoints}
                onChange={e => setMaxHitpoints(Number(e.target.value))}
                data-testid="input-max-hitpoints"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Attack Level *</label>
              <Input
                type="number"
                value={attackLevel}
                onChange={e => setAttackLevel(Number(e.target.value))}
                data-testid="input-attack-level"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Strength Level *</label>
              <Input
                type="number"
                value={strengthLevel}
                onChange={e => setStrengthLevel(Number(e.target.value))}
                data-testid="input-strength-level"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Defence Level *</label>
              <Input
                type="number"
                value={defenceLevel}
                onChange={e => setDefenceLevel(Number(e.target.value))}
                data-testid="input-defence-level"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-zinc-400">Attack Bonus</label>
              <Input
                type="number"
                value={attackBonus}
                onChange={e => setAttackBonus(Number(e.target.value))}
                data-testid="input-attack-bonus"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Strength Bonus</label>
              <Input
                type="number"
                value={strengthBonus}
                onChange={e => setStrengthBonus(Number(e.target.value))}
                data-testid="input-strength-bonus"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Attack Speed (ms) *</label>
              <Input
                type="number"
                value={attackSpeed}
                onChange={e => setAttackSpeed(Number(e.target.value))}
                data-testid="input-attack-speed"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader><CardTitle className="text-white">XP Reward</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-sm text-zinc-400">Attack XP</label>
              <Input
                type="number"
                value={xpAttack}
                onChange={e => setXpAttack(Number(e.target.value))}
                data-testid="input-xp-attack"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Strength XP</label>
              <Input
                type="number"
                value={xpStrength}
                onChange={e => setXpStrength(Number(e.target.value))}
                data-testid="input-xp-strength"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Defence XP</label>
              <Input
                type="number"
                value={xpDefence}
                onChange={e => setXpDefence(Number(e.target.value))}
                data-testid="input-xp-defence"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Hitpoints XP</label>
              <Input
                type="number"
                value={xpHitpoints}
                onChange={e => setXpHitpoints(Number(e.target.value))}
                data-testid="input-xp-hitpoints"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Loot Table</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLoot(prev => [...prev, emptyLoot()])}
              data-testid="button-add-loot"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Loot
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loot.length === 0 && (
            <p className="text-zinc-500 text-sm" data-testid="text-no-loot">No loot entries. Click "Add Loot" to add one.</p>
          )}
          {loot.map((entry, i) => (
            <div key={i} className="flex gap-2 items-end border border-zinc-700 rounded p-3" data-testid={`loot-entry-${i}`}>
              <div className="flex-1">
                <label className="text-sm text-zinc-400">Item</label>
                <Input
                  value={itemSearch[i] ?? ""}
                  onChange={e => {
                    setItemSearch(prev => ({ ...prev, [i]: e.target.value }));
                  }}
                  placeholder="Search items..."
                  data-testid={`input-loot-search-${i}`}
                  className="bg-zinc-800 border-zinc-600 text-white mb-1"
                />
                <select
                  value={entry.itemId}
                  onChange={e => updateLoot(i, "itemId", e.target.value)}
                  data-testid={`select-loot-item-${i}`}
                  className="w-full h-9 rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 text-sm"
                >
                  <option value="">Select Item</option>
                  {entry.itemId && !getFilteredItems(i).find(item => item.id === entry.itemId) && (
                    <option value={entry.itemId}>{entry.itemId}</option>
                  )}
                  {getFilteredItems(i).map(item => (
                    <option key={item.id} value={item.id}>{item.name || item.id}</option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="text-sm text-zinc-400">Chance</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={entry.chance}
                  onChange={e => updateLoot(i, "chance", Number(e.target.value))}
                  data-testid={`input-loot-chance-${i}`}
                  className="bg-zinc-800 border-zinc-600 text-white"
                />
              </div>
              <div className="w-20">
                <label className="text-sm text-zinc-400">Min Qty</label>
                <Input
                  type="number"
                  min="1"
                  value={entry.minQty}
                  onChange={e => updateLoot(i, "minQty", Number(e.target.value))}
                  data-testid={`input-loot-min-qty-${i}`}
                  className="bg-zinc-800 border-zinc-600 text-white"
                />
              </div>
              <div className="w-20">
                <label className="text-sm text-zinc-400">Max Qty</label>
                <Input
                  type="number"
                  min="1"
                  value={entry.maxQty}
                  onChange={e => updateLoot(i, "maxQty", Number(e.target.value))}
                  data-testid={`input-loot-max-qty-${i}`}
                  className="bg-zinc-800 border-zinc-600 text-white"
                />
              </div>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setLoot(prev => prev.filter((_, idx) => idx !== i))}
                data-testid={`button-remove-loot-${i}`}
              >
                <Trash className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Monster Skills</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSkills(prev => [...prev, emptySkill()])}
              data-testid="button-add-skill"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Skill
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {skills.length === 0 && (
            <p className="text-zinc-500 text-sm" data-testid="text-no-skills">No skills. Click "Add Skill" to add one.</p>
          )}
          {skills.map((skill, i) => (
            <div key={i} className="border border-zinc-700 rounded p-3 space-y-2" data-testid={`skill-entry-${i}`}>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-sm text-zinc-400">Skill ID</label>
                  <Input
                    value={skill.id}
                    onChange={e => updateSkill(i, "id", e.target.value)}
                    placeholder="skill_id"
                    data-testid={`input-skill-id-${i}`}
                    className="bg-zinc-800 border-zinc-600 text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm text-zinc-400">Name</label>
                  <Input
                    value={skill.name}
                    onChange={e => updateSkill(i, "name", e.target.value)}
                    placeholder="Skill Name"
                    data-testid={`input-skill-name-${i}`}
                    className="bg-zinc-800 border-zinc-600 text-white"
                  />
                </div>
                <div className="w-36">
                  <label className="text-sm text-zinc-400">Type</label>
                  <select
                    value={skill.type}
                    onChange={e => updateSkill(i, "type", e.target.value)}
                    data-testid={`select-skill-type-${i}`}
                    className="w-full h-10 rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 text-sm"
                  >
                    {SKILL_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => setSkills(prev => prev.filter((_, idx) => idx !== i))}
                  data-testid={`button-remove-skill-${i}`}
                >
                  <Trash className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="text-sm text-zinc-400">Chance (%)</label>
                  <Input
                    type="number"
                    value={skill.chance}
                    onChange={e => updateSkill(i, "chance", Number(e.target.value))}
                    data-testid={`input-skill-chance-${i}`}
                    className="bg-zinc-800 border-zinc-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400">Damage/Value</label>
                  <Input
                    type="number"
                    value={skill.damage}
                    onChange={e => updateSkill(i, "damage", Number(e.target.value))}
                    data-testid={`input-skill-damage-${i}`}
                    className="bg-zinc-800 border-zinc-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400">Duration</label>
                  <Input
                    type="number"
                    value={skill.duration}
                    onChange={e => updateSkill(i, "duration", Number(e.target.value))}
                    data-testid={`input-skill-duration-${i}`}
                    className="bg-zinc-800 border-zinc-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400">Description</label>
                  <Input
                    value={skill.description}
                    onChange={e => updateSkill(i, "description", e.target.value)}
                    placeholder="Skill description"
                    data-testid={`input-skill-description-${i}`}
                    className="bg-zinc-800 border-zinc-600 text-white"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      </>)}

      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setTranslationsOpen(!translationsOpen)}
              className="flex items-center gap-2 text-left"
              data-testid="button-toggle-translations"
            >
              {translationsOpen ? <CaretDown className="w-4 h-4 text-white" /> : <CaretRight className="w-4 h-4 text-white" />}
              <CardTitle className="text-white">Translations</CardTitle>
            </button>
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
          <CardContent>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Name Translations</label>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map(lang => (
                  <div key={lang} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 w-16">{LANGUAGE_LABELS[lang]}</span>
                    <Input
                      value={nameTranslations[lang] || ""}
                      onChange={e => setNameTranslations(prev => ({ ...prev, [lang]: e.target.value }))}
                      placeholder={`${LANGUAGE_LABELS[lang]} name`}
                      data-testid={`input-translation-name-${lang}`}
                      className="bg-zinc-800 border-zinc-600 text-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex justify-end gap-2 pb-4">
        <Button variant="outline" onClick={onCancel} disabled={saving} data-testid="button-cancel-bottom">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || (isCreating && isTranslator)} data-testid="button-save-bottom">
          {saving ? "Saving..." : "Save Monster"}
        </Button>
      </div>
    </div>
  );
}
