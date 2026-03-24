import { db } from "../../db";
import { eq } from "drizzle-orm";
import {
  partySynergies,
  type PartySynergy,
  type PartySynergyConditions,
  type PartySynergyBonuses,
} from "@shared/schema";

export interface PartyMember {
  role: string;
  guildId?: string;
}

export interface SynergyBonuses {
  lootBonus: number;
  xpBonus: number;
  goldBonus: number;
  damageBonus: number;
  defenceBonus: number;
  aggroShare: boolean;
}

export interface LocalizedSynergy extends PartySynergy {
  localizedName: string;
  localizedDescription: string;
}

export class SynergyService {
  private synergyCache: Map<string, PartySynergy> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private async refreshCacheIfNeeded(): Promise<void> {
    if (Date.now() < this.cacheExpiry) return;

    const allSynergies = await db.select()
      .from(partySynergies)
      .where(eq(partySynergies.isActive, 1));

    this.synergyCache.clear();

    for (const synergy of allSynergies) {
      this.synergyCache.set(synergy.id, synergy);
    }

    this.cacheExpiry = Date.now() + this.CACHE_DURATION;
  }

  private getLocalizedName(synergy: PartySynergy, language: string = 'en'): string {
    const translations = synergy.nameTranslations as Record<string, string>;
    return translations[language] || synergy.name;
  }

  private getLocalizedDescription(synergy: PartySynergy, language: string = 'en'): string {
    const translations = synergy.descriptionTranslations as Record<string, string>;
    return translations[language] || synergy.description;
  }

  async getSynergies(language: string = 'en'): Promise<LocalizedSynergy[]> {
    await this.refreshCacheIfNeeded();

    return Array.from(this.synergyCache.values()).map(synergy => ({
      ...synergy,
      localizedName: this.getLocalizedName(synergy, language),
      localizedDescription: this.getLocalizedDescription(synergy, language),
    }));
  }

  async getSynergyById(id: string, language: string = 'en'): Promise<LocalizedSynergy | null> {
    await this.refreshCacheIfNeeded();

    const synergy = this.synergyCache.get(id);
    if (!synergy) return null;

    return {
      ...synergy,
      localizedName: this.getLocalizedName(synergy, language),
      localizedDescription: this.getLocalizedDescription(synergy, language),
    };
  }

  checkSynergyConditions(synergy: PartySynergy, partyMembers: PartyMember[]): boolean {
    if (partyMembers.length === 0) return false;

    const requiredRoles = (synergy.requiredRoles as string[]) || [];
    const conditions = (synergy.requiredConditions as PartySynergyConditions) || {};

    // Check required roles
    if (requiredRoles.length > 0) {
      const partyRoles = new Set(partyMembers.map(m => m.role.toLowerCase()));
      for (const role of requiredRoles) {
        if (!partyRoles.has(role.toLowerCase())) {
          return false;
        }
      }
    }

    // Check minSize condition
    if (conditions.minSize !== undefined && partyMembers.length < conditions.minSize) {
      return false;
    }

    // Check maxSize condition
    if (conditions.maxSize !== undefined && partyMembers.length > conditions.maxSize) {
      return false;
    }

    // Check sameGuild condition
    if (conditions.sameGuild === true) {
      const guildIds = partyMembers.map(m => m.guildId).filter(Boolean);
      if (guildIds.length !== partyMembers.length) {
        // Not all members have a guild
        return false;
      }
      const uniqueGuilds = new Set(guildIds);
      if (uniqueGuilds.size !== 1) {
        // Members are from different guilds
        return false;
      }
    }

    return true;
  }

  async calculatePartySynergies(partyMembers: PartyMember[]): Promise<LocalizedSynergy[]> {
    await this.refreshCacheIfNeeded();

    const activeSynergies: LocalizedSynergy[] = [];
    const allSynergies = Array.from(this.synergyCache.values());

    for (const synergy of allSynergies) {
      if (this.checkSynergyConditions(synergy, partyMembers)) {
        activeSynergies.push({
          ...synergy,
          localizedName: this.getLocalizedName(synergy),
          localizedDescription: this.getLocalizedDescription(synergy),
        });
      }
    }

    return activeSynergies;
  }

  async calculateSynergyBonuses(partyMembers: PartyMember[]): Promise<SynergyBonuses> {
    const activeSynergies = await this.calculatePartySynergies(partyMembers);

    const aggregatedBonuses: SynergyBonuses = {
      lootBonus: 0,
      xpBonus: 0,
      goldBonus: 0,
      damageBonus: 0,
      defenceBonus: 0,
      aggroShare: false,
    };

    for (const synergy of activeSynergies) {
      const bonuses = (synergy.bonuses as PartySynergyBonuses & { goldBonus?: number; aggroShare?: boolean }) || {};
      
      if (bonuses.lootBonus) aggregatedBonuses.lootBonus += bonuses.lootBonus;
      if (bonuses.xpBonus) aggregatedBonuses.xpBonus += bonuses.xpBonus;
      if (bonuses.goldBonus) aggregatedBonuses.goldBonus += bonuses.goldBonus;
      if (bonuses.damageBonus) aggregatedBonuses.damageBonus += bonuses.damageBonus;
      if (bonuses.defenceBonus) aggregatedBonuses.defenceBonus += bonuses.defenceBonus;
      if (bonuses.aggroShare) aggregatedBonuses.aggroShare = true;
    }

    return aggregatedBonuses;
  }

  invalidateCache(): void {
    this.synergyCache.clear();
    this.cacheExpiry = 0;
  }
}

export const synergyService = new SynergyService();
