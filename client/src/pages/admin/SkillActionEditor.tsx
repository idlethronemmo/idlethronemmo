import { useState, useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaretDown, CaretRight, Upload } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";

interface SkillActionEditorProps {
  skillAction: any | null;
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

const SKILLS = ["woodcutting", "mining", "fishing", "hunting", "firemaking"];
const LANGUAGES = ["en", "tr", "ru", "ar", "fr", "es", "zh", "hi"];
const LANGUAGE_LABELS: Record<string, string> = { en: "English", tr: "Turkish", ru: "Russian", ar: "Arabic", fr: "French", es: "Spanish", zh: "Chinese", hi: "Hindi" };

function generateId(skill: string, name: string): string {
  if (!skill || !name) return "";
  return `${skill}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

export default function SkillActionEditor({ skillAction, isCreating, onSave, onCancel, saving, regions, allItems, adminKey, getAdminHeaders, staffRole }: SkillActionEditorProps) {
  const [isDraft, setIsDraft] = useState(0);
  const [id, setId] = useState("");
  const [skill, setSkill] = useState("woodcutting");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [itemId, setItemId] = useState("");
  const [levelRequired, setLevelRequired] = useState(0);
  const [xpReward, setXpReward] = useState(0);
  const [duration, setDuration] = useState(3000);
  const [requiredBait, setRequiredBait] = useState("");
  const [baitAmount, setBaitAmount] = useState(0);
  const [icon, setIcon] = useState("");
  const [regionId, setRegionId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [nameTranslations, setNameTranslations] = useState<Record<string, string>>({});
  const [descriptionTranslations, setDescriptionTranslations] = useState<Record<string, string>>({});

  const [hasRequiredInput, setHasRequiredInput] = useState(false);

  const isTranslator = staffRole === 'translator';
  const [translationsOpen, setTranslationsOpen] = useState(isTranslator);
  const [translating, setTranslating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [baitSearch, setBaitSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isDuplicateId = useMemo(() => {
    return false;
  }, []);

  const selectedItem = useMemo(() => {
    if (!itemId) return null;
    return allItems.find((i: any) => i.id === itemId) || null;
  }, [itemId, allItems]);

  const selectedBaitItem = useMemo(() => {
    if (!requiredBait) return null;
    return allItems.find((i: any) => i.id === requiredBait) || null;
  }, [requiredBait, allItems]);

  const filteredItems = useMemo(() => {
    if (!itemSearch) return allItems.slice(0, 50);
    const s = itemSearch.toLowerCase();
    return allItems.filter((item: any) =>
      item.id?.toLowerCase().includes(s) || (item.name && item.name.toLowerCase().includes(s))
    ).slice(0, 50);
  }, [allItems, itemSearch]);

  const filteredBaitItems = useMemo(() => {
    if (!baitSearch) return allItems.slice(0, 50);
    const s = baitSearch.toLowerCase();
    return allItems.filter((item: any) =>
      item.id?.toLowerCase().includes(s) || (item.name && item.name.toLowerCase().includes(s))
    ).slice(0, 50);
  }, [allItems, baitSearch]);

  useEffect(() => {
    if (isCreating && name && skill) {
      setId(generateId(skill, name));
    }
  }, [name, skill, isCreating]);

  useEffect(() => {
    if (skillAction) {
      setIsDraft(skillAction.isDraft || 0);
      setId(skillAction.id || "");
      setSkill(skillAction.skill || "woodcutting");
      setName(skillAction.name || "");
      setDescription(skillAction.description || "");
      setItemId(skillAction.itemId || "");
      setLevelRequired(skillAction.levelRequired || 0);
      setXpReward(skillAction.xpReward || 0);
      setDuration(skillAction.duration || 3000);
      setRequiredBait(skillAction.requiredBait || "");
      setBaitAmount(skillAction.baitAmount || 0);
      setHasRequiredInput(!!(skillAction.requiredBait));
      setIcon(skillAction.icon || "");
      setRegionId(skillAction.regionId || "");
      setSortOrder(skillAction.sortOrder || 0);

      const nt = typeof skillAction.nameTranslations === "string" ? JSON.parse(skillAction.nameTranslations) : (skillAction.nameTranslations || {});
      setNameTranslations(nt);
      const dt = typeof skillAction.descriptionTranslations === "string" ? JSON.parse(skillAction.descriptionTranslations) : (skillAction.descriptionTranslations || {});
      setDescriptionTranslations(dt);
      if (Object.keys(nt).length > 0 || Object.keys(dt).length > 0) {
        setTranslationsOpen(true);
      }
    }
  }, [skillAction]);

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
      const sanitizedId = (id || 'skill_action').replace(/[^a-zA-Z0-9_-]/g, '_');
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

  const handleSave = () => {
    if (!id || !name || !skill) {
      toast({ title: "Missing required fields", description: "ID, Name, and Skill are required.", variant: "destructive" });
      return;
    }
    if (!itemId) {
      toast({ title: "Missing Item ID", description: "You must select a produced item before saving.", variant: "destructive" });
      return;
    }
    if (!xpReward || xpReward <= 0) {
      toast({ title: "Missing XP Reward", description: "XP Reward must be greater than 0.", variant: "destructive" });
      return;
    }
    if (!duration || duration <= 0) {
      toast({ title: "Missing Duration", description: "Duration must be greater than 0.", variant: "destructive" });
      return;
    }
    if (hasRequiredInput && !requiredBait) {
      toast({ title: "Missing Required Item", description: "You enabled 'Requires Input Item' but didn't select an item. Either select an item or uncheck the checkbox.", variant: "destructive" });
      return;
    }
    const data: any = {
      id,
      isDraft,
      skill,
      name,
      description: description || null,
      itemId,
      levelRequired: levelRequired || 0,
      xpReward,
      duration,
      requiredBait: hasRequiredInput ? (requiredBait || null) : null,
      baitAmount: hasRequiredInput ? (baitAmount || 1) : null,
      icon: icon || null,
      regionId: regionId || null,
      sortOrder: sortOrder || 0,
      nameTranslations: Object.keys(nameTranslations).length > 0 ? nameTranslations : {},
      descriptionTranslations: Object.keys(descriptionTranslations).length > 0 ? descriptionTranslations : {},
    };
    onSave(data);
  };

  const selectClass = "flex h-10 w-full rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const inputClass = "bg-zinc-800 border-zinc-600 text-white";
  const labelClass = "text-sm font-medium text-zinc-300 mb-1 block";
  const cardClass = "bg-zinc-900 border-zinc-700";

  const saveDisabled = saving || !id || !name || !skill || (isCreating && isTranslator);

  return (
    <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-2" data-testid="skill-action-editor">
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
              <span className="text-xs text-zinc-500 ml-auto">{isDraft ? 'Only testers can see this action' : 'Everyone can see this action'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Skill *</label>
              <select
                data-testid="select-skill"
                className={selectClass}
                value={skill}
                onChange={e => setSkill(e.target.value)}
              >
                {SKILLS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Name *</label>
              <Input
                data-testid="input-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Normal Tree"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>ID {isCreating && <span className="text-xs text-zinc-500">(auto-generated from skill + name)</span>}</label>
            <Input
              data-testid="input-id"
              value={id}
              onChange={e => setId(e.target.value)}
              disabled={!isCreating}
              placeholder="woodcutting_normal_tree"
              className={`${inputClass} ${isDuplicateId ? 'border-red-500 ring-1 ring-red-500' : ''}`}
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              data-testid="input-description"
              className="flex w-full rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[60px] resize-y"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Skill Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Level Required</label>
              <Input
                data-testid="input-level-required"
                type="number"
                value={levelRequired}
                onChange={e => setLevelRequired(Number(e.target.value))}
                min={0}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>XP Reward</label>
              <Input
                data-testid="input-xp-reward"
                type="number"
                value={xpReward}
                onChange={e => setXpReward(Number(e.target.value))}
                min={0}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Duration (ms)</label>
              <Input
                data-testid="input-duration"
                type="number"
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                min={0}
                className={inputClass}
              />
              <p className="text-xs text-zinc-500 mt-1" data-testid="text-duration-preview">
                {duration}ms = {formatDuration(duration)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Region <span className="text-xs text-zinc-500">(empty = all regions)</span></label>
              <select
                data-testid="select-region"
                className={selectClass}
                value={regionId}
                onChange={e => setRegionId(e.target.value)}
              >
                <option value="">All Regions</option>
                {regions.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name || r.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Sort Order</label>
              <Input
                data-testid="input-sort-order"
                type="number"
                value={sortOrder}
                onChange={e => setSortOrder(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Produced Item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className={labelClass}>Item ID *</label>
            <Input
              data-testid="input-item-search"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder="Search items..."
              className={`${inputClass} mb-1`}
            />
            <select
              data-testid="select-item-id"
              className={selectClass}
              value={itemId}
              onChange={e => setItemId(e.target.value)}
            >
              <option value="">-- Select Item --</option>
              {itemId && !filteredItems.find((i: any) => i.id === itemId) && (
                <option value={itemId}>{allItems.find((i: any) => i.id === itemId)?.name || itemId}</option>
              )}
              {filteredItems.map((item: any) => (
                <option key={item.id} value={item.id}>{item.name || item.id} ({item.id})</option>
              ))}
            </select>
          </div>
          {selectedItem && (
            <div className="flex items-center gap-3 p-2 rounded-md border border-zinc-700 bg-zinc-800/50" data-testid="item-preview">
              {selectedItem.icon && (
                <img
                  src={selectedItem.icon}
                  alt={selectedItem.name}
                  className="w-10 h-10 object-contain rounded border border-zinc-600"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  data-testid="img-item-preview"
                />
              )}
              <div>
                <p className="text-sm text-white font-medium">{selectedItem.name}</p>
                <p className="text-xs text-zinc-400">{selectedItem.id}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Required Input Item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="checkbox-has-required-input"
                type="checkbox"
                checked={hasRequiredInput}
                onChange={e => {
                  setHasRequiredInput(e.target.checked);
                  if (!e.target.checked) {
                    setRequiredBait("");
                    setBaitAmount(0);
                  }
                }}
                className="w-4 h-4 rounded border-input"
              />
              <span className="font-medium text-zinc-300">Requires Input Item</span>
            </label>
            <span className="text-xs text-zinc-500">
              {hasRequiredInput ? "Player must have this item to perform the action (e.g., logs for firemaking, bait for fishing)" : "No input item required"}
            </span>
          </div>

          {hasRequiredInput && (
            <>
              <div>
                <label className={labelClass}>Required Item</label>
                <Input
                  data-testid="input-bait-search"
                  value={baitSearch}
                  onChange={e => setBaitSearch(e.target.value)}
                  placeholder="Search items..."
                  className={`${inputClass} mb-1`}
                />
                <select
                  data-testid="select-required-bait"
                  className={selectClass}
                  value={requiredBait}
                  onChange={e => setRequiredBait(e.target.value)}
                >
                  <option value="">-- Select Required Item --</option>
                  {requiredBait && !filteredBaitItems.find((i: any) => i.id === requiredBait) && (
                    <option value={requiredBait}>{allItems.find((i: any) => i.id === requiredBait)?.name || requiredBait}</option>
                  )}
                  {filteredBaitItems.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name || item.id} ({item.id})</option>
                  ))}
                </select>
                {selectedBaitItem && (
                  <div className="flex items-center gap-2 mt-2" data-testid="bait-preview">
                    {selectedBaitItem.icon && (
                      <img
                        src={selectedBaitItem.icon}
                        alt={selectedBaitItem.name}
                        className="w-8 h-8 object-contain rounded border border-zinc-600"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        data-testid="img-bait-preview"
                      />
                    )}
                    <span className="text-sm text-zinc-300">{selectedBaitItem.name}</span>
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>Required Amount</label>
                <Input
                  data-testid="input-bait-amount"
                  type="number"
                  value={baitAmount}
                  onChange={e => setBaitAmount(Number(e.target.value))}
                  min={1}
                  className={inputClass}
                />
              </div>
            </>
          )}
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
          data-testid="button-save-skill-action"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saving ? "Saving..." : isCreating ? "Create Skill Action" : "Save Changes"}
        </Button>
        <Button
          data-testid="button-cancel-skill-action"
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
