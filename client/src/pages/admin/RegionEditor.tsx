import { useState, useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaretDown, CaretRight, Upload } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";

interface RegionEditorProps {
  region: any | null;
  isCreating: boolean;
  onSave: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
  adminKey: string;
  allMonsters: any[];
  allItems: any[];
  allRegions?: any[];
  getAdminHeaders: (key: string) => Promise<Record<string, string>>;
  staffRole?: string | null;
}

const REGION_EMOJIS: Record<string, string> = {
  verdant: "🌲",
  quarry: "⛏️",
  dunes: "🏜️",
  obsidian: "🌋",
  dragonspire: "🐉",
  frozen_wastes: "❄️",
  void_realm: "🌀",
};

const LANGUAGES = ["en", "tr", "ru", "ar", "fr", "es", "zh", "hi"];
const LANGUAGE_LABELS: Record<string, string> = { en: "English", tr: "Turkish", ru: "Russian", ar: "Arabic", fr: "French", es: "Spanish", zh: "Chinese", hi: "Hindi" };

export default function RegionEditor({ region, isCreating, onSave, onCancel, saving, adminKey, allMonsters, allItems, allRegions, getAdminHeaders, staffRole }: RegionEditorProps) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [levelRangeMin, setLevelRangeMin] = useState(0);
  const [levelRangeMax, setLevelRangeMax] = useState(0);
  const [color, setColor] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [icon, setIcon] = useState("");
  const [mapPositionX, setMapPositionX] = useState(50);
  const [mapPositionY, setMapPositionY] = useState(50);
  const mapPreviewRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [nameTranslations, setNameTranslations] = useState<Record<string, string>>({});
  const [descriptionTranslations, setDescriptionTranslations] = useState<Record<string, string>>({});
  const isTranslator = staffRole === 'translator';
  const [translationsOpen, setTranslationsOpen] = useState(isTranslator);

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
      const sanitizedId = (id || 'region').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${sanitizedId}_${Date.now()}${ext}`;

      const response = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: { ...(await getAdminHeaders(adminKey)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: base64, fileName, folder: 'regions' }),
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

  const regionMonsters = useMemo(() => {
    if (!id || !allMonsters) return [];
    return allMonsters.filter((m: any) => m.regionId === id);
  }, [id, allMonsters]);

  useEffect(() => {
    if (region) {
      setId(region.id || "");
      setName(region.name || "");
      setDescription(region.description || "");
      setLevelRangeMin(region.levelRangeMin || 0);
      setLevelRangeMax(region.levelRangeMax || 0);
      setColor(region.color || "");
      setSortOrder(region.sortOrder || 0);
      setIcon(region.icon || "");
      const mp = region.mapPosition || { x: 50, y: 50 };
      setMapPositionX(mp.x ?? 50);
      setMapPositionY(mp.y ?? 50);

      const nt = typeof region.nameTranslations === "string" ? JSON.parse(region.nameTranslations) : (region.nameTranslations || {});
      setNameTranslations(nt);
      const dt = typeof region.descriptionTranslations === "string" ? JSON.parse(region.descriptionTranslations) : (region.descriptionTranslations || {});
      setDescriptionTranslations(dt);
      if (Object.keys(nt).length > 0 || Object.keys(dt).length > 0) {
        setTranslationsOpen(true);
      }
    }
  }, [region]);

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setMapPositionX(Math.max(0, Math.min(100, x)));
    setMapPositionY(Math.max(0, Math.min(100, y)));
  };

  const handleMapDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    handleMapClick(e);
  };

  const handleSave = () => {
    const data: any = {
      id,
      name,
      description,
      levelRangeMin,
      levelRangeMax,
      color,
      sortOrder: sortOrder || 0,
      icon: icon || null,
      mapPosition: { x: mapPositionX, y: mapPositionY },
      nameTranslations: Object.keys(nameTranslations).length > 0 ? nameTranslations : {},
      descriptionTranslations: Object.keys(descriptionTranslations).length > 0 ? descriptionTranslations : {},
    };
    onSave(data);
  };

  return (
    <div className="space-y-4" data-testid="region-editor">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white" data-testid="region-editor-title">
          {isCreating ? "Create Region" : `Edit: ${region?.name || ""}`}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !id || !name || (isCreating && isTranslator)} data-testid="button-save">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {!isTranslator && (<>
      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader><CardTitle className="text-white">Basic Info</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1 block">ID</label>
              <Input
                value={id}
                onChange={e => setId(e.target.value)}
                disabled={!isCreating}
                placeholder="region_id"
                data-testid="input-id"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1 block">Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Region Name"
                data-testid="input-name"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1 block">Description</label>
            <textarea
              className="flex w-full rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[60px] resize-y"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Region description..."
              data-testid="input-description"
            />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1 block">Level Min</label>
              <Input
                type="number"
                value={levelRangeMin}
                onChange={e => setLevelRangeMin(Number(e.target.value))}
                data-testid="input-level-min"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1 block">Level Max</label>
              <Input
                type="number"
                value={levelRangeMax}
                onChange={e => setLevelRangeMax(Number(e.target.value))}
                data-testid="input-level-max"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1 block">Color</label>
              <div className="flex gap-2 items-center">
                <Input
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  placeholder="#4ade80"
                  data-testid="input-color"
                  className="bg-zinc-800 border-zinc-600 text-white flex-1"
                />
                {color && (
                  <div
                    className="w-8 h-8 rounded border border-zinc-600 shrink-0"
                    style={{ backgroundColor: color }}
                    data-testid="color-preview"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1 block">Sort Order</label>
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
        <CardHeader><CardTitle className="text-white">Icon / Image</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1 block">Icon Path</label>
            <div className="flex gap-2 items-center">
              <Input
                value={icon}
                onChange={e => setIcon(e.target.value)}
                placeholder="/icons/region.png"
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
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader><CardTitle className="text-white">Map Position</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 items-center mb-2">
            <div>
              <label className="text-xs text-zinc-500">X (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={mapPositionX}
                onChange={e => setMapPositionX(Math.max(0, Math.min(100, Number(e.target.value))))}
                data-testid="input-map-x"
                className="bg-zinc-800 border-zinc-600 text-white w-20"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Y (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={mapPositionY}
                onChange={e => setMapPositionY(Math.max(0, Math.min(100, Number(e.target.value))))}
                data-testid="input-map-y"
                className="bg-zinc-800 border-zinc-600 text-white w-20"
              />
            </div>
            <p className="text-xs text-zinc-500 mt-4">Click on the map or drag the icon to set position</p>
          </div>
          <div
            ref={mapPreviewRef}
            data-testid="map-position-preview"
            className="relative w-full border border-zinc-600 rounded-lg overflow-hidden cursor-crosshair select-none"
            style={{ aspectRatio: '1408 / 768' }}
            onClick={handleMapClick}
            onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
            onMouseMove={handleMapDrag}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <img
              src="/images/world-map.webp"
              alt="World Map"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
            {(allRegions || []).filter(r => r.id !== id).map((r: any) => {
              const rPos = r.mapPosition || { x: 50, y: 50 };
              return (
                <div
                  key={r.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-zinc-800/70 border border-zinc-500/50 flex items-center justify-center pointer-events-none opacity-60"
                  style={{ left: `${rPos.x}%`, top: `${rPos.y}%` }}
                >
                  <span className="text-sm">{REGION_EMOJIS[r.id] || "📍"}</span>
                </div>
              );
            })}
            <div
              className="absolute transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-primary/30 border-2 border-primary flex items-center justify-center ring-4 ring-primary/20 animate-pulse z-10"
              style={{ left: `${mapPositionX}%`, top: `${mapPositionY}%` }}
            >
              <span className="text-lg">{REGION_EMOJIS[id] || "📍"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader><CardTitle className="text-white">Monsters in this Region</CardTitle></CardHeader>
        <CardContent>
          {regionMonsters.length === 0 ? (
            <p className="text-zinc-500 text-sm" data-testid="text-no-monsters">No monsters in this region</p>
          ) : (
            <div className="space-y-1" data-testid="list-region-monsters">
              {regionMonsters.map((m: any, i: number) => (
                <div key={i} className="text-sm text-zinc-300" data-testid={`region-monster-${i}`}>
                  {m.name || m.id} — Level: {m.attackLevel || 0}, HP: {m.maxHitpoints || 0}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </>)}

      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setTranslationsOpen(!translationsOpen)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              {translationsOpen ? <CaretDown className="w-4 h-4" /> : <CaretRight className="w-4 h-4" />}
              Translations
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={e => { e.stopPropagation(); handleAutoTranslate(); }}
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
              <h4 className="text-sm font-medium text-zinc-400 mb-2">Name Translations</h4>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map(lang => (
                  <div key={`name-${lang}`}>
                    <label className="text-xs text-zinc-500">{LANGUAGE_LABELS[lang]}</label>
                    <Input
                      value={nameTranslations[lang] || ""}
                      onChange={e => setNameTranslations(prev => ({ ...prev, [lang]: e.target.value }))}
                      placeholder={`${LANGUAGE_LABELS[lang]} name`}
                      data-testid={`input-name-translation-${lang}`}
                      className="bg-zinc-800 border-zinc-600 text-white"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-zinc-400 mb-2">Description Translations</h4>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map(lang => (
                  <div key={`desc-${lang}`}>
                    <label className="text-xs text-zinc-500">{LANGUAGE_LABELS[lang]}</label>
                    <textarea
                      className="flex w-full rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[40px] resize-y"
                      value={descriptionTranslations[lang] || ""}
                      onChange={e => setDescriptionTranslations(prev => ({ ...prev, [lang]: e.target.value }))}
                      placeholder={`${LANGUAGE_LABELS[lang]} description`}
                      data-testid={`input-desc-translation-${lang}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving} data-testid="button-cancel-bottom">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || !id || !name || (isCreating && isTranslator)} data-testid="button-save-bottom">
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
