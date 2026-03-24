import { useState, useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash, Plus, Upload } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";

interface RecipeEditorProps {
  recipe: any | null;
  isCreating: boolean;
  onSave: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
  regions: any[];
  allItems: any[];
  adminKey?: string;
  getAdminHeaders?: (key: string) => Promise<Record<string, string>>;
  staffRole?: string | null;
}

interface MaterialEntry {
  itemId: string;
  quantity: number;
}

const SKILLS = ["crafting", "cooking", "alchemy", "smelting"];
const CATEGORIES = [
  "smelting",
  "weapon",
  "shield",
  "armor",
  "accessory",
  "cooking",
  "potion",
  "fletching",
  "staff",
];

export default function RecipeEditor({
  recipe,
  isCreating,
  onSave,
  onCancel,
  saving,
  regions,
  allItems,
  adminKey,
  getAdminHeaders,
  staffRole,
}: RecipeEditorProps) {
  const [isDraft, setIsDraft] = useState(0);
  const [id, setId] = useState("");
  const [resultItemId, setResultItemId] = useState("");
  const [resultQuantity, setResultQuantity] = useState(1);
  const [skill, setSkill] = useState("crafting");
  const [levelRequired, setLevelRequired] = useState(1);
  const [xpReward, setXpReward] = useState(0);
  const [craftTime, setCraftTime] = useState(3000);
  const [category, setCategory] = useState("weapon");
  const [regionId, setRegionId] = useState("");
  const [regionIds, setRegionIds] = useState<string[]>([]);
  const [materials, setMaterials] = useState<MaterialEntry[]>([]);
  const isTranslator = staffRole === "translator";
  const [regionError, setRegionError] = useState(false);
  const [materialSearches, setMaterialSearches] = useState<
    Record<number, string>
  >({});
  const [resultItemSearch, setResultItemSearch] = useState("");
  const { toast } = useToast();
  const currentLanguage = "en";

  useEffect(() => {
    if (recipe) {
      setIsDraft(recipe.isDraft || 0);
      setId(recipe.id || "");
      setResultItemId(recipe.resultItemId || "");
      setResultQuantity(recipe.resultQuantity || 1);
      setSkill(recipe.skill || "crafting");
      setLevelRequired(recipe.levelRequired || 1);
      setXpReward(recipe.xpReward || 0);
      setCraftTime(recipe.craftTime || 3000);
      setCategory(recipe.category || "weapon");
      setRegionId(recipe.regionId || "");

      if (recipe.regionIds) {
        const rids =
          typeof recipe.regionIds === "string"
            ? JSON.parse(recipe.regionIds)
            : recipe.regionIds || [];
        setRegionIds(Array.isArray(rids) ? rids : []);
      } else if (recipe.regionId) {
        setRegionIds([recipe.regionId]);
      } else {
        setRegionIds([]);
      }

      const mats =
        typeof recipe.materials === "string"
          ? JSON.parse(recipe.materials)
          : recipe.materials || [];
      setMaterials(
        Array.isArray(mats)
          ? mats.map((m: any) => ({
              itemId: m.itemId || "",
              quantity: m.quantity || 1,
            }))
          : [],
      );
    }
  }, [recipe]);

  const getItemName = (itemId: string) => {
    const item = allItems.find((i: any) => i.id === itemId);
    return item ? item.name : itemId;
  };

  const getItemIcon = (itemId: string) => {
    const item = allItems.find((i: any) => i.id === itemId);
    return item?.icon || null;
  };

  const selectedResultItem = useMemo(() => {
    if (!resultItemId) return null;
    return allItems.find((i: any) => i.id === resultItemId) || null;
  }, [resultItemId, allItems]);

  const filteredResultItems = useMemo(() => {
    if (!resultItemSearch) return allItems.slice(0, 50);
    const search = resultItemSearch.toLowerCase();
    return allItems
      .filter(
        (item: any) =>
          item.id.toLowerCase().includes(search) ||
          (item.name && item.name.toLowerCase().includes(search)),
      )
      .slice(0, 50);
  }, [allItems, resultItemSearch]);

  const getFilteredMaterialItems = (index: number) => {
    const search = materialSearches[index] || "";
    if (!search) return allItems.slice(0, 50);
    const s = search.toLowerCase();
    return allItems
      .filter(
        (item: any) =>
          item.id.toLowerCase().includes(s) ||
          (item.name && item.name.toLowerCase().includes(s)),
      )
      .slice(0, 50);
  };
  const getRegionName = (r: any) => {
    if (!r) return "";

    let translations = r.nameTranslations;

    // Eğer string geldiyse JSON'a çevir
    if (typeof translations === "string") {
      try {
        translations = JSON.parse(translations);
      } catch {
        translations = {};
      }
    }

    return translations?.[currentLanguage] || r.name || r.id;
  };
  const toggleRegion = (rid: string) => {
    setRegionIds((prev) => {
      if (prev.includes(rid)) {
        return prev.filter((r) => r !== rid);
      } else {
        return [...prev, rid];
      }
    });
    setRegionError(false);
  };

  const handleSave = () => {
    if (!id || !skill) {
      toast({ title: "Missing required fields", description: "ID and Skill are required.", variant: "destructive" });
      return;
    }
    if (!resultItemId) {
      toast({ title: "Missing Result Item", description: "You must select a result item before saving.", variant: "destructive" });
      return;
    }
    if (materials.length === 0 || materials.some(m => !m.itemId)) {
      toast({ title: "Missing Materials", description: "At least one material with a valid item is required.", variant: "destructive" });
      return;
    }
    if (regionIds.length === 0 && !regionId) {
      setRegionError(true);
      return;
    }
    setRegionError(false);

    const data: any = {
      id,
      isDraft,
      resultItemId,
      resultQuantity: resultQuantity || 1,
      skill,
      levelRequired: levelRequired || 1,
      xpReward: xpReward || 0,
      craftTime: craftTime || 3000,
      category,
      regionId: regionIds.length > 0 ? regionIds[0] : regionId,
      regionIds: regionIds.length > 0 ? regionIds : regionId ? [regionId] : [],
      materials: materials.map((m) => ({
        itemId: m.itemId,
        quantity: m.quantity,
      })),
    };

    onSave(data);
  };

  const addMaterial = () => {
    setMaterials((prev) => [...prev, { itemId: "", quantity: 1 }]);
  };

  const removeMaterial = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
    setMaterialSearches((prev) => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  };

  const updateMaterial = (
    index: number,
    field: keyof MaterialEntry,
    value: any,
  ) => {
    setMaterials((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const selectClass =
    "flex h-10 w-full rounded-md border border-zinc-600 bg-zinc-800 text-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const inputClass = "bg-zinc-800 border-zinc-600 text-white";
  const labelClass = "text-sm font-medium text-zinc-300 mb-1 block";

  return (
    <div
      className="space-y-4 max-h-[80vh] overflow-y-auto pr-2"
      data-testid="recipe-editor"
    >
      <h2 className="text-xl font-bold text-white">
        {isCreating ? "Create Recipe" : `Edit: ${recipe?.id || "Recipe"}`}
      </h2>

      {!isTranslator && (
        <>
          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Basic Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={`flex items-center gap-3 p-3 rounded-md border ${isDraft ? "border-yellow-500/50 bg-yellow-500/10" : "border-green-500/50 bg-green-500/10"}`}
              >
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    data-testid="checkbox-is-draft"
                    type="checkbox"
                    checked={isDraft === 1}
                    onChange={(e) => setIsDraft(e.target.checked ? 1 : 0)}
                    className="w-4 h-4 rounded border-input"
                  />
                  <span className="font-medium text-white">Mark as Draft</span>
                </label>
                {isDraft ? (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">
                    DRAFT
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/50">
                    LIVE
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>ID</label>
                  <Input
                    data-testid="input-recipe-id"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    disabled={!isCreating}
                    placeholder="recipe_id"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Result Item</label>
                  <Input
                    data-testid="input-result-item-search"
                    value={resultItemSearch}
                    onChange={(e) => setResultItemSearch(e.target.value)}
                    placeholder="Search items..."
                    className={`mb-1 ${inputClass}`}
                  />
                  <select
                    data-testid="select-result-item"
                    className={selectClass}
                    value={resultItemId}
                    onChange={(e) => setResultItemId(e.target.value)}
                  >
                    <option value="">-- Select Item --</option>
                    {resultItemId &&
                      !filteredResultItems.find(
                        (i: any) => i.id === resultItemId,
                      ) && (
                        <option value={resultItemId}>
                          {getItemName(resultItemId)}
                        </option>
                      )}
                    {filteredResultItems.map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.id})
                      </option>
                    ))}
                  </select>
                  {selectedResultItem && (
                    <div
                      className="flex items-center gap-2 mt-2 p-2 rounded-md border border-zinc-700 bg-zinc-800/50"
                      data-testid="result-item-preview"
                    >
                      {selectedResultItem.icon && (
                        <img
                          src={selectedResultItem.icon}
                          alt={selectedResultItem.name}
                          className="w-8 h-8 object-contain rounded border border-zinc-600"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                          data-testid="img-result-item-preview"
                        />
                      )}
                      <span className="text-sm text-white">
                        {selectedResultItem.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Result Quantity</label>
                  <Input
                    data-testid="input-result-quantity"
                    type="number"
                    value={resultQuantity}
                    onChange={(e) => setResultQuantity(Number(e.target.value))}
                    min={1}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Skill</label>
                  <select
                    data-testid="select-skill"
                    className={selectClass}
                    value={skill}
                    onChange={(e) => setSkill(e.target.value)}
                  >
                    {SKILLS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Category</label>
                  <select
                    data-testid="select-category"
                    className={selectClass}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Level Required</label>
                  <Input
                    data-testid="input-level-required"
                    type="number"
                    value={levelRequired}
                    onChange={(e) => setLevelRequired(Number(e.target.value))}
                    min={1}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>XP Reward</label>
                  <Input
                    data-testid="input-xp-reward"
                    type="number"
                    value={xpReward}
                    onChange={(e) => setXpReward(Number(e.target.value))}
                    min={0}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Craft Time (ms)</label>
                  <Input
                    data-testid="input-craft-time"
                    type="number"
                    value={craftTime}
                    onChange={(e) => setCraftTime(Number(e.target.value))}
                    min={0}
                    className={inputClass}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Regions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className={labelClass}>
                  Available Regions{" "}
                  <span className="text-xs text-zinc-500">
                    (select one or more)
                  </span>
                </label>
                <div
                  className={`grid grid-cols-2 gap-2 p-3 rounded-md border ${regionError ? "border-red-500" : "border-zinc-700"} bg-zinc-800/50`}
                >
                  {regions.map((r: any) => (
                    <label
                      key={r.id}
                      className="flex items-center gap-2 text-sm cursor-pointer text-zinc-300 hover:text-white"
                      data-testid={`checkbox-region-${r.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={regionIds.includes(r.id)}
                        onChange={() => toggleRegion(r.id)}
                        className="w-4 h-4 rounded border-input"
                      />
                      <span>{getRegionName(r)}</span>
                    </label>
                  ))}
                </div>
                {regionError && (
                  <p
                    className="text-xs text-red-500 mt-1"
                    data-testid="text-region-error"
                  >
                    At least one region is required
                  </p>
                )}
                {regionIds.length > 0 && (
                  <p className="text-xs text-zinc-500 mt-1">
                    {regionIds.length} region(s) selected
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg text-white">Materials</CardTitle>
              <Button
                data-testid="button-add-material"
                variant="outline"
                size="sm"
                onClick={addMaterial}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Material
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {materials.length === 0 && (
                <p
                  className="text-sm text-zinc-400"
                  data-testid="text-no-materials"
                >
                  No materials added yet.
                </p>
              )}
              {materials.map((mat, index) => {
                const matItem = mat.itemId
                  ? allItems.find((i: any) => i.id === mat.itemId)
                  : null;
                return (
                  <div
                    key={index}
                    className="flex items-end gap-2 p-3 rounded-md border border-zinc-700 bg-zinc-800/50"
                    data-testid={`material-entry-${index}`}
                  >
                    {matItem?.icon && (
                      <div className="flex items-center mb-0.5">
                        <img
                          src={matItem.icon}
                          alt={matItem.name}
                          className="w-8 h-8 object-contain rounded border border-zinc-600"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                          data-testid={`img-material-${index}`}
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <label className={labelClass}>Item</label>
                      <Input
                        data-testid={`input-material-search-${index}`}
                        value={materialSearches[index] || ""}
                        onChange={(e) =>
                          setMaterialSearches((prev) => ({
                            ...prev,
                            [index]: e.target.value,
                          }))
                        }
                        placeholder="Search items..."
                        className={`mb-1 ${inputClass}`}
                      />
                      <select
                        data-testid={`select-material-item-${index}`}
                        className={selectClass}
                        value={mat.itemId}
                        onChange={(e) =>
                          updateMaterial(index, "itemId", e.target.value)
                        }
                      >
                        <option value="">-- Select Item --</option>
                        {mat.itemId &&
                          !getFilteredMaterialItems(index).find(
                            (i: any) => i.id === mat.itemId,
                          ) && (
                            <option value={mat.itemId}>
                              {getItemName(mat.itemId)}
                            </option>
                          )}
                        {getFilteredMaterialItems(index).map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.id})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className={labelClass}>Qty</label>
                      <Input
                        data-testid={`input-material-quantity-${index}`}
                        type="number"
                        value={mat.quantity}
                        onChange={(e) =>
                          updateMaterial(
                            index,
                            "quantity",
                            Number(e.target.value),
                          )
                        }
                        min={1}
                        className={inputClass}
                      />
                    </div>
                    <Button
                      data-testid={`button-remove-material-${index}`}
                      variant="destructive"
                      size="sm"
                      onClick={() => removeMaterial(index)}
                      className="mb-0.5"
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {isTranslator && (
        <p className="text-zinc-400 text-sm">
          No translations available for recipes.
        </p>
      )}

      <div className="flex gap-3 justify-end pt-2">
        <Button
          data-testid="button-cancel-recipe"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          data-testid="button-save-recipe"
          onClick={handleSave}
          disabled={saving || (isCreating && isTranslator)}
        >
          {saving ? "Saving..." : isCreating ? "Create Recipe" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
