import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaretDown, CaretRight, Plus, Trash, Upload } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";

interface Tier {
  tier: number;
  threshold: number;
  rewardGold: number;
  rewardXp: number;
  badgeId?: string;
  description?: string;
  descriptionTranslations?: Record<string, string>;
}

interface AchievementEditorProps {
  achievement: any | null;
  isCreating: boolean;
  onSave: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
  adminKey: string;
  allBadges: any[];
  getAdminHeaders: (key: string) => Promise<Record<string, string>>;
  staffRole?: string | null;
}

const LANGUAGES = ["en", "tr", "ru", "ar", "fr", "es", "zh", "hi"];
const LANGUAGE_LABELS: Record<string, string> = { en: "English", tr: "Turkish", ru: "Russian", ar: "Arabic", fr: "French", es: "Spanish", zh: "Chinese", hi: "Hindi" };

const CATEGORIES = [
  "combat", "skills", "gathering", "crafting", "cooking", "alchemy",
  "firemaking", "economy", "social", "exploration", "equipment",
  "dungeons", "general"
];

export default function AchievementEditor({ achievement, isCreating, onSave, onCancel, saving, adminKey, allBadges, getAdminHeaders, staffRole }: AchievementEditorProps) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [trackingKey, setTrackingKey] = useState("");
  const [icon, setIcon] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  const [tiers, setTiers] = useState<Tier[]>([
    { tier: 1, threshold: 10, rewardGold: 100, rewardXp: 50 }
  ]);

  const [nameTranslations, setNameTranslations] = useState<Record<string, string>>({});
  const [descriptionTranslations, setDescriptionTranslations] = useState<Record<string, string>>({});
  const isTranslator = staffRole === 'translator';
  const [translationsOpen, setTranslationsOpen] = useState(isTranslator);
  const [tiersOpen, setTiersOpen] = useState(true);

  const [translating, setTranslating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("category", "achievements");
      formData.append("itemId", id || "new_achievement");
      const headers = await getAdminHeaders(adminKey);
      const res = await fetch("/api/admin/upload-image", {
        method: "POST",
        headers,
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setIcon(data.path || data.url);
        toast({ title: "Image uploaded" });
      }
    } catch (e) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (achievement && !isCreating) {
      setId(achievement.id || "");
      setName(achievement.name || "");
      setDescription(achievement.description || "");
      setCategory(achievement.category || "general");
      setTrackingKey(achievement.trackingKey || "");
      setIcon(achievement.icon || "");
      setSortOrder(achievement.sortOrder || 0);
      setTiers(achievement.tiers || [{ tier: 1, threshold: 10, rewardGold: 100, rewardXp: 50 }]);
      setNameTranslations(achievement.nameTranslations || {});
      setDescriptionTranslations(achievement.descriptionTranslations || {});
    } else if (isCreating) {
      setId("");
      setName("");
      setDescription("");
      setCategory("general");
      setTrackingKey("");
      setIcon("");
      setSortOrder(0);
      setTiers([{ tier: 1, threshold: 10, rewardGold: 100, rewardXp: 50 }]);
      setNameTranslations({});
      setDescriptionTranslations({});
    }
  }, [achievement, isCreating]);

  const handleAutoTranslate = async () => {
    if (!name && !description) return;
    setTranslating(true);
    try {
      const headers = await getAdminHeaders(adminKey);
      const res = await fetch("/api/admin/translate", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          texts: [
            { key: "name", value: name },
            { key: "description", value: description },
          ],
          targetLanguages: LANGUAGES.filter(l => l !== "en"),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.translations) {
          const newNameTr: Record<string, string> = { ...nameTranslations };
          const newDescTr: Record<string, string> = { ...descriptionTranslations };
          for (const [lang, texts] of Object.entries(data.translations)) {
            const t = texts as Record<string, string>;
            if (t.name) newNameTr[lang] = t.name;
            if (t.description) newDescTr[lang] = t.description;
          }
          setNameTranslations(newNameTr);
          setDescriptionTranslations(newDescTr);
          toast({ title: "Translations generated" });
        }
      }
    } catch (e) {
      toast({ title: "Translation failed", variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  const handleTranslateTierDescriptions = async () => {
    const descriptions = tiers.filter(t => t.description).map((t, i) => ({
      key: `tier_${t.tier}`,
      value: t.description!,
    }));
    if (descriptions.length === 0) return;
    setTranslating(true);
    try {
      const headers = await getAdminHeaders(adminKey);
      const res = await fetch("/api/admin/translate", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          texts: descriptions,
          targetLanguages: LANGUAGES.filter(l => l !== "en"),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.translations) {
          setTiers(prev => prev.map(t => {
            const newDescTr = { ...(t.descriptionTranslations || {}) };
            for (const [lang, texts] of Object.entries(data.translations)) {
              const tr = texts as Record<string, string>;
              const key = `tier_${t.tier}`;
              if (tr[key]) newDescTr[lang] = tr[key];
            }
            return { ...t, descriptionTranslations: newDescTr };
          }));
          toast({ title: "Tier descriptions translated" });
        }
      }
    } catch (e) {
      toast({ title: "Tier translation failed", variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  const addTier = () => {
    const maxTier = Math.max(0, ...tiers.map(t => t.tier));
    const lastThreshold = tiers.length > 0 ? tiers[tiers.length - 1].threshold : 0;
    const lastGold = tiers.length > 0 ? tiers[tiers.length - 1].rewardGold : 100;
    setTiers([...tiers, {
      tier: maxTier + 1,
      threshold: lastThreshold * 5,
      rewardGold: lastGold * 2,
      rewardXp: 0,
    }]);
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const updateTier = (index: number, field: keyof Tier, value: any) => {
    setTiers(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const handleSubmit = () => {
    if (!id || !name || !trackingKey || !category) {
      toast({ title: "ID, Name, Tracking Key, and Category are required", variant: "destructive" });
      return;
    }
    if (tiers.length === 0) {
      toast({ title: "At least one tier is required", variant: "destructive" });
      return;
    }

    const sortedTiers = [...tiers].sort((a, b) => a.tier - b.tier);

    onSave({
      id,
      name,
      description,
      category,
      trackingKey,
      icon,
      sortOrder,
      tiers: sortedTiers,
      nameTranslations,
      descriptionTranslations,
    });
  };

  const autoGenerateId = (val: string) => {
    if (isCreating) {
      setId(val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''));
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>{isCreating ? "New Achievement" : `Edit: ${name || id}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isTranslator && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">ID</label>
                <Input
                  value={id}
                  onChange={e => setId(e.target.value)}
                  disabled={!isCreating}
                  placeholder="kill_monsters_total"
                  data-testid="input-achievement-id"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Name (EN)</label>
                <Input
                  value={name}
                  onChange={e => { setName(e.target.value); autoGenerateId(e.target.value); }}
                  placeholder="Monster Slayer"
                  data-testid="input-achievement-name"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Description (EN)</label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Kill monsters to earn this achievement"
                data-testid="input-achievement-description"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  data-testid="select-achievement-category"
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tracking Key</label>
                <Input
                  value={trackingKey}
                  onChange={e => setTrackingKey(e.target.value)}
                  placeholder="total_kills"
                  data-testid="input-achievement-tracking-key"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Sort Order</label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={e => setSortOrder(Number(e.target.value))}
                  data-testid="input-achievement-sort-order"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Icon URL</label>
                <Input
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  placeholder="/icons/achievement.png"
                  data-testid="input-achievement-icon"
                />
              </div>
              <div className="pt-4">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload weight="bold" className="w-4 h-4 mr-1" />
                  {uploading ? "..." : "Upload"}
                </Button>
              </div>
              {icon && (icon.startsWith('/') || icon.startsWith('http')) && (
                <div className="pt-4">
                  <img src={icon} alt="" className="w-8 h-8 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
          </>
        )}

        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setTiersOpen(!tiersOpen)}
          >
            {tiersOpen ? <CaretDown weight="bold" className="w-4 h-4" /> : <CaretRight weight="bold" className="w-4 h-4" />}
            Tiers ({tiers.length})
          </button>
          {tiersOpen && !isTranslator && (
            <div className="mt-2 space-y-3">
              {tiers.map((tier, index) => (
                <div key={index} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Tier {tier.tier}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeTier(index)} className="text-red-400 hover:text-red-300 h-7 w-7 p-0">
                      <Trash weight="bold" className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Tier #</label>
                      <Input
                        type="number"
                        value={tier.tier}
                        onChange={e => updateTier(index, 'tier', Number(e.target.value))}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Threshold</label>
                      <Input
                        type="number"
                        value={tier.threshold}
                        onChange={e => updateTier(index, 'threshold', Number(e.target.value))}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Gold Reward</label>
                      <Input
                        type="number"
                        value={tier.rewardGold}
                        onChange={e => updateTier(index, 'rewardGold', Number(e.target.value))}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">XP Reward</label>
                      <Input
                        type="number"
                        value={tier.rewardXp}
                        onChange={e => updateTier(index, 'rewardXp', Number(e.target.value))}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Badge Reward</label>
                      <select
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                        value={tier.badgeId || ""}
                        onChange={e => updateTier(index, 'badgeId', e.target.value || undefined)}
                      >
                        <option value="">No Badge</option>
                        {allBadges.map((b: any) => (
                          <option key={b.id} value={b.id}>{b.name || b.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Description (EN)</label>
                      <Input
                        value={tier.description || ""}
                        onChange={e => updateTier(index, 'description', e.target.value)}
                        placeholder={`Complete tier ${tier.tier}`}
                        className="h-8"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={addTier}>
                  <Plus weight="bold" className="w-4 h-4 mr-1" /> Add Tier
                </Button>
                {tiers.some(t => t.description) && (
                  <Button variant="outline" size="sm" onClick={handleTranslateTierDescriptions} disabled={translating}>
                    {translating ? "Translating..." : "Translate Tier Descriptions"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setTranslationsOpen(!translationsOpen)}
          >
            {translationsOpen ? <CaretDown weight="bold" className="w-4 h-4" /> : <CaretRight weight="bold" className="w-4 h-4" />}
            Translations
          </button>
          {translationsOpen && (
            <div className="mt-2 space-y-3">
              <Button variant="outline" size="sm" onClick={handleAutoTranslate} disabled={translating || (!name && !description)}>
                {translating ? "Translating..." : "Auto-Translate All"}
              </Button>
              <div className="grid grid-cols-1 gap-2">
                {LANGUAGES.filter(l => l !== "en").map(lang => (
                  <div key={lang} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{LANGUAGE_LABELS[lang]}</span>
                    <Input
                      value={nameTranslations[lang] || ""}
                      onChange={e => setNameTranslations({ ...nameTranslations, [lang]: e.target.value })}
                      placeholder={`Name (${lang})`}
                      className="h-8 text-sm"
                    />
                    <Input
                      value={descriptionTranslations[lang] || ""}
                      onChange={e => setDescriptionTranslations({ ...descriptionTranslations, [lang]: e.target.value })}
                      placeholder={`Description (${lang})`}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={saving} data-testid="button-save-achievement">
            {saving ? "Saving..." : (isCreating ? "Create" : "Save")}
          </Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
