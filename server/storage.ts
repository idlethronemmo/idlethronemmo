// @ts-nocheck
import { type Player, type InsertPlayer, type UpdatePlayer, players, type User, type UpsertUser, users, type Badge, type InsertBadge, type PlayerBadge, badges, playerBadges, type MarketListing, type InsertMarketListing, marketListings, type Notification, type InsertNotification, notifications, type Trade, type InsertTrade, trades, type Guild, type InsertGuild, guilds, type GuildMember, type InsertGuildMember, guildMembers, type GuildUpgrade, type InsertGuildUpgrade, guildUpgrades, type GuildMessage, type InsertGuildMessage, guildMessages, type GuildJoinRequest, type InsertGuildJoinRequest, guildJoinRequests, type GuildInvite, type InsertGuildInvite, guildInvites, DAILY_CONTRIBUTION_CAP, getGuildLevelXp, isNotificationPersistent, type PushSubscription, type InsertPushSubscription, pushSubscriptionsTable, type GuildBonuses, calculateGuildBonuses, gameItems, type GameItem, type InsertGameItem, gameRecipes, type GameRecipe, type InsertGameRecipe, gameCombatRegions, type GameCombatRegion, type InsertGameCombatRegion, gameMonsters, type GameMonster, type InsertGameMonster, raidBosses, raidParticipation, raidTokens, raidShopPurchases, guildRaids, gameSkillActions, type GameSkillAction, type InsertGameSkillAction, equipmentSets, type EquipmentSet, suspiciousActivities, type SuspiciousActivity, bannedEmails, type BannedEmail, achievements, type Achievement, type InsertAchievement, playerAchievements, type PlayerAchievement, marketPriceHistory, buyOrders, type BuyOrder, MARKET_BUY_TAX, MARKET_BUY_ORDER_TAX } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, ne, gte, lt, lte, sql, inArray, ilike, isNotNull } from "drizzle-orm";
import { isItemTradable, isEquipmentItem } from "@shared/itemData";

export interface IStorage {
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  // Player operations
  getPlayer(id: string): Promise<Player | undefined>;
  getPlayerByUsername(username: string): Promise<Player | undefined>;
  getPlayerByUserId(userId: string): Promise<Player | undefined>;
  getPlayerByEmail(email: string): Promise<Player | undefined>;
  getPlayerByFirebaseUid(firebaseUid: string): Promise<Player | undefined>;
  linkPlayerToFirebase(playerId: string, firebaseUid: string, email: string): Promise<Player | undefined>;
  searchPlayersByUsername(searchTerm: string, limit?: number): Promise<Player[]>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, updates: UpdatePlayer): Promise<Player | undefined>;
  updatePlayerWithUsername(id: string, updates: UpdatePlayer & { username?: string; firebaseUid?: string; isGuest?: number; tradeEnabled?: number }): Promise<Player | undefined>;
  updateTradeEnabled(id: string, enabled: boolean): Promise<Player | undefined>;
  checkUsernameAvailable(username: string): Promise<boolean>;
  getLeaderboard(limit?: number): Promise<Player[]>;
  clearActiveTaskByUserId(userId: string): Promise<void>;
  updateLastSeen(playerId: string): Promise<void>;
  updateSessionToken(playerId: string, token: string): Promise<void>;
  getSessionToken(playerId: string): Promise<string | null>;
  getPlayerBySessionToken(sessionToken: string): Promise<Player | undefined>;
  // Badge operations
  getBadge(id: string): Promise<Badge | undefined>;
  getAllBadges(): Promise<Badge[]>;
  createBadge(badge: InsertBadge): Promise<Badge>;
  updateBadge(id: string, updates: Partial<InsertBadge>): Promise<Badge | undefined>;
  deleteBadge(id: string): Promise<boolean>;
  getPlayerBadges(playerId: string): Promise<(PlayerBadge & { badge: Badge })[]>;
  awardBadge(playerId: string, badgeId: string): Promise<PlayerBadge>;
  removeBadge(playerId: string, badgeId: string): Promise<boolean>;
  // Market operations
  getMarketListings(excludeSellerId?: string): Promise<(MarketListing & { seller: Player })[]>;
  getPlayerListings(playerId: string): Promise<MarketListing[]>;
  getMarketListing(id: string): Promise<MarketListing | undefined>;
  createMarketListing(listing: InsertMarketListing): Promise<MarketListing>;
  cancelMarketListing(id: string, sellerId: string): Promise<boolean>;
  buyMarketListing(id: string, buyerId: string, quantity: number): Promise<{ success: boolean; error?: string; listing?: MarketListing; sellerId?: string; totalCost?: number; buyerGold?: number; buyerInventory?: Record<string, number>; buyerItemModifications?: Record<string, any>; remainingQuantity?: number }>;
  bulkBuyMarketListings(itemId: string, buyerId: string, quantity: number, maxPricePerItem?: number): Promise<{ success: boolean; error?: string; itemId?: string; totalCost?: number; totalQuantity?: number; buyerGold?: number; buyerInventory?: Record<string, number>; buyerItemModifications?: Record<string, any>; sellers?: Array<{ sellerId: string; listingId: string; quantity: number; pricePerItem: number; goldEarned: number; remainingQuantity: number }> }>;
  getGroupedMarketListings(page: number, limit: number, search?: string, sort?: string, enhFilters?: { enhMinLevel?: number; enhSkill?: string; enhStat?: string }, userOnly?: boolean, categoryFilters?: { itemType?: string; equipSlot?: string; weaponCategory?: string; armorType?: string; materialSub?: string }, regionFilter?: string): Promise<{
    groups: {
      itemId: string;
      latestListing: MarketListing & { seller: { id: string; username: string } };
      listingCount: number;
      lowestPrice: number;
      highestPrice: number;
      totalQuantity: number;
    }[];
    totalGroups: number;
    page: number;
    limit: number;
  }>;
  getListingsByItemId(itemId: string): Promise<(MarketListing & { seller: { id: string; username: string } })[]>;
  processAutoSellListings(): Promise<number>;
  // Buy order operations
  getBuyOrdersForItem(itemId: string): Promise<(BuyOrder & { buyer: { id: string; username: string } })[]>;
  getMyBuyOrders(buyerId: string): Promise<(BuyOrder & { buyer: { id: string; username: string } })[]>;
  createBuyOrder(buyerId: string, itemId: string, quantity: number, pricePerItem: number): Promise<{ success: boolean; error?: string; order?: BuyOrder; buyerGold?: number }>;
  cancelBuyOrder(id: string, buyerId: string): Promise<{ success: boolean; error?: string; buyerGold?: number }>;
  fillBuyOrder(orderId: string, sellerId: string, quantity: number): Promise<{ success: boolean; error?: string; goldEarned?: number; sellerGold?: number; newInventory?: Record<string, number>; newItemModifications?: Record<string, any>; remainingQuantity?: number; buyerId?: string; itemId?: string; filledQuantity?: number }>;
  getPlayerTransactions(playerId: string, limit?: number): Promise<{ id: number; itemId: string; quantity: number; pricePerItem: number; soldAt: Date | null; role: "buyer" | "seller"; otherUsername: string }[]>;
  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(playerId: string, limit?: number, unreadOnly?: boolean): Promise<Notification[]>;
  markNotificationsRead(playerId: string, ids?: string[]): Promise<number>;
  getUnreadNotificationCount(playerId: string): Promise<number>;
  deleteTransientNotifications(playerId: string): Promise<number>;
  deleteReadPersistentNotifications(playerId: string): Promise<number>;
  cleanupOldNotifications(playerId: string): Promise<number>;
  // Trade operations
  createTrade(trade: InsertTrade): Promise<Trade>;
  getTrade(id: string): Promise<Trade | undefined>;
  updateTrade(id: string, updates: Partial<Trade>): Promise<Trade | undefined>;
  getTradeOffers(playerId: string, type: 'incoming' | 'outgoing' | 'all'): Promise<Trade[]>;
  getPendingTradeCount(playerId: string): Promise<number>;
  executeTradeAtomic(tradeId: string): Promise<{ success: boolean; error?: string }>;
  expireOldTrades(): Promise<number>;
  
  // Guild operations
  createGuild(guild: InsertGuild): Promise<Guild>;
  getGuild(id: string): Promise<Guild | undefined>;
  getGuildByName(name: string): Promise<Guild | undefined>;
  updateGuild(id: string, updates: Partial<Guild>): Promise<Guild | undefined>;
  deleteGuild(id: string): Promise<boolean>;
  getAllGuilds(): Promise<Guild[]>;
  searchGuilds(searchTerm: string): Promise<Guild[]>;
  
  // Guild member operations
  addGuildMember(member: InsertGuildMember): Promise<GuildMember>;
  removeGuildMember(guildId: string, playerId: string): Promise<boolean>;
  getGuildMembers(guildId: string): Promise<(GuildMember & { player: Player })[]>;
  getPlayerGuild(playerId: string): Promise<{ guild: Guild; membership: GuildMember } | undefined>;
  updateMemberRole(guildId: string, playerId: string, role: string): Promise<GuildMember | undefined>;
  addGuildContribution(playerId: string, amount: number): Promise<{ memberContribution: number; guildXp: number; guildLevelUp: boolean } | undefined>;
  creditGuildBankResources(guildId: string, resources: Partial<Record<'gold' | 'wood' | 'ore' | 'metal' | 'food' | 'monster' | 'rare', number>>): Promise<void>;
  resetDailyContributions(): Promise<void>;
  
  // Guild upgrade operations
  getGuildUpgrades(guildId: string): Promise<GuildUpgrade[]>;
  purchaseGuildUpgrade(guildId: string, upgradeType: string, cost: number): Promise<GuildUpgrade | undefined>;
  purchaseGuildUpgradeWithBankResources(guildId: string, upgradeType: string, resourceCosts: { category: string; amount: number }[]): Promise<{ success: boolean; upgrade?: GuildUpgrade; error?: string }>;
  getPlayerGuildBonuses(playerId: string): Promise<GuildBonuses | null>;
  
  // Guild message operations
  createGuildMessage(message: InsertGuildMessage): Promise<GuildMessage>;
  getGuildMessages(guildId: string, limit?: number): Promise<GuildMessage[]>;
  
  // Guild join request operations
  createJoinRequest(request: InsertGuildJoinRequest): Promise<GuildJoinRequest>;
  getGuildJoinRequests(guildId: string): Promise<GuildJoinRequest[]>;
  getPlayerJoinRequests(playerId: string): Promise<GuildJoinRequest[]>;
  respondToJoinRequest(requestId: string, status: 'accepted' | 'rejected', respondedBy: string): Promise<GuildJoinRequest | undefined>;
  cancelJoinRequest(requestId: string, playerId: string): Promise<boolean>;
  
  // Guild invite operations
  createGuildInvite(invite: InsertGuildInvite): Promise<GuildInvite>;
  getPlayerPendingInvites(playerId: string): Promise<GuildInvite[]>;
  getGuildSentInvites(guildId: string): Promise<GuildInvite[]>;
  respondToGuildInvite(inviteId: string, playerId: string, accept: boolean): Promise<{ success: boolean; error?: string }>;
  cancelGuildInvite(inviteId: string, guildId: string): Promise<boolean>;
  hasPendingInvite(guildId: string, targetPlayerId: string): Promise<boolean>;
  
  // Push subscription operations
  savePushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  getPushSubscription(playerId: string): Promise<PushSubscription | undefined>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
  deletePushSubscription(playerId: string): Promise<boolean>;
  
  // Equipment durability operations
  breakEquipment(playerId: string, slot: string): Promise<{ success: boolean; itemId?: string; error?: string }>;
  repairEquipment(playerId: string, slot: string, cost: number): Promise<{ success: boolean; error?: string }>;
  repairAllEquipment(playerId: string, totalCost: number): Promise<{ success: boolean; error?: string }>;
  updateEquipmentDurability(playerId: string, durability: Record<string, number>): Promise<boolean>;
  
  // Scheduler operations
  getPlayersWithActiveCombat(): Promise<Player[]>;
  getPlayersWithActiveTasks(): Promise<Player[]>;
  getPlayersWithActiveTravel(): Promise<Player[]>;
  
  // Game Data operations (Items, Recipes, Regions, Monsters)
  getAllGameItems(): Promise<GameItem[]>;
  getGameItem(id: string): Promise<GameItem | undefined>;
  createGameItem(item: InsertGameItem): Promise<GameItem>;
  updateGameItem(id: string, updates: Partial<InsertGameItem>): Promise<GameItem | undefined>;
  deleteGameItem(id: string): Promise<boolean>;
  bulkCreateGameItems(items: InsertGameItem[]): Promise<number>;
  
  getAllGameRecipes(): Promise<GameRecipe[]>;
  getGameRecipe(id: string): Promise<GameRecipe | undefined>;
  createGameRecipe(recipe: InsertGameRecipe): Promise<GameRecipe>;
  updateGameRecipe(id: string, updates: Partial<InsertGameRecipe>): Promise<GameRecipe | undefined>;
  deleteGameRecipe(id: string): Promise<boolean>;
  bulkCreateGameRecipes(recipes: InsertGameRecipe[]): Promise<number>;
  
  // Equipment Sets operations
  getAllEquipmentSets(): Promise<EquipmentSet[]>;
  
  getAllCombatRegions(): Promise<GameCombatRegion[]>;
  getCombatRegion(id: string): Promise<GameCombatRegion | undefined>;
  createCombatRegion(region: InsertGameCombatRegion): Promise<GameCombatRegion>;
  updateCombatRegion(id: string, updates: Partial<InsertGameCombatRegion>): Promise<GameCombatRegion | undefined>;
  deleteCombatRegion(id: string): Promise<boolean>;
  bulkCreateCombatRegions(regions: InsertGameCombatRegion[]): Promise<number>;
  
  getAllGameMonsters(): Promise<GameMonster[]>;
  getGameMonster(id: string): Promise<GameMonster | undefined>;
  getMonstersByRegion(regionId: string): Promise<GameMonster[]>;
  createGameMonster(monster: InsertGameMonster): Promise<GameMonster>;
  updateGameMonster(id: string, updates: Partial<InsertGameMonster>): Promise<GameMonster | undefined>;
  deleteGameMonster(id: string): Promise<boolean>;
  bulkCreateGameMonsters(monsters: InsertGameMonster[]): Promise<number>;
  
  // Skill Actions operations
  getAllSkillActions(): Promise<GameSkillAction[]>;
  getSkillActionsBySkill(skill: string): Promise<GameSkillAction[]>;
  getSkillAction(id: string): Promise<GameSkillAction | undefined>;
  createSkillAction(action: InsertGameSkillAction): Promise<GameSkillAction>;
  updateSkillAction(id: string, updates: Partial<InsertGameSkillAction>): Promise<GameSkillAction | undefined>;
  deleteSkillAction(id: string): Promise<boolean>;
  bulkCreateSkillActions(actions: InsertGameSkillAction[]): Promise<number>;
  
  // Admin player management operations
  getAllPlayersForAdmin(): Promise<{ id: string; username: string; email: string | null; totalLevel: number; gold: number; lastSaved: Date | null; lastSeen: Date | null }[]>;
  deletePlayerCompletely(playerId: string): Promise<boolean>;
  
  // Raid system operations
  getAllRaidBosses(): Promise<any[]>;
  getRaidBoss(id: string): Promise<any | undefined>;
  updateRaidBoss(id: string, updates: Record<string, any>): Promise<any | undefined>;
  getCurrentWeekBoss(): Promise<any | undefined>;
  getCurrentWeekBossWithReset(): Promise<{ boss: any; weekEndsAt: Date } | undefined>;
  getPremiumBoss(): Promise<any | undefined>;
  
  getActiveGuildRaid(guildId: string): Promise<any | undefined>;
  getScheduledGuildRaid(guildId: string): Promise<any | undefined>;
  getActiveOrScheduledGuildRaid(guildId: string): Promise<any | undefined>;
  getLastCompletedGuildRaid(guildId: string): Promise<any | undefined>;
  getActiveRaidsByBossId(bossId: string): Promise<any[]>;
  createGuildRaid(guildId: string, bossId: string, difficulty: string, startedBy: string): Promise<any>;
  scheduleGuildRaid(guildId: string, bossId: string, difficulty: string, startedBy: string): Promise<any>;
  activateScheduledRaid(raidId: string): Promise<any | undefined>;
  getRaidParticipants(raidId: string): Promise<any[]>;
  updateGuildRaid(raidId: string, updates: Record<string, any>): Promise<any | undefined>;
  completeGuildRaid(raidId: string, status: 'completed' | 'failed'): Promise<any | undefined>;
  
  getRaidParticipation(raidId: string, playerId: string): Promise<any | undefined>;
  createRaidParticipation(raidId: string, playerId: string): Promise<any>;
  recordRaidDamage(raidId: string, playerId: string, damage: number, tokensEarned: number): Promise<any | undefined>;
  resetRaidStreak(raidId: string, playerId: string): Promise<void>;
  resetRaidAttacks(raidId: string, playerId: string): Promise<void>;
  resetDailyRaidAttacks(raidId: string, playerId: string): Promise<void>;
  getRaidLeaderboard(raidId: string, limit?: number): Promise<any[]>;
  claimMilestoneReward(raidId: string, playerId: string, milestone: number): Promise<{ success: boolean; error?: string }>;
  
  getPlayerRaidTokens(playerId: string): Promise<{ balance: number; totalEarned: number; totalSpent: number }>;
  addRaidTokens(playerId: string, amount: number): Promise<any>;
  spendRaidTokens(playerId: string, amount: number): Promise<{ success: boolean; error?: string }>;
  
  getRaidShopItems(): Promise<any[]>;
  getShopItemsForCurrentBoss(currentBossId: string | null): Promise<any[]>;
  purchaseRaidShopItem(playerId: string, shopItemId: string): Promise<{ success: boolean; error?: string; item?: any }>;
  getPlayerShopPurchases(playerId: string): Promise<any[]>;
  
  getForgeRecipes(): Promise<any[]>;
  craftForgeItem(playerId: string, recipeId: string): Promise<{ success: boolean; error?: string; item?: any; rarity?: string }>;
  openBossChest(playerId: string, chestItemId: string): Promise<{ success: boolean; error?: string; rewards?: any[] }>;
  awardWeeklyParticipationChests(): Promise<{ awarded: number; errors: string[] }>;
  
  getGuildActivityPoints(guildId: string): Promise<{ current: number; total: number }>;
  addGuildActivityPoints(guildId: string, points: number): Promise<any>;
  spendGuildActivityPoints(guildId: string, points: number): Promise<{ success: boolean; error?: string }>;

  logSuspiciousActivity(playerId: string, playerUsername: string, type: string, details: any, severity?: string): Promise<SuspiciousActivity>;
  getSuspiciousActivities(limit?: number, unreviewedOnly?: boolean): Promise<SuspiciousActivity[]>;
  markActivityReviewed(activityId: string): Promise<void>;
  banPlayer(playerId: string, reason: string): Promise<Player | undefined>;
  unbanPlayer(playerId: string): Promise<Player | undefined>;
  addBannedEmail(email: string, playerUsername: string | null, reason: string | null): Promise<BannedEmail>;
  removeBannedEmail(email: string): Promise<boolean>;
  isEmailBanned(email: string): Promise<boolean>;
  getAllBannedEmails(): Promise<BannedEmail[]>;

  // Achievement operations
  getAllAchievements(): Promise<Achievement[]>;
  getAchievement(id: string): Promise<Achievement | undefined>;
  createAchievement(achievement: InsertAchievement): Promise<Achievement>;
  updateAchievement(id: string, updates: Partial<InsertAchievement>): Promise<Achievement | undefined>;
  deleteAchievement(id: string): Promise<boolean>;
  bulkCreateAchievements(achievements: InsertAchievement[]): Promise<number>;
  getPlayerAchievements(playerId: string): Promise<PlayerAchievement[]>;
  upsertPlayerAchievement(playerId: string, achievementId: string, progress: number, completedTiers: number[]): Promise<PlayerAchievement>;
}

export class DatabaseStorage implements IStorage {
  // User operations for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Player operations
  async getPlayer(id: string): Promise<Player | undefined> {
    const result = await db.select().from(players).where(eq(players.id, id)).limit(1);
    return result[0];
  }

  async getPlayerByUsername(username: string): Promise<Player | undefined> {
    const result = await db.select().from(players).where(eq(players.username, username)).limit(1);
    return result[0];
  }

  async getPlayerByUserId(userId: string): Promise<Player | undefined> {
    const result = await db.select().from(players).where(eq(players.userId, userId)).limit(1);
    return result[0];
  }

  async getPlayerByEmail(email: string): Promise<Player | undefined> {
    // Case-insensitive email matching for Firebase account linking
    // Using lowercase comparison instead of ILIKE to avoid wildcard issues with _ and %
    const result = await db.select().from(players)
      .where(eq(sql`lower(${players.email})`, email.toLowerCase()))
      .limit(1);
    return result[0];
  }

  async getPlayerByFirebaseUid(firebaseUid: string): Promise<Player | undefined> {
    const result = await db.select().from(players).where(eq(players.firebaseUid, firebaseUid)).limit(1);
    return result[0];
  }

  async linkPlayerToFirebase(playerId: string, firebaseUid: string, email: string): Promise<Player | undefined> {
    const result = await db.update(players)
      .set({ firebaseUid, email })
      .where(eq(players.id, playerId))
      .returning();
    return result[0];
  }

  async searchPlayersByUsername(searchTerm: string, limit: number = 10): Promise<Player[]> {
    const result = await db.select().from(players)
      .where(ilike(players.username, `%${searchTerm}%`))
      .limit(limit);
    return result;
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const result = await db.insert(players).values(insertPlayer as any).returning();
    return result[0];
  }

  async updatePlayer(id: string, updates: UpdatePlayer): Promise<Player | undefined> {
    const result = await db.update(players)
      .set({ ...updates, lastSaved: new Date() } as any)
      .where(eq(players.id, id))
      .returning();
    return result[0];
  }

  async updatePlayerWithUsername(id: string, updates: UpdatePlayer & { username?: string; firebaseUid?: string; isGuest?: number; tradeEnabled?: number }): Promise<Player | undefined> {
    const result = await db.update(players)
      .set({ ...updates, lastSaved: new Date() } as any)
      .where(eq(players.id, id))
      .returning();
    return result[0];
  }

  async updateTradeEnabled(id: string, enabled: boolean): Promise<Player | undefined> {
    const result = await db.update(players)
      .set({ tradeEnabled: enabled ? 1 : 0 })
      .where(eq(players.id, id))
      .returning();
    return result[0];
  }

  async checkUsernameAvailable(username: string): Promise<boolean> {
    const result = await db.select().from(players).where(eq(players.username, username)).limit(1);
    return result.length === 0;
  }

  async getLeaderboard(limit: number = 100): Promise<Player[]> {
    const result = await db.select().from(players).orderBy(desc(players.totalLevel)).limit(limit);
    return result;
  }

  async clearActiveTaskByUserId(userId: string): Promise<void> {
    await db.update(players)
      .set({ activeTask: null })
      .where(eq(players.userId, userId));
  }

  async updateLastSeen(playerId: string): Promise<void> {
    await db.update(players)
      .set({ lastSeen: new Date() })
      .where(eq(players.id, playerId));
  }

  async updateSessionToken(playerId: string, token: string): Promise<void> {
    await db.update(players)
      .set({ sessionToken: token })
      .where(eq(players.id, playerId));
  }

  async getSessionToken(playerId: string): Promise<string | null> {
    const [result] = await db.select({ sessionToken: players.sessionToken })
      .from(players)
      .where(eq(players.id, playerId));
    return result?.sessionToken || null;
  }

  async getPlayerBySessionToken(sessionToken: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.sessionToken, sessionToken));
    return player;
  }

  // Badge operations
  async getBadge(id: string): Promise<Badge | undefined> {
    const [badge] = await db.select().from(badges).where(eq(badges.id, id));
    return badge;
  }

  async getAllBadges(): Promise<Badge[]> {
    return db.select().from(badges).orderBy(badges.name);
  }

  async createBadge(badge: InsertBadge): Promise<Badge> {
    const [result] = await db.insert(badges).values(badge).returning();
    return result;
  }

  async updateBadge(id: string, updates: Partial<InsertBadge>): Promise<Badge | undefined> {
    const [result] = await db.update(badges).set(updates).where(eq(badges.id, id)).returning();
    return result;
  }

  async deleteBadge(id: string): Promise<boolean> {
    await db.delete(playerBadges).where(eq(playerBadges.badgeId, id));
    const result = await db.delete(badges).where(eq(badges.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getPlayerBadges(playerId: string): Promise<(PlayerBadge & { badge: Badge })[]> {
    const result = await db
      .select({
        id: playerBadges.id,
        playerId: playerBadges.playerId,
        badgeId: playerBadges.badgeId,
        earnedAt: playerBadges.earnedAt,
        badge: badges,
      })
      .from(playerBadges)
      .innerJoin(badges, eq(playerBadges.badgeId, badges.id))
      .where(eq(playerBadges.playerId, playerId));
    return result.map(r => ({ ...r, badge: r.badge }));
  }

  async awardBadge(playerId: string, badgeId: string): Promise<PlayerBadge> {
    const existing = await db.select().from(playerBadges)
      .where(and(eq(playerBadges.playerId, playerId), eq(playerBadges.badgeId, badgeId)));
    if (existing.length > 0) {
      return existing[0];
    }
    const [result] = await db.insert(playerBadges).values({ playerId, badgeId }).returning();
    return result;
  }

  async removeBadge(playerId: string, badgeId: string): Promise<boolean> {
    const result = await db.delete(playerBadges)
      .where(and(eq(playerBadges.playerId, playerId), eq(playerBadges.badgeId, badgeId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Market operations
  async getMarketListings(excludeSellerId?: string): Promise<(MarketListing & { seller: Player })[]> {
    let query = db
      .select({
        id: marketListings.id,
        sellerId: marketListings.sellerId,
        itemId: marketListings.itemId,
        quantity: marketListings.quantity,
        pricePerItem: marketListings.pricePerItem,
        enhancementData: marketListings.enhancementData,
        createdAt: marketListings.createdAt,
        expiresAt: marketListings.expiresAt,
        autoSellAt: marketListings.autoSellAt,
        region: marketListings.region,
        seller: players,
      })
      .from(marketListings)
      .innerJoin(players, eq(marketListings.sellerId, players.id))
      .orderBy(desc(marketListings.createdAt));

    if (excludeSellerId) {
      return query.where(ne(marketListings.sellerId, excludeSellerId)) as any;
    }
    return query as any;
  }

  async getPlayerListings(playerId: string): Promise<MarketListing[]> {
    return db.select().from(marketListings).where(eq(marketListings.sellerId, playerId));
  }

  async getMarketListing(id: string): Promise<MarketListing | undefined> {
    const [listing] = await db.select().from(marketListings).where(eq(marketListings.id, id));
    return listing;
  }

  async createMarketListing(listing: InsertMarketListing): Promise<MarketListing> {
    const [result] = await db.insert(marketListings).values(listing).returning();
    return result;
  }

  async cancelMarketListing(id: string, sellerId: string): Promise<boolean> {
    const result = await db.delete(marketListings)
      .where(and(eq(marketListings.id, id), eq(marketListings.sellerId, sellerId)))
      .returning();
    return result.length > 0;
  }

  async buyMarketListing(id: string, buyerId: string, quantity: number): Promise<{ success: boolean; error?: string; listing?: MarketListing; sellerId?: string; totalCost?: number; buyerGold?: number; buyerInventory?: Record<string, number>; buyerItemModifications?: Record<string, any> }> {
    return await db.transaction(async (tx) => {
      // Step 1: Lock listing, buyer, and seller rows upfront for atomicity
      const listingResult = await tx.execute(
        sql`SELECT * FROM market_listings WHERE id = ${id} FOR UPDATE`
      );
      
      if (!listingResult.rows || listingResult.rows.length === 0) {
        return { success: false, error: "Listing not found" };
      }
      
      const listing = listingResult.rows[0] as {
        id: string;
        seller_id: string;
        item_id: string;
        quantity: number;
        price_per_item: number;
        enhancement_data: any;
        created_at: Date;
        expires_at: Date | null;
      };
      
      if (listing.seller_id === buyerId) {
        return { success: false, error: "Cannot buy your own listing" };
      }
      if (listing.quantity < quantity) {
        return { success: false, error: "Not enough quantity available" };
      }

      // Lock buyer row
      const buyerResult = await tx.execute(
        sql`SELECT * FROM players WHERE id = ${buyerId} FOR UPDATE`
      );
      if (!buyerResult.rows || buyerResult.rows.length === 0) {
        return { success: false, error: "Buyer not found" };
      }
      const buyer = buyerResult.rows[0] as { id: string; inventory: Record<string, number>; gold: number };

      // Lock seller row (must exist since listing exists)
      const sellerResult = await tx.execute(
        sql`SELECT * FROM players WHERE id = ${listing.seller_id} FOR UPDATE`
      );
      if (!sellerResult.rows || sellerResult.rows.length === 0) {
        return { success: false, error: "Seller not found" };
      }
      const seller = sellerResult.rows[0] as { id: string; inventory: Record<string, number>; gold: number };

      // Step 2: Validate buyer has enough gold (using gold field, not inventory)
      const totalCost = listing.price_per_item * quantity;
      const totalCostWithTax = Math.floor(totalCost * (1 + MARKET_BUY_TAX));
      const buyerGold = buyer.gold || 0;

      if (buyerGold < totalCostWithTax) {
        return { success: false, error: "Not enough gold" };
      }

      // Step 3: Atomically update/delete listing with quantity check
      let deletedListing: MarketListing | null = null;
      let remainingQuantity = 0;
      
      if (listing.quantity === quantity) {
        // DELETE only if quantity still matches (prevents race)
        const deleted = await tx.delete(marketListings)
          .where(and(
            eq(marketListings.id, id),
            eq(marketListings.quantity, quantity)
          ))
          .returning();
        
        if (deleted.length === 0) {
          return { success: false, error: "Listing was modified - please try again" };
        }
        deletedListing = deleted[0];
        remainingQuantity = 0;
      } else {
        // UPDATE with quantity guard - use atomic decrement with check
        const updated = await tx.update(marketListings)
          .set({ quantity: sql`${marketListings.quantity} - ${quantity}` })
          .where(and(
            eq(marketListings.id, id),
            gte(marketListings.quantity, quantity)
          ))
          .returning();
        
        if (updated.length === 0) {
          return { success: false, error: "Listing was modified - please try again" };
        }
        deletedListing = updated[0];
        remainingQuantity = updated[0].quantity;
      }

      // Step 4: Update buyer - deduct gold (price + 18% tax) and add item to inventory
      const buyerInventory = { ...buyer.inventory };
      buyerInventory[listing.item_id] = (buyerInventory[listing.item_id] || 0) + quantity;
      
      const buyerUpdate = await tx.update(players)
        .set({ 
          inventory: buyerInventory, 
          gold: buyerGold - totalCostWithTax,
          lastSaved: new Date() 
        })
        .where(eq(players.id, buyerId))
        .returning();
      
      if (buyerUpdate.length === 0) {
        throw new Error("Failed to update buyer inventory");
      }

      // Step 4b: Transfer enhancement data to buyer if present
      let buyerMods = ((buyerUpdate[0] as any).itemModifications || {}) as Record<string, any>;
      if (listing.enhancement_data) {
        const enhData = listing.enhancement_data as { enhancementLevel?: number; addedStats?: any; addedSkills?: any[] };
        if (enhData.enhancementLevel || (enhData.addedStats && Object.keys(enhData.addedStats).length > 0) || (enhData.addedSkills && enhData.addedSkills.length > 0)) {
          // Persist enhancement level to weapon_enhancements table (used by scheduler)
          if (enhData.enhancementLevel && enhData.enhancementLevel > 0) {
            await tx.execute(sql`
              INSERT INTO weapon_enhancements (player_id, item_id, enhancement_level)
              VALUES (${buyerId}, ${listing.item_id}, ${enhData.enhancementLevel})
              ON CONFLICT (player_id, item_id) DO UPDATE SET
                enhancement_level = ${enhData.enhancementLevel}
            `);
          }

          buyerMods = { ...buyerMods };
          buyerMods[listing.item_id] = {
            addedStats: enhData.addedStats || {},
            addedSkills: enhData.addedSkills || [],
            enhancementLevel: enhData.enhancementLevel || 0,
          };
          await tx.update(players)
            .set({ itemModifications: buyerMods })
            .where(eq(players.id, buyerId));
        }
      }

      // Step 5: Add gold to seller (using gold field, not inventory)
      const sellerGold = seller.gold || 0;
      
      const sellerUpdate = await tx.update(players)
        .set({ 
          gold: sellerGold + totalCost,
          lastSaved: new Date() 
        })
        .where(eq(players.id, listing.seller_id))
        .returning();
      
      if (sellerUpdate.length === 0) {
        throw new Error("Failed to update seller inventory");
      }

      await tx.insert(marketPriceHistory).values({
        itemId: listing.item_id,
        quantity,
        pricePerItem: listing.price_per_item,
        sellerId: listing.seller_id,
        buyerId,
        region: (listing as any).region || null,
      });

      const resultListing: MarketListing = deletedListing || {
        id: listing.id,
        sellerId: listing.seller_id,
        itemId: listing.item_id,
        quantity: quantity,
        pricePerItem: listing.price_per_item,
        enhancementData: listing.enhancement_data,
        createdAt: listing.created_at,
        expiresAt: listing.expires_at,
        autoSellAt: null,
        region: (listing as any).region || null,
      };

      // Return updated buyer data to prevent race conditions with client saves
      const updatedBuyerGold = buyerGold - totalCostWithTax;
      const updatedBuyerInventory = buyerInventory;
      return { 
        success: true, 
        listing: resultListing, 
        sellerId: listing.seller_id, 
        totalCost: totalCostWithTax,
        buyerGold: updatedBuyerGold,
        buyerInventory: updatedBuyerInventory,
        buyerItemModifications: buyerMods,
        remainingQuantity
      };
    });
  }

  async bulkBuyMarketListings(itemId: string, buyerId: string, quantity: number, maxPricePerItem?: number): Promise<{ success: boolean; error?: string; itemId?: string; totalCost?: number; totalQuantity?: number; buyerGold?: number; buyerInventory?: Record<string, number>; buyerItemModifications?: Record<string, any>; sellers?: Array<{ sellerId: string; listingId: string; quantity: number; pricePerItem: number; goldEarned: number; remainingQuantity: number }> }> {
    return await db.transaction(async (tx) => {
      // Lock buyer row first
      const buyerResult = await tx.execute(
        sql`SELECT * FROM players WHERE id = ${buyerId} FOR UPDATE`
      );
      if (!buyerResult.rows || buyerResult.rows.length === 0) {
        return { success: false, error: "Buyer not found" };
      }
      const buyer = buyerResult.rows[0] as { id: string; inventory: Record<string, number>; gold: number; item_modifications?: Record<string, any> };

      // Fetch all listings for this item, sorted cheapest-first, locking them
      const listingsResult = await tx.execute(
        sql`SELECT * FROM market_listings WHERE item_id = ${itemId} AND seller_id != ${buyerId} ORDER BY price_per_item ASC FOR UPDATE`
      );

      if (!listingsResult.rows || listingsResult.rows.length === 0) {
        return { success: false, error: "No listings available" };
      }

      type RawListing = { id: string; seller_id: string; item_id: string; quantity: number; price_per_item: number; enhancement_data: any; created_at: Date; expires_at: Date | null };
      const allListings = listingsResult.rows as RawListing[];

      // Only include non-enhanced (stackable) listings in bulk buy, and respect max price cap
      const listings = allListings.filter((l) => {
        const enh = l.enhancement_data as { enhancementLevel?: number } | null;
        const isEnhanced = !!(enh && enh.enhancementLevel && enh.enhancementLevel > 0);
        const withinPriceCap = maxPricePerItem == null || Number(l.price_per_item) <= maxPricePerItem;
        return !isEnhanced && withinPriceCap;
      });

      if (listings.length === 0) {
        return { success: false, error: "No bulk-eligible (non-enhanced) listings available for this item." };
      }

      // Check total available across eligible listings
      const totalAvailable = listings.reduce((sum, l) => sum + Number(l.quantity), 0);
      if (totalAvailable < quantity) {
        return { success: false, error: "Not enough quantity available across all sellers" };
      }

      // Determine which listings to consume cheapest-first
      const toConsume: Array<{ listing: RawListing; consumeQty: number }> = [];
      let remaining = quantity;
      for (const listing of listings) {
        if (remaining <= 0) break;
        const take = Math.min(Number(listing.quantity), remaining);
        toConsume.push({ listing, consumeQty: take });
        remaining -= take;
      }

      // Compute total cost (before tax)
      const baseTotalCost = toConsume.reduce((sum, { listing, consumeQty }) => sum + listing.price_per_item * consumeQty, 0);
      const totalCost = Math.floor(baseTotalCost * (1 + MARKET_BUY_TAX));

      const buyerGold = buyer.gold || 0;
      if (buyerGold < totalCost) {
        return { success: false, error: "Not enough gold" };
      }

      // Lock all seller rows
      const sellerIds = [...new Set(toConsume.map(({ listing }) => listing.seller_id))];
      for (const sellerId of sellerIds) {
        await tx.execute(sql`SELECT id FROM players WHERE id = ${sellerId} FOR UPDATE`);
      }

      // Process each listing
      const sellersResult: Array<{ sellerId: string; listingId: string; quantity: number; pricePerItem: number; goldEarned: number; remainingQuantity: number }> = [];
      for (const { listing, consumeQty } of toConsume) {
        const goldEarned = listing.price_per_item * consumeQty;

        let remainingQuantity = 0;
        if (Number(listing.quantity) === consumeQty) {
          const deleted = await tx.delete(marketListings)
            .where(and(eq(marketListings.id, listing.id), gte(marketListings.quantity, consumeQty)))
            .returning();
          if (deleted.length === 0) {
            return { success: false, error: "Listing was modified — please try again" };
          }
          remainingQuantity = 0;
        } else {
          const updated = await tx.update(marketListings)
            .set({ quantity: sql`${marketListings.quantity} - ${consumeQty}` })
            .where(and(eq(marketListings.id, listing.id), gte(marketListings.quantity, consumeQty)))
            .returning();
          if (updated.length === 0) {
            return { success: false, error: "Listing was modified — please try again" };
          }
          remainingQuantity = updated[0].quantity;
        }

        // Credit seller gold
        await tx.update(players)
          .set({ gold: sql`${players.gold} + ${goldEarned}`, lastSaved: new Date() })
          .where(eq(players.id, listing.seller_id));

        // Record price history
        await tx.insert(marketPriceHistory).values({
          itemId: listing.item_id,
          quantity: consumeQty,
          pricePerItem: listing.price_per_item,
          sellerId: listing.seller_id,
          buyerId,
          region: (listing as any).region || null,
        });

        sellersResult.push({ sellerId: listing.seller_id, listingId: listing.id, quantity: consumeQty, pricePerItem: listing.price_per_item, goldEarned, remainingQuantity });
      }

      // Update buyer inventory and gold (deduct total cost with 18% tax)
      const buyerInventory = { ...(buyer.inventory || {}) };
      buyerInventory[itemId] = (buyerInventory[itemId] || 0) + quantity;

      const buyerUpdate = await tx.update(players)
        .set({ inventory: buyerInventory, gold: buyerGold - totalCost, lastSaved: new Date() })
        .where(eq(players.id, buyerId))
        .returning();

      if (buyerUpdate.length === 0) {
        throw new Error("Failed to update buyer");
      }

      const buyerMods = ((buyerUpdate[0] as any).itemModifications || {}) as Record<string, any>;

      return {
        success: true,
        itemId,
        totalCost,
        totalQuantity: quantity,
        buyerGold: buyerGold - totalCost,
        buyerInventory,
        buyerItemModifications: buyerMods,
        sellers: sellersResult,
      };
    });
  }

  async getGroupedMarketListings(page: number, limit: number, search?: string, sort?: string, enhFilters?: { enhMinLevel?: number; enhSkill?: string; enhStat?: string }, userOnly?: boolean, categoryFilters?: { itemType?: string; equipSlot?: string; weaponCategory?: string; armorType?: string; materialSub?: string }, regionFilter?: string): Promise<{
    groups: {
      itemId: string;
      latestListing: MarketListing & { seller: { id: string; username: string } };
      listingCount: number;
      lowestPrice: number;
      highestPrice: number;
      totalQuantity: number;
    }[];
    totalGroups: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;
    const maxItems = 400;
    
    let whereClause = sql`1=1`;
    const userOnlyClause = userOnly
      ? sql`${marketListings.sellerId} IN (SELECT id FROM players WHERE is_bot = 0 OR is_bot IS NULL)`
      : sql`1=1`;

    const regionClause = regionFilter ? sql`${marketListings.region} = ${regionFilter}` : sql`1=1`;

    let categoryClause = sql`1=1`;
    if (categoryFilters) {
      const clauses: ReturnType<typeof sql>[] = [];
      if (categoryFilters.itemType) {
        if (categoryFilters.itemType === 'fish') {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.type = 'material' AND EXISTS (SELECT 1 FROM game_skill_actions gsa WHERE gsa.skill = 'fishing' AND gsa.item_id = gi2.id))`);
        } else {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.type = ${categoryFilters.itemType})`);
        }
      }
      if (categoryFilters.equipSlot) {
        if (categoryFilters.equipSlot === '_armor') {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.equip_slot IN ('helmet', 'body', 'legs', 'gloves', 'boots', 'shield', 'cape'))`);
        } else if (categoryFilters.equipSlot === '_accessories') {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.equip_slot IN ('ring', 'amulet'))`);
        } else {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.equip_slot = ${categoryFilters.equipSlot})`);
        }
      }
      if (categoryFilters.weaponCategory) {
        clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.weapon_category = ${categoryFilters.weaponCategory})`);
      }
      if (categoryFilters.armorType) {
        clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.armor_type = ${categoryFilters.armorType})`);
      }
      if (categoryFilters.materialSub) {
        const sub = categoryFilters.materialSub;
        if (sub === 'ore') {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.type = 'material' AND (lower(gi2.name) LIKE '%ore%' OR lower(gi2.id) LIKE '%ore%'))`);
        } else if (sub === 'bar') {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.type = 'material' AND (lower(gi2.name) LIKE '%bar%' OR lower(gi2.id) LIKE '%bar%'))`);
        } else if (sub === 'log') {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.type = 'material' AND (lower(gi2.name) LIKE '%log%' OR lower(gi2.id) LIKE '%log%'))`);
        } else if (sub === 'hide') {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.type = 'material' AND (lower(gi2.name) LIKE '%hide%' OR lower(gi2.id) LIKE '%hide%'))`);
        } else if (sub === 'other') {
          clauses.push(sql`EXISTS (SELECT 1 FROM game_items gi2 WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi2.id AND gi2.type = 'material' AND lower(gi2.name) NOT LIKE '%ore%' AND lower(gi2.name) NOT LIKE '%bar%' AND lower(gi2.name) NOT LIKE '%log%' AND lower(gi2.name) NOT LIKE '%hide%' AND lower(gi2.id) NOT LIKE '%ore%' AND lower(gi2.id) NOT LIKE '%bar%' AND lower(gi2.id) NOT LIKE '%log%' AND lower(gi2.id) NOT LIKE '%hide%')`);
        }
      }
      if (clauses.length > 0) {
        categoryClause = clauses.reduce((acc, c) => sql`${acc} AND ${c}`);
      }
    }

    if (search && search.trim()) {
      const searchTerm = search.trim().toLowerCase();
      // Search in: itemId, base item name from game_items, and all translations in nameTranslations JSONB
      // Extract base item id by removing rarity suffix like " (Common)"
      whereClause = sql`(
        lower(${marketListings.itemId}) LIKE ${`%${searchTerm}%`}
        OR EXISTS (
          SELECT 1 FROM game_items gi 
          WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi.id 
          AND (
            lower(gi.name) LIKE ${`%${searchTerm}%`}
            OR EXISTS (
              SELECT 1 FROM jsonb_each_text(gi.name_translations) AS t(lang, val) 
              WHERE lower(val) LIKE ${`%${searchTerm}%`}
            )
          )
        )
      )`;
    }
    
    // Apply rarity filter for rarePlus sort
    if (sort === 'rarePlus') {
      const baseSearch = search && search.trim() 
        ? sql`(
            lower(${marketListings.itemId}) LIKE ${`%${search.trim().toLowerCase()}%`}
            OR EXISTS (
              SELECT 1 FROM game_items gi 
              WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi.id 
              AND (
                lower(gi.name) LIKE ${`%${search.trim().toLowerCase()}%`}
                OR EXISTS (
                  SELECT 1 FROM jsonb_each_text(gi.name_translations) AS t(lang, val) 
                  WHERE lower(val) LIKE ${`%${search.trim().toLowerCase()}%`}
                )
              )
            )
          )` 
        : sql`1=1`;
      whereClause = sql`${baseSearch} AND (${marketListings.itemId} ~* '(Uncommon|Rare|Epic|Legendary|Mythic)')`;
    }

    // Apply enhanced filter - show only items with enhancement data, with optional sub-filters
    if (sort === 'enhanced') {
      const baseSearch = search && search.trim() 
        ? sql`(
            lower(${marketListings.itemId}) LIKE ${`%${search.trim().toLowerCase()}%`}
            OR EXISTS (
              SELECT 1 FROM game_items gi 
              WHERE SPLIT_PART(${marketListings.itemId}, ' (', 1) = gi.id 
              AND (
                lower(gi.name) LIKE ${`%${search.trim().toLowerCase()}%`}
                OR EXISTS (
                  SELECT 1 FROM jsonb_each_text(gi.name_translations) AS t(lang, val) 
                  WHERE lower(val) LIKE ${`%${search.trim().toLowerCase()}%`}
                )
              )
            )
          )` 
        : sql`1=1`;
      
      let enhClause = sql`${marketListings.enhancementData} IS NOT NULL AND ${marketListings.enhancementData}::text != 'null' AND ${marketListings.enhancementData}::text != '{}'`;
      
      // Filter by minimum enhancement level
      if (enhFilters?.enhMinLevel && enhFilters.enhMinLevel > 0) {
        enhClause = sql`${enhClause} AND (${marketListings.enhancementData}->>'enhancementLevel')::int >= ${enhFilters.enhMinLevel}`;
      }
      
      // Filter by skill type (check if addedSkills array contains the skill)
      if (enhFilters?.enhSkill) {
        enhClause = sql`${enhClause} AND ${marketListings.enhancementData}->'addedSkills' @> ${JSON.stringify([enhFilters.enhSkill])}::jsonb`;
      }
      
      // Filter by stat type (check if addedStats object has the stat key)
      if (enhFilters?.enhStat) {
        enhClause = sql`${enhClause} AND ${marketListings.enhancementData}->'addedStats' ? ${enhFilters.enhStat}`;
      }
      
      whereClause = sql`${baseSearch} AND ${enhClause}`;
    }

    // Determine sort order
    let orderByClause;
    switch (sort) {
      case 'cheapest':
        orderByClause = sql`min(${marketListings.pricePerItem}) asc`;
        break;
      case 'enhanced':
        orderByClause = sql`max(${marketListings.createdAt}) desc`;
        break;
      case 'newest':
      case 'rarePlus':
      default:
        orderByClause = sql`max(${marketListings.createdAt}) desc`;
        break;
    }

    const groupedQuery = await db
      .select({
        itemId: marketListings.itemId,
        listingCount: sql<number>`count(*)::int`.as('listing_count'),
        lowestPrice: sql<number>`min(${marketListings.pricePerItem})::int`.as('lowest_price'),
        highestPrice: sql<number>`max(${marketListings.pricePerItem})::int`.as('highest_price'),
        totalQuantity: sql<number>`sum(${marketListings.quantity})::int`.as('total_quantity'),
        latestCreatedAt: sql<Date>`max(${marketListings.createdAt})`.as('latest_created_at'),
      })
      .from(marketListings)
      .where(sql`(${whereClause}) AND (${userOnlyClause}) AND (${categoryClause}) AND (${regionClause})`)
      .groupBy(marketListings.itemId)
      .orderBy(orderByClause)
      .limit(Math.min(limit, 20))
      .offset(Math.min(offset, maxItems - limit));

    const countQuery = await db
      .select({
        count: sql<number>`count(distinct ${marketListings.itemId})::int`,
      })
      .from(marketListings)
      .where(sql`(${whereClause}) AND (${userOnlyClause}) AND (${categoryClause}) AND (${regionClause})`);

    const totalGroups = Math.min(countQuery[0]?.count || 0, maxItems / limit * limit);

    const groups = await Promise.all(
      groupedQuery.map(async (group) => {
        const latestListingQuery = await db
          .select({
            id: marketListings.id,
            sellerId: marketListings.sellerId,
            itemId: marketListings.itemId,
            quantity: marketListings.quantity,
            pricePerItem: marketListings.pricePerItem,
            createdAt: marketListings.createdAt,
            expiresAt: marketListings.expiresAt,
            autoSellAt: marketListings.autoSellAt,
            enhancementData: marketListings.enhancementData,
            sellerId2: players.id,
            sellerUsername: players.username,
          })
          .from(marketListings)
          .innerJoin(players, eq(marketListings.sellerId, players.id))
          .where(eq(marketListings.itemId, group.itemId))
          .orderBy(desc(marketListings.createdAt))
          .limit(1);

        const latest = latestListingQuery[0];
        return {
          itemId: group.itemId,
          latestListing: {
            id: latest.id,
            sellerId: latest.sellerId,
            itemId: latest.itemId,
            quantity: latest.quantity,
            pricePerItem: latest.pricePerItem,
            createdAt: latest.createdAt,
            expiresAt: latest.expiresAt,
            autoSellAt: latest.autoSellAt,
            region: (latest as any).region ?? null,
            enhancementData: latest.enhancementData,
            seller: {
              id: latest.sellerId2,
              username: latest.sellerUsername,
            },
          },
          listingCount: group.listingCount,
          lowestPrice: group.lowestPrice,
          highestPrice: group.highestPrice,
          totalQuantity: group.totalQuantity,
        } as any;
      })
    );

    return {
      groups,
      totalGroups,
      page,
      limit,
    };
  }

  async getListingsByItemId(itemId: string): Promise<(MarketListing & { seller: { id: string; username: string } })[]> {
    const listings = await db
      .select({
        id: marketListings.id,
        sellerId: marketListings.sellerId,
        itemId: marketListings.itemId,
        quantity: marketListings.quantity,
        pricePerItem: marketListings.pricePerItem,
        createdAt: marketListings.createdAt,
        expiresAt: marketListings.expiresAt,
        autoSellAt: marketListings.autoSellAt,
        enhancementData: marketListings.enhancementData,
        sellerId2: players.id,
        sellerUsername: players.username,
      })
      .from(marketListings)
      .innerJoin(players, eq(marketListings.sellerId, players.id))
      .where(eq(marketListings.itemId, itemId))
      .orderBy(marketListings.pricePerItem);

    return listings.map((l) => ({
      id: l.id,
      sellerId: l.sellerId,
      itemId: l.itemId,
      quantity: l.quantity,
      pricePerItem: l.pricePerItem,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      autoSellAt: l.autoSellAt,
      region: (l as any).region ?? null,
      enhancementData: l.enhancementData,
      seller: {
        id: l.sellerId2,
        username: l.sellerUsername,
      },
    })) as any;
  }

  async processAutoSellListings(): Promise<number> {
    const now = new Date();
    const expiredListings = await db
      .select()
      .from(marketListings)
      .where(and(
        isNotNull(marketListings.autoSellAt),
        lte(marketListings.autoSellAt, now)
      ))
      .limit(50);

    let processed = 0;
    for (const listing of expiredListings) {
      try {
        const enhData = listing.enhancementData as { enhancementLevel?: number; addedStats?: any; addedSkills?: any[] } | null;
        const hasEnhancement = enhData && (
          (enhData.enhancementLevel && enhData.enhancementLevel > 0) ||
          (enhData.addedStats && Object.keys(enhData.addedStats).length > 0) ||
          (enhData.addedSkills && enhData.addedSkills.length > 0)
        );
        const isEquipment = isEquipmentItem(listing.itemId);

        if (hasEnhancement && isEquipment) {
          // Enhanced equipment: return item + enhancements to seller instead of auto-selling
          await db.transaction(async (tx) => {
            await tx.execute(sql`DELETE FROM market_listings WHERE id = ${listing.id}`);

            // Return item to seller's inventory
            const sellerResult = await tx.execute(sql`SELECT inventory, item_modifications FROM players WHERE id = ${listing.sellerId} FOR UPDATE`);
            if (!sellerResult.rows.length) throw new Error(`Seller ${listing.sellerId} not found`);
            const seller = sellerResult.rows[0] as { inventory: Record<string, number>; item_modifications: Record<string, any> };
            const sellerInv = (seller.inventory || {}) as Record<string, number>;
            const newInv = { ...sellerInv, [listing.itemId]: (sellerInv[listing.itemId] || 0) + listing.quantity };

            // Restore itemModifications
            const sellerMods = (seller.item_modifications || {}) as Record<string, any>;
            const newMods = { ...sellerMods };
            newMods[listing.itemId] = {
              addedStats: enhData!.addedStats || {},
              addedSkills: enhData!.addedSkills || [],
              enhancementLevel: enhData!.enhancementLevel || 0,
            };

            await tx.execute(sql`
              UPDATE players SET
                inventory = ${JSON.stringify(newInv)}::jsonb,
                item_modifications = ${JSON.stringify(newMods)}::jsonb,
                last_saved = NOW()
              WHERE id = ${listing.sellerId}
            `);

            // Restore weapon_enhancements table entry — always, regardless of level
            // (items can have addedStats/addedSkills with enhancementLevel=0)
            await tx.execute(sql`
              INSERT INTO weapon_enhancements (player_id, item_id, enhancement_level, added_stats, added_skills)
              VALUES (${listing.sellerId}, ${listing.itemId}, ${enhData!.enhancementLevel || 0}, ${JSON.stringify(enhData!.addedStats || {})}::jsonb, ${JSON.stringify(enhData!.addedSkills || [])}::jsonb)
              ON CONFLICT (player_id, item_id) DO UPDATE SET
                enhancement_level = EXCLUDED.enhancement_level,
                added_stats = EXCLUDED.added_stats,
                added_skills = EXCLUDED.added_skills
            `);
          });

          await this.createNotification({
            playerId: listing.sellerId,
            type: 'MARKET_LISTING_RETURNED',
            message: `Your enhanced ${listing.itemId} was returned to your inventory (auto-sell expired). Enhancement data preserved.`,
            payload: {
              itemId: listing.itemId,
              quantity: listing.quantity,
              enhancementLevel: enhData!.enhancementLevel || 0,
              autoSold: false,
              returned: true,
            },
          });
        } else {
          // Normal (non-enhanced or stackable) item: auto-sell for gold as before
          const totalGold = listing.quantity * listing.pricePerItem;

          await db.transaction(async (tx) => {
            await tx.delete(marketListings).where(eq(marketListings.id, listing.id));

            await tx.update(players)
              .set({
                gold: sql`${players.gold} + ${totalGold}`,
                lastSaved: new Date(),
              })
              .where(eq(players.id, listing.sellerId));
          });

          await this.createNotification({
            playerId: listing.sellerId,
            type: 'MARKET_SOLD',
            message: `Your ${listing.quantity}x ${listing.itemId} was sold on the market for ${totalGold} gold.`,
            payload: {
              itemId: listing.itemId,
              quantity: listing.quantity,
              totalGold,
              autoSold: true,
            },
          });
        }

        processed++;
      } catch (err) {
        console.error(`[AutoSell] Error processing listing ${listing.id}:`, err);
      }
    }

    return processed;
  }

  // Buy order operations
  async getBuyOrdersForItem(itemId: string): Promise<(BuyOrder & { buyer: { id: string; username: string } })[]> {
    const rows = await db.execute(sql`
      SELECT bo.*, p.id as buyer_player_id, p.username as buyer_username
      FROM buy_orders bo
      JOIN players p ON p.id = bo.buyer_id
      WHERE bo.item_id = ${itemId} AND bo.status = 'open' AND bo.remaining_quantity > 0
      ORDER BY bo.price_per_item DESC, bo.created_at ASC
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id, buyerId: r.buyer_id, itemId: r.item_id,
      quantity: r.quantity, remainingQuantity: r.remaining_quantity,
      pricePerItem: r.price_per_item, status: r.status,
      createdAt: r.created_at, expiresAt: r.expires_at,
      buyer: { id: r.buyer_player_id, username: r.buyer_username },
    }));
  }

  async getMyBuyOrders(buyerId: string): Promise<(BuyOrder & { buyer: { id: string; username: string } })[]> {
    const rows = await db.execute(sql`
      SELECT bo.*, p.id as buyer_player_id, p.username as buyer_username
      FROM buy_orders bo
      JOIN players p ON p.id = bo.buyer_id
      WHERE bo.buyer_id = ${buyerId} AND bo.status IN ('open', 'partial')
      ORDER BY bo.created_at DESC
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id, buyerId: r.buyer_id, itemId: r.item_id,
      quantity: r.quantity, remainingQuantity: r.remaining_quantity,
      pricePerItem: r.price_per_item, status: r.status,
      createdAt: r.created_at, expiresAt: r.expires_at,
      buyer: { id: r.buyer_player_id, username: r.buyer_username },
    }));
  }

  async createBuyOrder(buyerId: string, itemId: string, quantity: number, pricePerItem: number): Promise<{ success: boolean; error?: string; order?: BuyOrder; buyerGold?: number }> {
    return await db.transaction(async (tx) => {
      const buyerResult = await tx.execute(sql`SELECT * FROM players WHERE id = ${buyerId} FOR UPDATE`);
      if (!buyerResult.rows.length) return { success: false, error: "Player not found" };
      const buyer = buyerResult.rows[0] as { id: string; gold: number };
      // Escrow = quantity × pricePerItem × (1 + 18% tax); 18% is destroyed, seller gets pricePerItem per unit
      const escrow = Math.floor(quantity * pricePerItem * (1 + MARKET_BUY_ORDER_TAX));
      if ((buyer.gold || 0) < escrow) return { success: false, error: "Not enough gold" };
      // Deduct escrow gold (including tax portion which is destroyed)
      const updatedBuyer = await tx.execute(sql`UPDATE players SET gold = gold - ${escrow} WHERE id = ${buyerId} RETURNING gold`);
      const newGold = (updatedBuyer.rows[0] as any).gold;
      // Create order
      const [order] = await tx.insert(buyOrders).values({
        buyerId, itemId, quantity, remainingQuantity: quantity, pricePerItem, status: 'open',
      }).returning();
      return { success: true, order, buyerGold: newGold };
    });
  }

  async cancelBuyOrder(id: string, buyerId: string): Promise<{ success: boolean; error?: string; buyerGold?: number }> {
    return await db.transaction(async (tx) => {
      const orderResult = await tx.execute(sql`SELECT * FROM buy_orders WHERE id = ${id} FOR UPDATE`);
      if (!orderResult.rows.length) return { success: false, error: "Order not found" };
      const order = orderResult.rows[0] as { id: string; buyer_id: string; remaining_quantity: number; price_per_item: number; status: string };
      if (order.buyer_id !== buyerId) return { success: false, error: "Not your order" };
      if (order.status === 'filled' || order.status === 'cancelled') return { success: false, error: "Order already closed" };
      const refund = order.remaining_quantity * order.price_per_item;
      await tx.execute(sql`UPDATE buy_orders SET status = 'cancelled' WHERE id = ${id}`);
      const updatedBuyer = await tx.execute(sql`UPDATE players SET gold = gold + ${refund} WHERE id = ${buyerId} RETURNING gold`);
      const newGold = (updatedBuyer.rows[0] as any).gold;
      return { success: true, buyerGold: newGold };
    });
  }

  async fillBuyOrder(orderId: string, sellerId: string, quantity: number): Promise<{ success: boolean; error?: string; goldEarned?: number; sellerGold?: number; newInventory?: Record<string, number>; newItemModifications?: Record<string, any>; remainingQuantity?: number; buyerId?: string; itemId?: string; filledQuantity?: number }> {
    return await db.transaction(async (tx) => {
      // Lock order
      const orderResult = await tx.execute(sql`SELECT * FROM buy_orders WHERE id = ${orderId} FOR UPDATE`);
      if (!orderResult.rows.length) return { success: false, error: "Order not found" };
      const order = orderResult.rows[0] as { id: string; buyer_id: string; item_id: string; remaining_quantity: number; price_per_item: number; status: string };
      if (order.buyer_id === sellerId) return { success: false, error: "Cannot fill your own order" };
      if (order.status === 'filled' || order.status === 'cancelled') return { success: false, error: "Order is closed" };
      if (order.remaining_quantity <= 0) return { success: false, error: "Order already filled" };
      const fillQty = Math.min(quantity, order.remaining_quantity);
      // Lock seller row
      const sellerResult = await tx.execute(sql`SELECT * FROM players WHERE id = ${sellerId} FOR UPDATE`);
      if (!sellerResult.rows.length) return { success: false, error: "Seller not found" };
      const seller = sellerResult.rows[0] as { id: string; inventory: Record<string, number>; gold: number; item_modifications: Record<string, any> };
      // Check seller has items
      const sellerInv = seller.inventory || {};
      if ((sellerInv[order.item_id] || 0) < fillQty) return { success: false, error: "Not enough items in inventory" };
      // Lock buyer row
      const buyerResult = await tx.execute(sql`SELECT * FROM players WHERE id = ${order.buyer_id} FOR UPDATE`);
      if (!buyerResult.rows.length) return { success: false, error: "Buyer not found" };
      const buyerRow = buyerResult.rows[0] as { id: string; inventory: Record<string, number>; item_modifications: Record<string, any> };
      // Transfer items: seller → buyer
      const newSellerInv = { ...sellerInv };
      newSellerInv[order.item_id] = (newSellerInv[order.item_id] || 0) - fillQty;
      if (newSellerInv[order.item_id] <= 0) delete newSellerInv[order.item_id];
      const buyerInv = buyerRow.inventory || {};
      const newBuyerInv = { ...buyerInv, [order.item_id]: (buyerInv[order.item_id] || 0) + fillQty };
      const goldEarned = fillQty * order.price_per_item;
      // Update seller inventory and gold
      const sellerUpdate = await tx.execute(sql`UPDATE players SET inventory = ${JSON.stringify(newSellerInv)}::jsonb, gold = gold + ${goldEarned} WHERE id = ${sellerId} RETURNING gold, item_modifications`);
      const sellerFinal = sellerUpdate.rows[0] as any;
      // Update buyer inventory
      await tx.execute(sql`UPDATE players SET inventory = ${JSON.stringify(newBuyerInv)}::jsonb WHERE id = ${order.buyer_id}`);
      // Update order
      const newRemaining = order.remaining_quantity - fillQty;
      const newStatus = newRemaining <= 0 ? 'filled' : 'partial';
      await tx.execute(sql`UPDATE buy_orders SET remaining_quantity = ${newRemaining}, status = ${newStatus} WHERE id = ${orderId}`);
      return {
        success: true, goldEarned, sellerGold: sellerFinal.gold,
        newInventory: newSellerInv, newItemModifications: sellerFinal.item_modifications,
        remainingQuantity: newRemaining, buyerId: order.buyer_id, itemId: order.item_id, filledQuantity: fillQty,
      };
    });
  }

  async getPlayerTransactions(playerId: string, limit = 15): Promise<{ id: number; itemId: string; quantity: number; pricePerItem: number; soldAt: Date | null; role: "buyer" | "seller"; otherUsername: string }[]> {
    const rows = await db.execute(sql`
      SELECT
        h.id, h.item_id, h.quantity, h.price_per_item, h.sold_at,
        CASE WHEN h.buyer_id = ${playerId} THEN 'buyer' ELSE 'seller' END AS role,
        CASE WHEN h.buyer_id = ${playerId} THEN sp.username ELSE bp.username END AS other_username
      FROM market_price_history h
      JOIN players sp ON sp.id = h.seller_id
      JOIN players bp ON bp.id = h.buyer_id
      WHERE h.buyer_id = ${playerId} OR h.seller_id = ${playerId}
      ORDER BY h.sold_at DESC
      LIMIT ${limit}
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id,
      itemId: r.item_id,
      quantity: r.quantity,
      pricePerItem: r.price_per_item,
      soldAt: r.sold_at,
      role: r.role as "buyer" | "seller",
      otherUsername: r.other_username,
    }));
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    // Auto-set category based on notification type
    const category = isNotificationPersistent(notification.type) ? 'persistent' : 'transient';
    const [result] = await db.insert(notifications).values({
      ...notification,
      category,
    }).returning();
    return result;
  }

  // Delete all transient notifications for a player (called on login)
  async deleteTransientNotifications(playerId: string): Promise<number> {
    const result = await db.delete(notifications)
      .where(and(
        eq(notifications.playerId, playerId),
        eq(notifications.category, 'transient')
      ))
      .returning();
    return result.length;
  }

  // Delete persistent notifications that have been read
  async deleteReadPersistentNotifications(playerId: string): Promise<number> {
    const result = await db.delete(notifications)
      .where(and(
        eq(notifications.playerId, playerId),
        eq(notifications.category, 'persistent'),
        eq(notifications.read, 1)
      ))
      .returning();
    return result.length;
  }

  // Cleanup old notifications (30 days TTL)
  async cleanupOldNotifications(playerId: string): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db.delete(notifications)
      .where(and(
        eq(notifications.playerId, playerId),
        sql`${notifications.createdAt} < ${thirtyDaysAgo}`
      ))
      .returning();
    return result.length;
  }

  async getNotifications(playerId: string, limit: number = 50, unreadOnly: boolean = false): Promise<Notification[]> {
    if (unreadOnly) {
      return db.select().from(notifications)
        .where(and(eq(notifications.playerId, playerId), eq(notifications.read, 0)))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
    }
    return db.select().from(notifications)
      .where(eq(notifications.playerId, playerId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async markNotificationsRead(playerId: string, ids?: string[]): Promise<number> {
    if (ids && ids.length > 0) {
      const result = await db.update(notifications)
        .set({ read: 1 })
        .where(and(
          eq(notifications.playerId, playerId),
          inArray(notifications.id, ids)
        ))
        .returning();
      return result.length;
    }
    const result = await db.update(notifications)
      .set({ read: 1 })
      .where(eq(notifications.playerId, playerId))
      .returning();
    return result.length;
  }

  async getUnreadNotificationCount(playerId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.playerId, playerId), eq(notifications.read, 0)));
    return result[0]?.count || 0;
  }

  // Trade operations
  async createTrade(trade: InsertTrade): Promise<Trade> {
    const [result] = await db.insert(trades).values(trade).returning();
    return result;
  }

  async getTrade(id: string): Promise<Trade | undefined> {
    const [result] = await db.select().from(trades).where(eq(trades.id, id));
    return result;
  }

  async updateTrade(id: string, updates: Partial<Trade>): Promise<Trade | undefined> {
    const [result] = await db.update(trades).set({ ...updates, updatedAt: new Date() }).where(eq(trades.id, id)).returning();
    return result;
  }

  async getTradeOffers(playerId: string, type: 'incoming' | 'outgoing' | 'all'): Promise<Trade[]> {
    const activeStatuses = ['pending', 'countered'];
    if (type === 'incoming') {
      return db.select().from(trades)
        .where(and(eq(trades.receiverId, playerId), inArray(trades.status, activeStatuses)))
        .orderBy(desc(trades.createdAt));
    } else if (type === 'outgoing') {
      return db.select().from(trades)
        .where(and(eq(trades.senderId, playerId), inArray(trades.status, activeStatuses)))
        .orderBy(desc(trades.createdAt));
    }
    return db.select().from(trades)
      .where(and(
        sql`(${trades.senderId} = ${playerId} OR ${trades.receiverId} = ${playerId})`,
        inArray(trades.status, activeStatuses)
      ))
      .orderBy(desc(trades.createdAt));
  }

  async getPendingTradeCount(playerId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(trades)
      .where(and(
        eq(trades.receiverId, playerId),
        inArray(trades.status, ['pending', 'countered'])
      ));
    return result[0]?.count || 0;
  }

  async executeTradeAtomic(tradeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await db.transaction(async (tx) => {
        const tradeResult = await tx.execute(
          sql`SELECT * FROM trades WHERE id = ${tradeId} FOR UPDATE`
        );
        const trade = tradeResult.rows[0] as any;
        if (!trade) return { success: false, error: 'Trade not found' };
        if (trade.status === 'completed') return { success: true };
        if (trade.sender_confirmed !== 1 || trade.receiver_confirmed !== 1) {
          return { success: false, error: 'Both parties must confirm' };
        }

        const senderResult = await tx.execute(
          sql`SELECT * FROM players WHERE id = ${trade.sender_id} FOR UPDATE`
        );
        const receiverResult = await tx.execute(
          sql`SELECT * FROM players WHERE id = ${trade.receiver_id} FOR UPDATE`
        );
        const sender = senderResult.rows[0] as any;
        const receiver = receiverResult.rows[0] as any;
        if (!sender || !receiver) return { success: false, error: 'Player not found' };

        const senderItems = trade.sender_items as Record<string, number>;
        const receiverItems = trade.receiver_items as Record<string, number>;
        const senderGold = trade.sender_gold || 0;
        const receiverGold = trade.receiver_gold || 0;
        const senderInv = { ...(sender.inventory as Record<string, number>) };
        const receiverInv = { ...(receiver.inventory as Record<string, number>) };

        if (sender.gold < senderGold) return { success: false, error: 'Sender has insufficient gold' };
        if (receiver.gold < receiverGold) return { success: false, error: 'Receiver has insufficient gold' };

        const senderCursed = (sender.cursed_items as string[]) || [];
        const receiverCursed = (receiver.cursed_items as string[]) || [];

        for (const [itemId, qty] of Object.entries(senderItems)) {
          if ((senderInv[itemId] || 0) < qty) {
            return { success: false, error: `Sender has insufficient ${itemId}` };
          }
          if (senderCursed.includes(itemId)) {
            return { success: false, error: `Cursed items cannot be traded: ${itemId}` };
          }
        }
        for (const [itemId, qty] of Object.entries(receiverItems)) {
          if ((receiverInv[itemId] || 0) < qty) {
            return { success: false, error: `Receiver has insufficient ${itemId}` };
          }
          if (receiverCursed.includes(itemId)) {
            return { success: false, error: `Cursed items cannot be traded: ${itemId}` };
          }
        }

        const senderDurability = (sender.inventory_durability || {}) as Record<string, number>;
        const receiverDurability = (receiver.inventory_durability || {}) as Record<string, number>;
        let senderMods = { ...(sender.item_modifications || {}) as Record<string, any> };
        let receiverMods = { ...(receiver.item_modifications || {}) as Record<string, any> };
        const newSenderDurability = { ...senderDurability };
        const newReceiverDurability = { ...receiverDurability };

        for (const [itemId, qty] of Object.entries(senderItems)) {
          if (!isItemTradable(itemId)) {
            return { success: false, error: `Item is not tradable: ${itemId}` };
          }
          if (senderCursed.includes(itemId)) {
            return { success: false, error: `Cursed items cannot be traded: ${itemId}` };
          }
          if (isEquipmentItem(itemId)) {
            const durVal = senderDurability[itemId] ?? 100;
            if (durVal < 100) {
              return { success: false, error: `Damaged equipment cannot be traded: ${itemId}` };
            }
          }

          senderInv[itemId] = (senderInv[itemId] || 0) - qty;
          if (senderInv[itemId] <= 0) delete senderInv[itemId];
          receiverInv[itemId] = (receiverInv[itemId] || 0) + qty;

          if (senderMods[itemId]) {
            receiverMods[itemId] = senderMods[itemId];
            delete senderMods[itemId];
          }

          if (newSenderDurability[itemId] !== undefined) {
            newReceiverDurability[itemId] = newSenderDurability[itemId];
            delete newSenderDurability[itemId];
          }

          const enhResult = await tx.execute(sql`
            SELECT enhancement_level FROM weapon_enhancements 
            WHERE player_id = ${trade.sender_id} AND item_id = ${itemId}
          `);
          if (enhResult.rows.length > 0) {
            const enhLevel = (enhResult.rows[0] as any).enhancement_level || 0;
            if (enhLevel > 0) {
              await tx.execute(sql`DELETE FROM weapon_enhancements WHERE player_id = ${trade.sender_id} AND item_id = ${itemId}`);
              await tx.execute(sql`
                INSERT INTO weapon_enhancements (player_id, item_id, enhancement_level)
                VALUES (${trade.receiver_id}, ${itemId}, ${enhLevel})
                ON CONFLICT (player_id, item_id) DO UPDATE SET enhancement_level = ${enhLevel}
              `);
            }
          }
        }
        for (const [itemId, qty] of Object.entries(receiverItems)) {
          if (!isItemTradable(itemId)) {
            return { success: false, error: `Item is not tradable: ${itemId}` };
          }
          if (receiverCursed.includes(itemId)) {
            return { success: false, error: `Cursed items cannot be traded: ${itemId}` };
          }
          if (isEquipmentItem(itemId)) {
            const durVal = receiverDurability[itemId] ?? 100;
            if (durVal < 100) {
              return { success: false, error: `Damaged equipment cannot be traded: ${itemId}` };
            }
          }

          receiverInv[itemId] = (receiverInv[itemId] || 0) - qty;
          if (receiverInv[itemId] <= 0) delete receiverInv[itemId];
          senderInv[itemId] = (senderInv[itemId] || 0) + qty;

          if (receiverMods[itemId]) {
            senderMods[itemId] = receiverMods[itemId];
            delete receiverMods[itemId];
          }

          if (newReceiverDurability[itemId] !== undefined) {
            newSenderDurability[itemId] = newReceiverDurability[itemId];
            delete newReceiverDurability[itemId];
          }

          const enhResult = await tx.execute(sql`
            SELECT enhancement_level FROM weapon_enhancements 
            WHERE player_id = ${trade.receiver_id} AND item_id = ${itemId}
          `);
          if (enhResult.rows.length > 0) {
            const enhLevel = (enhResult.rows[0] as any).enhancement_level || 0;
            if (enhLevel > 0) {
              await tx.execute(sql`DELETE FROM weapon_enhancements WHERE player_id = ${trade.receiver_id} AND item_id = ${itemId}`);
              await tx.execute(sql`
                INSERT INTO weapon_enhancements (player_id, item_id, enhancement_level)
                VALUES (${trade.sender_id}, ${itemId}, ${enhLevel})
                ON CONFLICT (player_id, item_id) DO UPDATE SET enhancement_level = ${enhLevel}
              `);
            }
          }
        }

        const newSenderGold = sender.gold - senderGold + receiverGold;
        const newReceiverGold = receiver.gold - receiverGold + senderGold;

        const newSenderDataVersion = (sender.data_version || 1) + 1;
        const newReceiverDataVersion = (receiver.data_version || 1) + 1;

        await tx.update(players).set({
          inventory: senderInv,
          gold: newSenderGold,
          itemModifications: senderMods,
          inventoryDurability: newSenderDurability,
          dataVersion: newSenderDataVersion,
        }).where(eq(players.id, trade.sender_id));

        await tx.update(players).set({
          inventory: receiverInv,
          gold: newReceiverGold,
          itemModifications: receiverMods,
          inventoryDurability: newReceiverDurability,
          dataVersion: newReceiverDataVersion,
        }).where(eq(players.id, trade.receiver_id));

        await tx.update(trades).set({ status: 'completed', completedAt: new Date() }).where(eq(trades.id, tradeId));

        return { success: true };
      });
      return result;
    } catch (error: any) {
      return { success: false, error: error.message || 'Transaction failed' };
    }
  }

  async expireOldTrades(): Promise<number> {
    const result = await db.update(trades)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(
        inArray(trades.status, ['pending', 'countered']),
        lt(trades.expiresAt, new Date())
      ))
      .returning();
    return result.length;
  }

  // ==================== GUILD OPERATIONS ====================

  async createGuild(guild: InsertGuild): Promise<Guild> {
    const [result] = await db.insert(guilds).values(guild).returning();
    return result;
  }

  async getGuild(id: string): Promise<Guild | undefined> {
    const [result] = await db.select().from(guilds).where(eq(guilds.id, id));
    return result;
  }

  async getGuildByName(name: string): Promise<Guild | undefined> {
    const [result] = await db.select().from(guilds).where(eq(guilds.name, name));
    return result;
  }

  async updateGuild(id: string, updates: Partial<Guild>): Promise<Guild | undefined> {
    const [result] = await db.update(guilds)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(guilds.id, id))
      .returning();
    return result;
  }

  async deleteGuild(id: string): Promise<boolean> {
    const result = await db.delete(guilds).where(eq(guilds.id, id)).returning();
    return result.length > 0;
  }

  async getAllGuilds(): Promise<Guild[]> {
    return db.select().from(guilds).orderBy(desc(guilds.level), desc(guilds.totalContribution));
  }

  async searchGuilds(searchTerm: string): Promise<Guild[]> {
    return db.select().from(guilds)
      .where(ilike(guilds.name, `%${searchTerm}%`))
      .orderBy(desc(guilds.level));
  }

  // Guild member operations
  async addGuildMember(member: InsertGuildMember): Promise<GuildMember> {
    const [result] = await db.insert(guildMembers).values(member).returning();
    return result;
  }

  async removeGuildMember(guildId: string, playerId: string): Promise<boolean> {
    const result = await db.delete(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.playerId, playerId)))
      .returning();
    return result.length > 0;
  }

  async getGuildMembers(guildId: string): Promise<(GuildMember & { player: Player })[]> {
    const result = await db
      .select({
        id: guildMembers.id,
        guildId: guildMembers.guildId,
        playerId: guildMembers.playerId,
        role: guildMembers.role,
        totalContribution: guildMembers.totalContribution,
        dailyContribution: guildMembers.dailyContribution,
        lastContributionReset: guildMembers.lastContributionReset,
        joinedAt: guildMembers.joinedAt,
        player: players,
      })
      .from(guildMembers)
      .innerJoin(players, eq(guildMembers.playerId, players.id))
      .where(eq(guildMembers.guildId, guildId))
      .orderBy(
        sql`CASE WHEN ${guildMembers.role} = 'leader' THEN 0 WHEN ${guildMembers.role} = 'officer' THEN 1 ELSE 2 END`,
        desc(guildMembers.totalContribution)
      );
    return result;
  }

  async getPlayerGuild(playerId: string): Promise<{ guild: Guild; membership: GuildMember } | undefined> {
    const result = await db
      .select({
        membership: guildMembers,
        guild: guilds,
      })
      .from(guildMembers)
      .innerJoin(guilds, eq(guildMembers.guildId, guilds.id))
      .where(eq(guildMembers.playerId, playerId))
      .limit(1);
    
    if (result.length === 0) return undefined;
    return { guild: result[0].guild, membership: result[0].membership };
  }

  async updateMemberRole(guildId: string, playerId: string, role: string): Promise<GuildMember | undefined> {
    const [result] = await db.update(guildMembers)
      .set({ role })
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.playerId, playerId)))
      .returning();
    return result;
  }

  async addGuildContribution(playerId: string, amount: number): Promise<{ memberContribution: number; guildXp: number; guildLevelUp: boolean } | undefined> {
    const playerGuild = await this.getPlayerGuild(playerId);
    if (!playerGuild) return undefined;

    const { guild, membership } = playerGuild;

    // Check daily cap
    const now = new Date();
    const lastReset = membership.lastContributionReset ? new Date(membership.lastContributionReset) : now;
    const isNewDay = now.toDateString() !== lastReset.toDateString();
    
    let currentDaily = isNewDay ? 0 : membership.dailyContribution;
    const remainingCap = DAILY_CONTRIBUTION_CAP - currentDaily;
    const actualContribution = Math.min(amount, remainingCap);

    if (actualContribution <= 0) {
      return { memberContribution: 0, guildXp: 0, guildLevelUp: false };
    }

    // Update member contribution
    await db.update(guildMembers)
      .set({
        totalContribution: membership.totalContribution + actualContribution,
        dailyContribution: currentDaily + actualContribution,
        lastContributionReset: isNewDay ? now : membership.lastContributionReset,
      })
      .where(eq(guildMembers.id, membership.id));

    // Update guild XP
    const newGuildXp = guild.xp + actualContribution;
    const xpNeeded = getGuildLevelXp(guild.level);
    let levelUp = false;
    let newLevel = guild.level;

    if (newGuildXp >= xpNeeded) {
      levelUp = true;
      newLevel = guild.level + 1;
    }

    await db.update(guilds)
      .set({
        xp: levelUp ? newGuildXp - xpNeeded : newGuildXp,
        level: newLevel,
        totalContribution: guild.totalContribution + actualContribution,
        updatedAt: now,
      })
      .where(eq(guilds.id, guild.id));

    return { memberContribution: actualContribution, guildXp: newGuildXp, guildLevelUp: levelUp };
  }

  async resetDailyContributions(): Promise<void> {
    await db.update(guildMembers).set({ dailyContribution: 0, lastContributionReset: new Date() });
  }

  async creditGuildBankResources(guildId: string, resources: Partial<Record<'gold' | 'wood' | 'ore' | 'metal' | 'food' | 'monster' | 'rare', number>>): Promise<void> {
    const guild = await this.getGuild(guildId);
    if (!guild) return;

    const currentBank = (guild.bankResources as Record<string, number>) || {
      gold: 0, wood: 0, ore: 0, metal: 0, food: 0, monster: 0, rare: 0
    };

    const newBank = { ...currentBank };
    for (const [key, value] of Object.entries(resources)) {
      if (value && value > 0) {
        newBank[key] = (newBank[key] || 0) + value;
      }
    }

    await db.update(guilds)
      .set({ bankResources: newBank, updatedAt: new Date() })
      .where(eq(guilds.id, guildId));
  }

  // Guild upgrade operations
  async getGuildUpgrades(guildId: string): Promise<GuildUpgrade[]> {
    return db.select().from(guildUpgrades).where(eq(guildUpgrades.guildId, guildId));
  }

  async purchaseGuildUpgrade(guildId: string, upgradeType: string, cost: number): Promise<GuildUpgrade | undefined> {
    return await db.transaction(async (tx) => {
      // Check if upgrade exists
      const existing = await tx.select().from(guildUpgrades)
        .where(and(eq(guildUpgrades.guildId, guildId), eq(guildUpgrades.upgradeType, upgradeType)));

      if (existing.length > 0) {
        // Upgrade existing
        const [result] = await tx.update(guildUpgrades)
          .set({ level: existing[0].level + 1, purchasedAt: new Date() })
          .where(eq(guildUpgrades.id, existing[0].id))
          .returning();
        return result;
      } else {
        // Create new upgrade
        const [result] = await tx.insert(guildUpgrades)
          .values({ guildId, upgradeType, level: 1 })
          .returning();
        return result;
      }
    });
  }

  async purchaseGuildUpgradeWithBankResources(
    guildId: string, 
    upgradeType: string, 
    resourceCosts: { category: string; amount: number }[]
  ): Promise<{ success: boolean; upgrade?: GuildUpgrade; error?: string }> {
    return await db.transaction(async (tx) => {
      // Get fresh guild data within transaction
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) {
        return { success: false, error: "Lonca bulunamadı" };
      }

      const bankResources = (guild.bankResources as Record<string, number>) || {
        gold: 0, wood: 0, ore: 0, metal: 0, food: 0, monster: 0, rare: 0
      };

      // Verify sufficient resources within transaction (atomic check)
      for (const { category, amount } of resourceCosts) {
        const available = bankResources[category] || 0;
        if (available < amount) {
          return { success: false, error: `Yeterli kaynak yok: ${category}` };
        }
      }

      // Deduct resources
      const newBank = { ...bankResources };
      for (const { category, amount } of resourceCosts) {
        newBank[category] = Math.max(0, (newBank[category] || 0) - amount);
      }

      // Update guild bank
      await tx.update(guilds)
        .set({ bankResources: newBank, updatedAt: new Date() })
        .where(eq(guilds.id, guildId));

      // Check if upgrade exists and update/create
      const existing = await tx.select().from(guildUpgrades)
        .where(and(eq(guildUpgrades.guildId, guildId), eq(guildUpgrades.upgradeType, upgradeType)));

      let upgrade: GuildUpgrade;
      if (existing.length > 0) {
        const [result] = await tx.update(guildUpgrades)
          .set({ level: existing[0].level + 1, purchasedAt: new Date() })
          .where(eq(guildUpgrades.id, existing[0].id))
          .returning();
        upgrade = result;
      } else {
        const [result] = await tx.insert(guildUpgrades)
          .values({ guildId, upgradeType, level: 1 })
          .returning();
        upgrade = result;
      }

      return { success: true, upgrade };
    });
  }

  async getPlayerGuildBonuses(playerId: string): Promise<GuildBonuses | null> {
    const playerGuild = await this.getPlayerGuild(playerId);
    if (!playerGuild) return null;
    
    const upgrades = await this.getGuildUpgrades(playerGuild.guild.id);
    const upgradeMap: Record<string, number> = {};
    for (const upgrade of upgrades) {
      upgradeMap[upgrade.upgradeType] = upgrade.level;
    }
    
    return calculateGuildBonuses(upgradeMap);
  }

  // Guild message operations
  async createGuildMessage(message: InsertGuildMessage): Promise<GuildMessage> {
    const [result] = await db.insert(guildMessages).values(message).returning();
    return result;
  }

  async getGuildMessages(guildId: string, limit: number = 50): Promise<GuildMessage[]> {
    return db.select().from(guildMessages)
      .where(eq(guildMessages.guildId, guildId))
      .orderBy(desc(guildMessages.createdAt))
      .limit(limit);
  }

  // Guild join request operations
  async createJoinRequest(request: InsertGuildJoinRequest): Promise<GuildJoinRequest> {
    const [result] = await db.insert(guildJoinRequests).values(request).returning();
    return result;
  }

  async getGuildJoinRequests(guildId: string): Promise<GuildJoinRequest[]> {
    return db.select().from(guildJoinRequests)
      .where(and(eq(guildJoinRequests.guildId, guildId), eq(guildJoinRequests.status, 'pending')))
      .orderBy(desc(guildJoinRequests.createdAt));
  }

  async getPlayerJoinRequests(playerId: string): Promise<GuildJoinRequest[]> {
    return db.select().from(guildJoinRequests)
      .where(eq(guildJoinRequests.playerId, playerId))
      .orderBy(desc(guildJoinRequests.createdAt));
  }

  async respondToJoinRequest(requestId: string, status: 'accepted' | 'rejected', respondedBy: string): Promise<GuildJoinRequest | undefined> {
    const [result] = await db.update(guildJoinRequests)
      .set({ status, respondedAt: new Date(), respondedBy })
      .where(eq(guildJoinRequests.id, requestId))
      .returning();
    return result;
  }

  async cancelJoinRequest(requestId: string, playerId: string): Promise<boolean> {
    const result = await db.delete(guildJoinRequests)
      .where(and(eq(guildJoinRequests.id, requestId), eq(guildJoinRequests.playerId, playerId)))
      .returning();
    return result.length > 0;
  }

  // Guild invite operations
  async createGuildInvite(invite: InsertGuildInvite): Promise<GuildInvite> {
    const [result] = await db.insert(guildInvites).values(invite).returning();
    return result;
  }

  async getPlayerPendingInvites(playerId: string): Promise<GuildInvite[]> {
    return db.select().from(guildInvites)
      .where(and(
        eq(guildInvites.targetPlayerId, playerId),
        eq(guildInvites.status, 'pending')
      ))
      .orderBy(desc(guildInvites.createdAt));
  }

  async getGuildSentInvites(guildId: string): Promise<GuildInvite[]> {
    return db.select().from(guildInvites)
      .where(and(eq(guildInvites.guildId, guildId), eq(guildInvites.status, 'pending')))
      .orderBy(desc(guildInvites.createdAt));
  }

  async respondToGuildInvite(inviteId: string, playerId: string, accept: boolean): Promise<{ success: boolean; error?: string }> {
    return await db.transaction(async (tx) => {
      const [invite] = await tx.select().from(guildInvites)
        .where(and(eq(guildInvites.id, inviteId), eq(guildInvites.targetPlayerId, playerId)));
      
      if (!invite) {
        return { success: false, error: "Davet bulunamadı" };
      }

      if (invite.status !== 'pending') {
        return { success: false, error: "Bu davet artık geçerli değil" };
      }

      if (accept) {
        const existingMembership = await tx.select().from(guildMembers)
          .where(eq(guildMembers.playerId, playerId));
        
        if (existingMembership.length > 0) {
          await tx.update(guildInvites)
            .set({ status: 'rejected', respondedAt: new Date() })
            .where(eq(guildInvites.id, inviteId));
          return { success: false, error: "Zaten bir loncaya üyesin" };
        }

        const [guild] = await tx.select().from(guilds)
          .where(eq(guilds.id, invite.guildId));
        
        if (!guild) {
          await tx.update(guildInvites)
            .set({ status: 'expired', respondedAt: new Date() })
            .where(eq(guildInvites.id, inviteId));
          return { success: false, error: "Lonca artık mevcut değil" };
        }

        const memberCountResult = await tx.select({ count: sql<number>`count(*)::int` }).from(guildMembers)
          .where(eq(guildMembers.guildId, guild.id));
        const currentMemberCount = memberCountResult[0]?.count || 0;

        const upgradeResult = await tx.select().from(guildUpgrades)
          .where(and(eq(guildUpgrades.guildId, guild.id), eq(guildUpgrades.upgradeType, 'member_capacity')));
        const capacityLevel = upgradeResult[0]?.level || 0;
        const maxMembers = guild.baseMemberLimit + (capacityLevel * 5);
        
        if (currentMemberCount >= maxMembers) {
          return { success: false, error: "Lonca kapasitesi dolu" };
        }

        await tx.insert(guildMembers).values({
          guildId: invite.guildId,
          playerId: playerId,
          role: 'member',
        });

        await tx.update(guildInvites)
          .set({ status: 'accepted', respondedAt: new Date() })
          .where(eq(guildInvites.id, inviteId));

        await tx.update(guildInvites)
          .set({ status: 'expired', respondedAt: new Date() })
          .where(and(
            eq(guildInvites.targetPlayerId, playerId),
            eq(guildInvites.status, 'pending'),
            ne(guildInvites.id, inviteId)
          ));

        return { success: true };
      } else {
        await tx.update(guildInvites)
          .set({ status: 'rejected', respondedAt: new Date() })
          .where(eq(guildInvites.id, inviteId));
        return { success: true };
      }
    });
  }

  async cancelGuildInvite(inviteId: string, guildId: string): Promise<boolean> {
    const result = await db.delete(guildInvites)
      .where(and(eq(guildInvites.id, inviteId), eq(guildInvites.guildId, guildId)))
      .returning();
    return result.length > 0;
  }

  async hasPendingInvite(guildId: string, targetPlayerId: string): Promise<boolean> {
    const result = await db.select().from(guildInvites)
      .where(and(
        eq(guildInvites.guildId, guildId),
        eq(guildInvites.targetPlayerId, targetPlayerId),
        eq(guildInvites.status, 'pending')
      ))
      .limit(1);
    return result.length > 0;
  }

  // Push subscription operations
  async savePushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    // Upsert: delete existing subscription for this player and insert new one
    await db.delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.playerId, sub.playerId));
    
    const [subscription] = await db.insert(pushSubscriptionsTable)
      .values(sub)
      .returning();
    return subscription;
  }

  async getPushSubscription(playerId: string): Promise<PushSubscription | undefined> {
    const [subscription] = await db.select().from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.playerId, playerId));
    return subscription;
  }

  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptionsTable);
  }

  async deletePushSubscription(playerId: string): Promise<boolean> {
    const result = await db.delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.playerId, playerId))
      .returning();
    return result.length > 0;
  }

  // Equipment durability operations
  async breakEquipment(playerId: string, slot: string): Promise<{ success: boolean; itemId?: string; error?: string }> {
    return await db.transaction(async (tx) => {
      const [player] = await tx.select().from(players).where(eq(players.id, playerId));
      if (!player) {
        return { success: false, error: "Player not found" };
      }

      const equipment = player.equipment as Record<string, string | null>;
      const itemId = equipment[slot];
      if (!itemId) {
        return { success: false, error: "No item in slot" };
      }

      // Remove from equipment
      const newEquipment = { ...equipment };
      delete newEquipment[slot];

      // Remove durability tracking for this slot
      const durability = (player.equipmentDurability || {}) as Record<string, number>;
      const newDurability = { ...durability };
      delete newDurability[slot];

      // Remove from inventory if exists
      const inventory = player.inventory as Record<string, number>;
      const newInventory = { ...inventory };
      // Don't remove from inventory - we're breaking equipped item
      // If they have spare copies, those remain

      await tx.update(players)
        .set({ 
          equipment: newEquipment,
          equipmentDurability: newDurability,
          lastSaved: new Date()
        })
        .where(eq(players.id, playerId));

      return { success: true, itemId };
    });
  }

  async repairEquipment(playerId: string, slot: string, cost: number): Promise<{ success: boolean; error?: string }> {
    return await db.transaction(async (tx) => {
      const [player] = await tx.select().from(players).where(eq(players.id, playerId));
      if (!player) {
        return { success: false, error: "Player not found" };
      }

      if (player.gold < cost) {
        return { success: false, error: "Not enough gold" };
      }

      const equipment = player.equipment as Record<string, string | null>;
      if (!equipment[slot]) {
        return { success: false, error: "No item in slot" };
      }

      // Restore durability to 100%
      const durability = (player.equipmentDurability || {}) as Record<string, number>;
      const newDurability = { ...durability, [slot]: 100 };

      await tx.update(players)
        .set({ 
          equipmentDurability: newDurability,
          gold: player.gold - cost,
          lastSaved: new Date()
        })
        .where(eq(players.id, playerId));

      return { success: true };
    });
  }

  async repairAllEquipment(playerId: string, totalCost: number): Promise<{ success: boolean; error?: string }> {
    return await db.transaction(async (tx) => {
      const [player] = await tx.select().from(players).where(eq(players.id, playerId));
      if (!player) {
        return { success: false, error: "Player not found" };
      }

      if (player.gold < totalCost) {
        return { success: false, error: "Not enough gold" };
      }

      const equipment = player.equipment as Record<string, string | null>;
      const newDurability: Record<string, number> = {};
      
      // Set all equipped items to 100% durability
      for (const [slot, itemId] of Object.entries(equipment)) {
        if (itemId) {
          newDurability[slot] = 100;
        }
      }

      await tx.update(players)
        .set({ 
          equipmentDurability: newDurability,
          gold: player.gold - totalCost,
          lastSaved: new Date()
        })
        .where(eq(players.id, playerId));

      return { success: true };
    });
  }

  async updateEquipmentDurability(playerId: string, durability: Record<string, number>): Promise<boolean> {
    const result = await db.update(players)
      .set({ 
        equipmentDurability: durability,
        lastSaved: new Date()
      })
      .where(eq(players.id, playerId))
      .returning();
    return result.length > 0;
  }
  
  async getPlayersWithActiveCombat(): Promise<Player[]> {
    const result = await db.select()
      .from(players)
      .where(sql`${players.activeCombat} IS NOT NULL`);
    return result;
  }
  
  async getPlayersWithActiveTasks(): Promise<Player[]> {
    const result = await db.select()
      .from(players)
      .where(sql`${players.activeTask} IS NOT NULL`);
    return result;
  }

  async getPlayersWithActiveTravel(): Promise<Player[]> {
    const result = await db.select()
      .from(players)
      .where(sql`${players.activeTravel} IS NOT NULL`);
    return result;
  }

  // Game Items operations
  async getAllGameItems(): Promise<GameItem[]> {
    return await db.select().from(gameItems);
  }

  async getGameItem(id: string): Promise<GameItem | undefined> {
    const [item] = await db.select().from(gameItems).where(eq(gameItems.id, id));
    return item;
  }

  async createGameItem(item: InsertGameItem): Promise<GameItem> {
    const [created] = await db.insert(gameItems).values(item).returning();
    return created;
  }

  async updateGameItem(id: string, updates: Partial<InsertGameItem>): Promise<GameItem | undefined> {
    const [updated] = await db.update(gameItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gameItems.id, id))
      .returning();
    return updated;
  }

  async deleteGameItem(id: string): Promise<boolean> {
    const result = await db.delete(gameItems).where(eq(gameItems.id, id)).returning();
    return result.length > 0;
  }

  async bulkCreateGameItems(items: InsertGameItem[]): Promise<number> {
    if (items.length === 0) return 0;
    const result = await db.insert(gameItems).values(items).onConflictDoNothing().returning();
    return result.length;
  }

  // Game Recipes operations
  async getAllGameRecipes(): Promise<GameRecipe[]> {
    return await db.select().from(gameRecipes);
  }

  async getGameRecipe(id: string): Promise<GameRecipe | undefined> {
    const [recipe] = await db.select().from(gameRecipes).where(eq(gameRecipes.id, id));
    return recipe;
  }

  async createGameRecipe(recipe: InsertGameRecipe): Promise<GameRecipe> {
    const [created] = await db.insert(gameRecipes).values(recipe).returning();
    return created;
  }

  async updateGameRecipe(id: string, updates: Partial<InsertGameRecipe>): Promise<GameRecipe | undefined> {
    const [updated] = await db.update(gameRecipes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gameRecipes.id, id))
      .returning();
    return updated;
  }

  async deleteGameRecipe(id: string): Promise<boolean> {
    const result = await db.delete(gameRecipes).where(eq(gameRecipes.id, id)).returning();
    return result.length > 0;
  }

  async bulkCreateGameRecipes(recipes: InsertGameRecipe[]): Promise<number> {
    if (recipes.length === 0) return 0;
    const result = await db.insert(gameRecipes).values(recipes).onConflictDoNothing().returning();
    return result.length;
  }

  // Equipment Sets operations
  async getAllEquipmentSets(): Promise<EquipmentSet[]> {
    return await db.select().from(equipmentSets);
  }

  // Combat Regions operations
  async getAllCombatRegions(): Promise<GameCombatRegion[]> {
    return await db.select().from(gameCombatRegions).orderBy(gameCombatRegions.sortOrder);
  }

  async getCombatRegion(id: string): Promise<GameCombatRegion | undefined> {
    const [region] = await db.select().from(gameCombatRegions).where(eq(gameCombatRegions.id, id));
    return region;
  }

  async createCombatRegion(region: InsertGameCombatRegion): Promise<GameCombatRegion> {
    const [created] = await db.insert(gameCombatRegions).values(region).returning();
    return created;
  }

  async updateCombatRegion(id: string, updates: Partial<InsertGameCombatRegion>): Promise<GameCombatRegion | undefined> {
    const [updated] = await db.update(gameCombatRegions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gameCombatRegions.id, id))
      .returning();
    return updated;
  }

  async deleteCombatRegion(id: string): Promise<boolean> {
    const result = await db.delete(gameCombatRegions).where(eq(gameCombatRegions.id, id)).returning();
    return result.length > 0;
  }

  async bulkCreateCombatRegions(regions: InsertGameCombatRegion[]): Promise<number> {
    if (regions.length === 0) return 0;
    const result = await db.insert(gameCombatRegions).values(regions).onConflictDoNothing().returning();
    return result.length;
  }

  // Game Monsters operations
  async getAllGameMonsters(): Promise<GameMonster[]> {
    return await db.select().from(gameMonsters).orderBy(gameMonsters.sortOrder);
  }

  async getGameMonster(id: string): Promise<GameMonster | undefined> {
    const [monster] = await db.select().from(gameMonsters).where(eq(gameMonsters.id, id));
    return monster;
  }

  async getMonstersByRegion(regionId: string): Promise<GameMonster[]> {
    return await db.select().from(gameMonsters)
      .where(eq(gameMonsters.regionId, regionId))
      .orderBy(gameMonsters.sortOrder);
  }

  async createGameMonster(monster: InsertGameMonster): Promise<GameMonster> {
    const [created] = await db.insert(gameMonsters).values(monster).returning();
    return created;
  }

  async updateGameMonster(id: string, updates: Partial<InsertGameMonster>): Promise<GameMonster | undefined> {
    const [updated] = await db.update(gameMonsters)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gameMonsters.id, id))
      .returning();
    return updated;
  }

  async deleteGameMonster(id: string): Promise<boolean> {
    const result = await db.delete(gameMonsters).where(eq(gameMonsters.id, id)).returning();
    return result.length > 0;
  }

  async bulkCreateGameMonsters(monsters: InsertGameMonster[]): Promise<number> {
    if (monsters.length === 0) return 0;
    const result = await db.insert(gameMonsters).values(monsters).onConflictDoNothing().returning();
    return result.length;
  }

  // Skill Actions operations
  async getAllSkillActions(): Promise<GameSkillAction[]> {
    return await db.select().from(gameSkillActions).orderBy(gameSkillActions.sortOrder);
  }

  async getSkillActionsBySkill(skill: string): Promise<GameSkillAction[]> {
    return await db.select().from(gameSkillActions)
      .where(eq(gameSkillActions.skill, skill))
      .orderBy(gameSkillActions.sortOrder);
  }

  async getSkillAction(id: string): Promise<GameSkillAction | undefined> {
    const [action] = await db.select().from(gameSkillActions).where(eq(gameSkillActions.id, id));
    return action;
  }

  async createSkillAction(action: InsertGameSkillAction): Promise<GameSkillAction> {
    const [created] = await db.insert(gameSkillActions).values(action).returning();
    return created;
  }

  async updateSkillAction(id: string, updates: Partial<InsertGameSkillAction>): Promise<GameSkillAction | undefined> {
    const [updated] = await db.update(gameSkillActions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gameSkillActions.id, id))
      .returning();
    return updated;
  }

  async deleteSkillAction(id: string): Promise<boolean> {
    const result = await db.delete(gameSkillActions).where(eq(gameSkillActions.id, id)).returning();
    return result.length > 0;
  }

  async bulkCreateSkillActions(actions: InsertGameSkillAction[]): Promise<number> {
    if (actions.length === 0) return 0;
    const result = await db.insert(gameSkillActions).values(actions).onConflictDoNothing().returning();
    return result.length;
  }

  // Raid System Operations
  async getAllRaidBosses(): Promise<any[]> {
    return await db.select().from(raidBosses).orderBy(raidBosses.rotationWeek);
  }

  async getRaidBoss(id: string): Promise<any | undefined> {
    const result = await db.select().from(raidBosses).where(eq(raidBosses.id, id));
    return result[0];
  }

  async updateRaidBoss(id: string, updates: Record<string, any>): Promise<any | undefined> {
    const result = await db.update(raidBosses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(raidBosses.id, id))
      .returning();
    return result[0];
  }

  async getCurrentWeekBoss(): Promise<any | undefined> {
    // Friday-aligned UTC week: count weeks since Jan 2, 1970 (first Friday of Unix epoch)
    // Jan 1, 1970 = Thursday → Jan 2, 1970 = Friday = 1 day in ms
    const FRIDAY_EPOCH_MS = 1 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const weeksSinceFridayEpoch = Math.floor((now - FRIDAY_EPOCH_MS) / (7 * 24 * 60 * 60 * 1000));
    const rotationWeek = (weeksSinceFridayEpoch % 4) + 1;
    const result = await db.execute(sql`SELECT * FROM raid_bosses WHERE rotation_week = ${rotationWeek} AND is_premium = 0`);
    return result.rows[0] as any | undefined;
  }

  async getCurrentWeekBossWithReset(): Promise<{ boss: any; weekEndsAt: Date } | undefined> {
    // Jan 1, 1970 = Thursday → Jan 2, 1970 = Friday = 1 day in ms
    const FRIDAY_EPOCH_MS = 1 * 24 * 60 * 60 * 1000;
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const weeksSinceFridayEpoch = Math.floor((now - FRIDAY_EPOCH_MS) / WEEK_MS);
    const rotationWeek = (weeksSinceFridayEpoch % 4) + 1;
    // weekEndsAt = start of next Friday 00:00 UTC
    const weekEndsAt = new Date(FRIDAY_EPOCH_MS + (weeksSinceFridayEpoch + 1) * WEEK_MS);
    const result = await db.execute(sql`SELECT * FROM raid_bosses WHERE rotation_week = ${rotationWeek} AND is_premium = 0`);
    const boss = result.rows[0] as any;
    if (!boss) return undefined;
    return { boss, weekEndsAt };
  }

  async getPremiumBoss(): Promise<any | undefined> {
    const result = await db.execute(sql`SELECT * FROM raid_bosses WHERE is_premium = 1`);
    return result.rows[0] as any | undefined;
  }

  async getActiveGuildRaid(guildId: string): Promise<any | undefined> {
    await db.execute(sql`
      UPDATE guild_raids 
      SET status = 'failed', completed_at = NOW()
      WHERE guild_id = ${guildId} AND status = 'active' AND ends_at < NOW()
    `);
    
    const result = await db.execute(sql`
      SELECT gr.*, rb.name as boss_name, rb.icon as boss_icon, rb.icon_path as boss_icon_path, rb.skills, rb.loot, rb.milestone_rewards
      FROM guild_raids gr
      JOIN raid_bosses rb ON gr.boss_id = rb.id
      WHERE gr.guild_id = ${guildId} AND gr.status = 'active'
      ORDER BY gr.started_at DESC LIMIT 1
    `);
    return result.rows[0] as any | undefined;
  }

  async getScheduledGuildRaid(guildId: string): Promise<any | undefined> {
    await db.execute(sql`
      UPDATE guild_raids 
      SET status = 'failed', completed_at = NOW()
      WHERE guild_id = ${guildId} AND status = 'scheduled' AND ends_at < NOW()
    `);
    await db.execute(sql`
      UPDATE guild_raids 
      SET status = 'active', started_at = NOW()
      WHERE guild_id = ${guildId} AND status = 'scheduled' AND scheduled_at <= NOW() AND ends_at > NOW()
    `);
    
    const result = await db.execute(sql`
      SELECT gr.*, rb.name as boss_name, rb.icon as boss_icon, rb.icon_path as boss_icon_path, rb.skills, rb.loot, rb.milestone_rewards
      FROM guild_raids gr
      JOIN raid_bosses rb ON gr.boss_id = rb.id
      WHERE gr.guild_id = ${guildId} AND gr.status = 'scheduled'
      ORDER BY gr.scheduled_at DESC LIMIT 1
    `);
    return result.rows[0] as any | undefined;
  }

  async getActiveOrScheduledGuildRaid(guildId: string): Promise<any | undefined> {
    await db.execute(sql`
      UPDATE guild_raids 
      SET status = 'failed', completed_at = NOW()
      WHERE guild_id = ${guildId} AND status IN ('active', 'scheduled') AND ends_at < NOW()
    `);
    
    const result = await db.execute(sql`
      SELECT gr.*, rb.name as boss_name, rb.icon as boss_icon, rb.icon_path as boss_icon_path, rb.skills, rb.loot, rb.milestone_rewards
      FROM guild_raids gr
      JOIN raid_bosses rb ON gr.boss_id = rb.id
      WHERE gr.guild_id = ${guildId} AND gr.status IN ('active', 'scheduled')
      ORDER BY gr.started_at DESC LIMIT 1
    `);
    return result.rows[0] as any | undefined;
  }

  async getLastCompletedGuildRaid(guildId: string): Promise<any | undefined> {
    const result = await db.execute(sql`
      SELECT gr.*, rb.name as boss_name, rb.icon as boss_icon, rb.icon_path as boss_icon_path, rb.skills, rb.loot, rb.milestone_rewards
      FROM guild_raids gr
      JOIN raid_bosses rb ON gr.boss_id = rb.id
      WHERE gr.guild_id = ${guildId} AND gr.status IN ('completed', 'failed')
      ORDER BY gr.completed_at DESC LIMIT 1
    `);
    return result.rows[0] as any | undefined;
  }

  async scheduleGuildRaid(guildId: string, bossId: string, difficulty: string, startedBy: string): Promise<any> {
    const boss = await this.getRaidBoss(bossId);
    if (!boss) throw new Error('Boss not found');
    
    const difficultyMultipliers: Record<string, number> = { normal: 1, hard: 1.5, nightmare: 3, mythic: 5 };
    const multiplier = difficultyMultipliers[difficulty] || 1;
    const maxHp = boss.baseHp * multiplier;
    const scheduledAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000); // 7 days after scheduled start
    
    const result = await db.execute(sql`
      INSERT INTO guild_raids (guild_id, boss_id, difficulty, difficulty_multiplier, max_hp, current_hp, status, scheduled_at, ends_at, started_by)
      VALUES (${guildId}, ${bossId}, ${difficulty}, ${multiplier}, ${maxHp}, ${maxHp}, 'scheduled', ${scheduledAt}, ${endsAt}, ${startedBy})
      RETURNING *
    `);
    return result.rows[0];
  }

  async activateScheduledRaid(raidId: string): Promise<any | undefined> {
    const result = await db.execute(sql`
      UPDATE guild_raids 
      SET status = 'active', started_at = NOW()
      WHERE id = ${raidId} AND status = 'scheduled'
      RETURNING *
    `);
    return result.rows[0] as any | undefined;
  }

  async getRaidParticipants(raidId: string): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT rp.*, p.username, p.avatar
      FROM raid_participation rp
      JOIN players p ON rp.player_id = p.id
      WHERE rp.raid_id = ${raidId}
      ORDER BY rp.id ASC
    `);
    return result.rows as any[];
  }

  async getActiveRaidsByBossId(bossId: string): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT id, current_hp, max_hp
      FROM guild_raids
      WHERE boss_id = ${bossId} AND status = 'active'
    `);
    return result.rows as any[];
  }

  async createGuildRaid(guildId: string, bossId: string, difficulty: string, startedBy: string): Promise<any> {
    const boss = await this.getRaidBoss(bossId);
    if (!boss) throw new Error('Boss not found');
    
    const difficultyMultipliers: Record<string, number> = { normal: 1, hard: 1.5, nightmare: 3, mythic: 5 };
    const multiplier = difficultyMultipliers[difficulty] || 1;
    const maxHp = boss.baseHp * multiplier;
    // Cap raid end time at next Friday 00:00 UTC (weekly reset boundary)
    const FRIDAY_EPOCH_MS = 1 * 24 * 60 * 60 * 1000; // Jan 2, 1970 was a Friday
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const weeksSinceFridayEpoch = Math.floor((now - FRIDAY_EPOCH_MS) / WEEK_MS);
    const endsAt = new Date(FRIDAY_EPOCH_MS + (weeksSinceFridayEpoch + 1) * WEEK_MS);
    
    const result = await db.execute(sql`
      INSERT INTO guild_raids (guild_id, boss_id, difficulty, difficulty_multiplier, max_hp, current_hp, ends_at, started_by)
      VALUES (${guildId}, ${bossId}, ${difficulty}, ${multiplier}, ${maxHp}, ${maxHp}, ${endsAt}, ${startedBy})
      RETURNING *
    `);
    return result.rows[0];
  }

  async updateGuildRaid(raidId: string, updates: Record<string, any>): Promise<any | undefined> {
    const setClauses = Object.entries(updates).map(([key, val]) => `${key} = ${typeof val === 'number' ? val : `'${val}'`}`).join(', ');
    const result = await db.execute(sql.raw(`UPDATE guild_raids SET ${setClauses} WHERE id = '${raidId}' RETURNING *`));
    return result.rows[0] as any | undefined;
  }

  async completeGuildRaid(raidId: string, status: 'completed' | 'failed'): Promise<any | undefined> {
    const result = await db.execute(sql`
      UPDATE guild_raids SET status = ${status}, completed_at = NOW() WHERE id = ${raidId} RETURNING *
    `);
    return result.rows[0] as any | undefined;
  }

  async getRaidParticipation(raidId: string, playerId: string): Promise<any | undefined> {
    const result = await db.execute(sql`
      SELECT * FROM raid_participation WHERE raid_id = ${raidId} AND player_id = ${playerId}
    `);
    return result.rows[0] as any | undefined;
  }

  async createRaidParticipation(raidId: string, playerId: string): Promise<any> {
    const result = await db.execute(sql`
      INSERT INTO raid_participation (raid_id, player_id)
      VALUES (${raidId}, ${playerId})
      RETURNING *
    `);
    return result.rows[0];
  }

  async recordRaidDamage(raidId: string, playerId: string, damage: number, tokensEarned: number): Promise<any | undefined> {
    const todayUTC = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Track days_participated: increment if last_day_participated != today
    const result = await db.execute(sql`
      UPDATE raid_participation 
      SET total_damage = total_damage + ${damage}, 
          attacks_today = attacks_today + 1,
          tokens_earned = tokens_earned + ${tokensEarned},
          last_participation_date = NOW(),
          days_participated = CASE 
            WHEN last_day_participated IS NULL OR last_day_participated != ${todayUTC} 
            THEN days_participated + 1 
            ELSE days_participated 
          END,
          last_day_participated = ${todayUTC}
      WHERE raid_id = ${raidId} AND player_id = ${playerId}
      RETURNING *
    `);
    
    await db.execute(sql`
      UPDATE guild_raids SET total_damage = total_damage + ${damage}, current_hp = GREATEST(0, current_hp - ${damage})
      WHERE id = ${raidId}
    `);
    
    return result.rows[0] as any | undefined;
  }

  async resetRaidStreak(raidId: string, playerId: string): Promise<void> {
    await db.execute(sql`
      UPDATE raid_participation 
      SET current_streak = 0
      WHERE raid_id = ${raidId} AND player_id = ${playerId}
    `);
  }

  async resetRaidAttacks(raidId: string, playerId: string): Promise<void> {
    await db.execute(sql`
      UPDATE raid_participation 
      SET attacks_today = 0
      WHERE raid_id = ${raidId} AND player_id = ${playerId}
    `);
  }

  async resetDailyRaidAttacks(raidId: string, playerId: string): Promise<void> {
    await db.execute(sql`
      UPDATE raid_participation 
      SET attacks_today = 0, last_attack_reset = NOW()
      WHERE raid_id = ${raidId} AND player_id = ${playerId}
    `);
  }

  async getRaidLeaderboard(raidId: string, limit: number = 20): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT rp.*, p.username, p.skills
      FROM raid_participation rp
      JOIN players p ON rp.player_id = p.id
      WHERE rp.raid_id = ${raidId}
      ORDER BY rp.total_damage DESC
      LIMIT ${limit}
    `);
    return result.rows as any[];
  }

  async claimMilestoneReward(raidId: string, playerId: string, milestone: number): Promise<{ success: boolean; error?: string }> {
    const participation = await this.getRaidParticipation(raidId, playerId);
    if (!participation) return { success: false, error: 'Not participating in this raid' };
    
    const milestoneField = `milestone_${milestone}_claimed`;
    if ((participation as any)[milestoneField]) return { success: false, error: 'Already claimed' };
    
    await db.execute(sql.raw(`UPDATE raid_participation SET ${milestoneField} = 1 WHERE raid_id = '${raidId}' AND player_id = '${playerId}'`));
    return { success: true };
  }

  async getPlayerRaidTokens(playerId: string): Promise<{ balance: number; totalEarned: number; totalSpent: number }> {
    const result = await db.execute(sql`SELECT * FROM raid_tokens WHERE player_id = ${playerId}`);
    if (result.rows.length === 0) {
      return { balance: 0, totalEarned: 0, totalSpent: 0 };
    }
    const row = result.rows[0] as any;
    return { balance: row.balance, totalEarned: row.total_earned, totalSpent: row.total_spent };
  }

  async addRaidTokens(playerId: string, amount: number): Promise<any> {
    const result = await db.execute(sql`
      INSERT INTO raid_tokens (player_id, balance, total_earned)
      VALUES (${playerId}, ${amount}, ${amount})
      ON CONFLICT (player_id) DO UPDATE SET 
        balance = raid_tokens.balance + ${amount},
        total_earned = raid_tokens.total_earned + ${amount},
        updated_at = NOW()
      RETURNING *
    `);
    return result.rows[0];
  }

  async spendRaidTokens(playerId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const tokens = await this.getPlayerRaidTokens(playerId);
    if (tokens.balance < amount) return { success: false, error: 'Insufficient tokens' };
    
    await db.execute(sql`
      UPDATE raid_tokens SET balance = balance - ${amount}, total_spent = total_spent + ${amount}, updated_at = NOW()
      WHERE player_id = ${playerId}
    `);
    return { success: true };
  }

  async getRaidShopItems(): Promise<any[]> {
    const result = await db.execute(sql`SELECT * FROM raid_shop_items WHERE is_active = 1 ORDER BY sort_order ASC`);
    
    // Seed if V2 items are missing (handles prod DB with legacy items OR empty table)
    const hasV2Items = (result.rows as any[]).some((r: any) => r.id === 'shop_raidbreaker_stone');
    if (!hasV2Items) {
      console.log("[RaidShop] V2 items missing, seeding default shop items...");
      await this.seedRaidShopItems();
      const seededResult = await db.execute(sql`SELECT * FROM raid_shop_items WHERE is_active = 1 ORDER BY sort_order ASC`);
      return seededResult.rows as any[];
    }
    
    return result.rows as any[];
  }

  private async seedRaidShopItems(): Promise<void> {
    // Deactivate any legacy shop items that are no longer part of the V2 shop
    const KNOWN_SHOP_IDS = [
      'shop_raidbreaker_stone', 'shop_boss_chest_key',
      'shop_infernal_essence_buy', 'shop_weekly_power_infernal',
      'shop_frost_essence_buy', 'shop_weekly_power_frost',
      'shop_shadow_essence_buy', 'shop_weekly_power_shadow',
      'shop_thunder_essence_buy', 'shop_weekly_power_thunder',
      'shop_raid_title',
    ];
    await db.execute(sql`
      UPDATE raid_shop_items SET is_active = 0
      WHERE id NOT IN (${sql.raw(KNOWN_SHOP_IDS.map(id => `'${id}'`).join(','))})
    `);

    const staticItems = [
      { id: 'shop_raidbreaker_stone', name: 'Raidbreaker Enhancement Stone', description: 'Enhances Raidbreaker weapons beyond +10. Rare and precious.', icon: 'gem', item_id: 'raidbreaker_enhancement_stone', quantity: 1, token_cost: 1500, max_purchases: 1, reset_period: 'weekly', min_guild_level: 5, boss_id: null, sort_order: 1 },
      { id: 'shop_boss_chest_key', name: 'Boss Chest Key', description: 'Opens a Boss Chest from your inventory. Can be purchased multiple times per week.', icon: 'key', item_id: 'boss_chest_key', quantity: 1, token_cost: 100, max_purchases: 3, reset_period: 'weekly', min_guild_level: 1, boss_id: null, sort_order: 2 },
      { id: 'shop_raid_title', name: 'Raid Conqueror Badge', description: 'Earn the legendary Raid Conqueror title. Grants a permanent badge to your account — a symbol of unmatched raid mastery. Does not add to inventory.', icon: 'crown', item_id: 'raid_conqueror_badge', quantity: 1, token_cost: 50000, max_purchases: 1, reset_period: 'never', min_guild_level: 5, boss_id: null, sort_order: 99 },
    ];
    const bossItems = [
      { id: 'shop_infernal_essence_buy', name: 'Infernal Essence', description: 'Purchase extra Infernal Essence to craft Infernal Titan raid armor.', icon: 'flame', item_id: 'infernal_essence', quantity: 5, token_cost: 150, max_purchases: 5, reset_period: 'weekly', min_guild_level: 1, boss_id: 'infernal_titan', sort_order: 10 },
      { id: 'shop_weekly_power_infernal', name: 'Infernal Power Token', description: 'Grants a raid damage boost against the Infernal Titan for this week.', icon: 'zap', item_id: 'weekly_power_token', quantity: 1, token_cost: 250, max_purchases: 1, reset_period: 'weekly', min_guild_level: 2, boss_id: 'infernal_titan', sort_order: 11 },
      { id: 'shop_frost_essence_buy', name: 'Frost Essence', description: 'Purchase extra Frost Essence to craft Frost Wyrm raid armor.', icon: 'snowflake', item_id: 'frost_essence', quantity: 5, token_cost: 150, max_purchases: 5, reset_period: 'weekly', min_guild_level: 1, boss_id: 'frost_wyrm', sort_order: 10 },
      { id: 'shop_weekly_power_frost', name: 'Frost Power Token', description: 'Grants a raid damage boost against the Frost Wyrm for this week.', icon: 'zap', item_id: 'weekly_power_token', quantity: 1, token_cost: 250, max_purchases: 1, reset_period: 'weekly', min_guild_level: 2, boss_id: 'frost_wyrm', sort_order: 11 },
      { id: 'shop_shadow_essence_buy', name: 'Shadow Essence', description: 'Purchase extra Shadow Essence to craft Shadow Colossus raid armor.', icon: 'moon', item_id: 'shadow_essence', quantity: 5, token_cost: 150, max_purchases: 5, reset_period: 'weekly', min_guild_level: 1, boss_id: 'shadow_colossus', sort_order: 10 },
      { id: 'shop_weekly_power_shadow', name: 'Shadow Power Token', description: 'Grants a raid damage boost against the Shadow Colossus for this week.', icon: 'zap', item_id: 'weekly_power_token', quantity: 1, token_cost: 250, max_purchases: 1, reset_period: 'weekly', min_guild_level: 2, boss_id: 'shadow_colossus', sort_order: 11 },
      { id: 'shop_thunder_essence_buy', name: 'Thunder Essence', description: 'Purchase extra Thunder Essence to craft Thunder God raid armor.', icon: 'zap', item_id: 'thunder_essence', quantity: 5, token_cost: 150, max_purchases: 5, reset_period: 'weekly', min_guild_level: 1, boss_id: 'thunder_god', sort_order: 10 },
      { id: 'shop_weekly_power_thunder', name: 'Thunder Power Token', description: 'Grants a raid damage boost against the Thunder God for this week.', icon: 'zap', item_id: 'weekly_power_token', quantity: 1, token_cost: 250, max_purchases: 1, reset_period: 'weekly', min_guild_level: 2, boss_id: 'thunder_god', sort_order: 11 },
    ];

    for (const item of [...staticItems, ...bossItems]) {
      await db.execute(sql`
        INSERT INTO raid_shop_items (id, name, description, icon, item_id, quantity, token_cost, max_purchases, reset_period, min_guild_level, boss_id, is_active, sort_order)
        VALUES (${item.id}, ${item.name}, ${item.description}, ${item.icon}, ${item.item_id}, ${item.quantity}, ${item.token_cost}, ${item.max_purchases}, ${item.reset_period}, ${item.min_guild_level}, ${item.boss_id}, 1, ${item.sort_order})
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, description = EXCLUDED.description, item_id = EXCLUDED.item_id,
          token_cost = EXCLUDED.token_cost, max_purchases = EXCLUDED.max_purchases,
          boss_id = EXCLUDED.boss_id, sort_order = EXCLUDED.sort_order
      `);
    }
    console.log("[RaidShop] Shop items seeded successfully");
  }

  async getForgeRecipes(): Promise<any[]> {
    const result = await db.execute(sql`SELECT * FROM raid_forge_recipes WHERE is_active = 1 ORDER BY sort_order`);
    return result.rows as any[];
  }

  async craftForgeItem(playerId: string, recipeId: string): Promise<{ success: boolean; error?: string; item?: any; rarity?: string }> {
    const recipeResult = await db.execute(sql`SELECT * FROM raid_forge_recipes WHERE id = ${recipeId} AND is_active = 1`);
    const recipe = recipeResult.rows[0] as any;
    if (!recipe) return { success: false, error: 'Recipe not found' };

    const player = await this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const inventory = (player.inventory as Record<string, number>) || {};
    const requiredType = recipe.required_essence_type;
    const requiredAmount = recipe.required_essence_amount;

    if (requiredType === 'any_essence') {
      // Enhancement stone: consume from any single essence type (pick the one with most)
      const essenceTypes = ['infernal_essence', 'frost_essence', 'shadow_essence', 'thunder_essence'];
      let bestEssence: string | null = null;
      let bestAmount = 0;
      for (const et of essenceTypes) {
        const qty = inventory[et] || 0;
        if (qty >= requiredAmount && qty > bestAmount) {
          bestEssence = et;
          bestAmount = qty;
        }
      }
      if (!bestEssence) return { success: false, error: `Need ${requiredAmount} of any single essence type` };

      const newInventory = { ...inventory };
      newInventory[bestEssence] = (newInventory[bestEssence] || 0) - requiredAmount;
      if (newInventory[bestEssence] <= 0) delete newInventory[bestEssence];
      newInventory[recipe.result_item_id] = (newInventory[recipe.result_item_id] || 0) + 1;

      const rarity = this.rollCraftRarity();
      const resultItem = await this.getGameItem(recipe.result_item_id);
      await db.execute(sql`
        UPDATE players SET
          inventory = ${JSON.stringify(newInventory)}::jsonb,
          "itemModifications" = jsonb_set(COALESCE("itemModifications", '{}'), ARRAY[${recipe.result_item_id}]::text[], ${JSON.stringify({ craftedRarity: rarity })}::jsonb),
          "lastSaved" = NOW()
        WHERE id = ${playerId}
      `);
      return { success: true, item: resultItem, rarity };
    } else {
      const currentAmount = inventory[requiredType] || 0;
      if (currentAmount < requiredAmount) {
        return { success: false, error: `Need ${requiredAmount - currentAmount} more ${requiredType.replace(/_/g, ' ')}` };
      }

      const newInventory = { ...inventory };
      newInventory[requiredType] = currentAmount - requiredAmount;
      if (newInventory[requiredType] <= 0) delete newInventory[requiredType];
      newInventory[recipe.result_item_id] = (newInventory[recipe.result_item_id] || 0) + 1;

      const rarity = this.rollCraftRarity();
      const resultItem = await this.getGameItem(recipe.result_item_id);
      await db.execute(sql`
        UPDATE players SET
          inventory = ${JSON.stringify(newInventory)}::jsonb,
          "itemModifications" = jsonb_set(COALESCE("itemModifications", '{}'), ARRAY[${recipe.result_item_id}]::text[], ${JSON.stringify({ craftedRarity: rarity })}::jsonb),
          "lastSaved" = NOW()
        WHERE id = ${playerId}
      `);
      return { success: true, item: resultItem, rarity };
    }
  }

  private rollCraftRarity(): string {
    const roll = Math.random() * 100;
    if (roll < 45) return 'Uncommon';
    if (roll < 78) return 'Rare';
    if (roll < 95) return 'Epic';
    return 'Legendary';
  }

  async openBossChest(playerId: string, chestItemId: string): Promise<{ success: boolean; error?: string; rewards?: any[] }> {
    const validChests: Record<string, string> = {
      infernal_boss_chest: 'infernal_essence',
      frost_boss_chest: 'frost_essence',
      shadow_boss_chest: 'shadow_essence',
      thunder_boss_chest: 'thunder_essence',
    };
    const essenceType = validChests[chestItemId];
    if (!essenceType) return { success: false, error: 'Invalid chest type' };

    const player = await this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const inventory = (player.inventory as Record<string, number>) || {};
    const chestQty = inventory[chestItemId] || 0;
    if (chestQty < 1) return { success: false, error: 'Chest not found in inventory' };

    // Remove the chest
    const newInventory = { ...inventory };
    newInventory[chestItemId] = chestQty - 1;
    if (newInventory[chestItemId] <= 0) delete newInventory[chestItemId];

    // Roll rewards
    const rewards: any[] = [];

    // Guaranteed: 3-5 essences
    const essenceQty = Math.floor(Math.random() * 3) + 3;
    rewards.push({ id: essenceType, quantity: essenceQty });
    newInventory[essenceType] = (newInventory[essenceType] || 0) + essenceQty;

    // 25% chance: random Raidbreaker piece
    if (Math.random() < 0.25) {
      const raidbreakerPieces = ['raidbreaker_helm', 'raidbreaker_armor'];
      const piece = raidbreakerPieces[Math.floor(Math.random() * raidbreakerPieces.length)];
      rewards.push({ id: piece, quantity: 1 });
      newInventory[piece] = (newInventory[piece] || 0) + 1;
    }

    // 10% chance: Raidbreaker Enhancement Stone
    if (Math.random() < 0.10) {
      rewards.push({ id: 'raidbreaker_enhancement_stone', quantity: 1 });
      newInventory['raidbreaker_enhancement_stone'] = (newInventory['raidbreaker_enhancement_stone'] || 0) + 1;
    }

    // 5% chance: Raid Set piece matching the boss slot (with rarity stored separately)
    let rarityReward: { itemId: string; rarity: string } | null = null;
    if (Math.random() < 0.05) {
      const bossSetMap: Record<string, string[]> = {
        infernal_boss_chest: ['raid_plate_helm', 'raid_leather_hood', 'raid_cloth_hat'],
        frost_boss_chest: ['raid_plate_body', 'raid_leather_vest', 'raid_cloth_robe'],
        shadow_boss_chest: ['raid_plate_legs', 'raid_leather_pants', 'raid_cloth_skirt'],
        thunder_boss_chest: ['raid_plate_boots', 'raid_leather_boots', 'raid_cloth_sandals'],
      };
      const options = bossSetMap[chestItemId] || [];
      if (options.length > 0) {
        const piece = options[Math.floor(Math.random() * options.length)];
        const rarity = this.rollCraftRarity();
        rewards.push({ id: piece, quantity: 1, craftedRarity: rarity });
        newInventory[piece] = (newInventory[piece] || 0) + 1;
        rarityReward = { itemId: piece, rarity };
      }
    }

    // 1% chance: Forge Core
    if (Math.random() < 0.01) {
      rewards.push({ id: 'forge_core', quantity: 1 });
      newInventory['forge_core'] = (newInventory['forge_core'] || 0) + 1;
    }

    await this.updatePlayer(playerId, { inventory: newInventory });

    // Store rarity for raid set piece if awarded
    if (rarityReward) {
      await db.execute(sql`
        UPDATE players SET
          "itemModifications" = jsonb_set(COALESCE("itemModifications", '{}'), ARRAY[${rarityReward.itemId}]::text[], ${JSON.stringify({ craftedRarity: rarityReward.rarity })}::jsonb)
        WHERE id = ${playerId}
      `);
    }

    return { success: true, rewards };
  }

  async getShopItemsForCurrentBoss(currentBossId: string | null): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT * FROM raid_shop_items 
      WHERE is_active = 1 AND (boss_id IS NULL OR boss_id = ${currentBossId})
      ORDER BY sort_order
    `);
    return result.rows as any[];
  }

  async awardWeeklyParticipationChests(): Promise<{ awarded: number; errors: string[] }> {
    let awarded = 0;
    const errors: string[] = [];
    try {
      // Find completed raids from the past week that haven't had their chests awarded
      const raids = await db.execute(sql`
        SELECT gr.*, rb.id as boss_id
        FROM guild_raids gr
        JOIN raid_bosses rb ON gr.boss_id = rb.id
        WHERE gr.status = 'completed'
          AND gr.completed_at > NOW() - INTERVAL '8 days'
      `);

      for (const raid of raids.rows as any[]) {
        const participants = await db.execute(sql`
          SELECT * FROM raid_participation 
          WHERE raid_id = ${raid.id} AND weekly_chest_awarded = 0
        `);

        const bossMaxHp = raid.max_hp || 500000;
        const BOSS_CHEST_MAP: Record<string, string> = {
          infernal_titan: 'infernal_boss_chest',
          frost_wyrm: 'frost_boss_chest',
          shadow_colossus: 'shadow_boss_chest',
          thunder_god: 'thunder_boss_chest',
        };
        const chestItem = BOSS_CHEST_MAP[raid.boss_id] || `${raid.boss_id}_boss_chest`;

        for (const p of participants.rows as any[]) {
          const damagePercent = (p.total_damage / bossMaxHp) * 100;
          const qualified = damagePercent >= 0.05 || (p.days_participated || 0) >= 3;

          if (qualified) {
            const player = await this.getPlayer(p.player_id);
            if (!player) continue;
            const inventory = (player.inventory as Record<string, number>) || {};
            const newInventory = { ...inventory };
            newInventory[chestItem] = (newInventory[chestItem] || 0) + 1;
            await this.updatePlayer(p.player_id, { inventory: newInventory });
            awarded++;
          }

          await db.execute(sql`
            UPDATE raid_participation SET weekly_chest_awarded = 1 WHERE id = ${p.id}
          `);
        }
      }
    } catch (e: any) {
      errors.push(e.message);
    }
    return { awarded, errors };
  }

  private async seedRaidForgeRecipes(): Promise<void> {
    const recipes = [
      { id: 'forge_raid_plate_helm', name: 'Raid Plate Helm', description: 'Forge a Raid Plate Helm from Infernal Essence.', result_item_id: 'raid_plate_helm', result_armor_type: 'plate', result_slot: 'helmet', boss_id: 'infernal_titan', required_essence_type: 'infernal_essence', required_essence_amount: 30, icon: 'helmet', sort_order: 1 },
      { id: 'forge_raid_leather_hood', name: 'Raid Leather Hood', description: 'Forge a Raid Leather Hood from Infernal Essence.', result_item_id: 'raid_leather_hood', result_armor_type: 'leather', result_slot: 'helmet', boss_id: 'infernal_titan', required_essence_type: 'infernal_essence', required_essence_amount: 30, icon: 'helmet', sort_order: 2 },
      { id: 'forge_raid_cloth_hat', name: 'Raid Cloth Hat', description: 'Forge a Raid Cloth Hat from Infernal Essence.', result_item_id: 'raid_cloth_hat', result_armor_type: 'cloth', result_slot: 'helmet', boss_id: 'infernal_titan', required_essence_type: 'infernal_essence', required_essence_amount: 30, icon: 'helmet', sort_order: 3 },
      { id: 'forge_raid_plate_body', name: 'Raid Plate Body', description: 'Forge a Raid Plate Body from Frost Essence.', result_item_id: 'raid_plate_body', result_armor_type: 'plate', result_slot: 'body', boss_id: 'frost_wyrm', required_essence_type: 'frost_essence', required_essence_amount: 30, icon: 'armor', sort_order: 4 },
      { id: 'forge_raid_leather_vest', name: 'Raid Leather Vest', description: 'Forge a Raid Leather Vest from Frost Essence.', result_item_id: 'raid_leather_vest', result_armor_type: 'leather', result_slot: 'body', boss_id: 'frost_wyrm', required_essence_type: 'frost_essence', required_essence_amount: 30, icon: 'armor', sort_order: 5 },
      { id: 'forge_raid_cloth_robe', name: 'Raid Cloth Robe', description: 'Forge a Raid Cloth Robe from Frost Essence.', result_item_id: 'raid_cloth_robe', result_armor_type: 'cloth', result_slot: 'body', boss_id: 'frost_wyrm', required_essence_type: 'frost_essence', required_essence_amount: 30, icon: 'armor', sort_order: 6 },
      { id: 'forge_raid_plate_legs', name: 'Raid Plate Legs', description: 'Forge Raid Plate Legs from Shadow Essence.', result_item_id: 'raid_plate_legs', result_armor_type: 'plate', result_slot: 'legs', boss_id: 'shadow_colossus', required_essence_type: 'shadow_essence', required_essence_amount: 30, icon: 'pants', sort_order: 7 },
      { id: 'forge_raid_leather_pants', name: 'Raid Leather Pants', description: 'Forge Raid Leather Pants from Shadow Essence.', result_item_id: 'raid_leather_pants', result_armor_type: 'leather', result_slot: 'legs', boss_id: 'shadow_colossus', required_essence_type: 'shadow_essence', required_essence_amount: 30, icon: 'pants', sort_order: 8 },
      { id: 'forge_raid_cloth_skirt', name: 'Raid Cloth Skirt', description: 'Forge a Raid Cloth Skirt from Shadow Essence.', result_item_id: 'raid_cloth_skirt', result_armor_type: 'cloth', result_slot: 'legs', boss_id: 'shadow_colossus', required_essence_type: 'shadow_essence', required_essence_amount: 30, icon: 'pants', sort_order: 9 },
      { id: 'forge_raid_plate_boots', name: 'Raid Plate Boots', description: 'Forge Raid Plate Boots from Thunder Essence.', result_item_id: 'raid_plate_boots', result_armor_type: 'plate', result_slot: 'boots', boss_id: 'thunder_god', required_essence_type: 'thunder_essence', required_essence_amount: 30, icon: 'boot', sort_order: 10 },
      { id: 'forge_raid_leather_boots', name: 'Raid Leather Boots', description: 'Forge Raid Leather Boots from Thunder Essence.', result_item_id: 'raid_leather_boots', result_armor_type: 'leather', result_slot: 'boots', boss_id: 'thunder_god', required_essence_type: 'thunder_essence', required_essence_amount: 30, icon: 'boot', sort_order: 11 },
      { id: 'forge_raid_cloth_sandals', name: 'Raid Cloth Sandals', description: 'Forge Raid Cloth Sandals from Thunder Essence.', result_item_id: 'raid_cloth_sandals', result_armor_type: 'cloth', result_slot: 'boots', boss_id: 'thunder_god', required_essence_type: 'thunder_essence', required_essence_amount: 30, icon: 'boot', sort_order: 12 },
      { id: 'forge_enhancement_stone', name: 'Enhancement Stone', description: 'Convert 25 essences into a Raidbreaker Enhancement Stone.', result_item_id: 'raidbreaker_enhancement_stone', result_armor_type: 'material', result_slot: 'material', boss_id: 'any', required_essence_type: 'any_essence', required_essence_amount: 25, icon: 'gem', sort_order: 99 },
    ];
    for (const r of recipes) {
      await db.execute(sql`
        INSERT INTO raid_forge_recipes (id, name, description, result_item_id, result_armor_type, result_slot, boss_id, required_essence_type, required_essence_amount, icon, sort_order, is_active)
        VALUES (${r.id}, ${r.name}, ${r.description}, ${r.result_item_id}, ${r.result_armor_type}, ${r.result_slot}, ${r.boss_id}, ${r.required_essence_type}, ${r.required_essence_amount}, ${r.icon}, ${r.sort_order}, 1)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, result_item_id = EXCLUDED.result_item_id
      `);
    }
    console.log('[Seed] Raid forge recipes seeded');
  }

  async purchaseRaidShopItem(playerId: string, shopItemId: string): Promise<{ success: boolean; error?: string; item?: any }> {
    const itemResult = await db.execute(sql`SELECT * FROM raid_shop_items WHERE id = ${shopItemId}`);
    const item = itemResult.rows[0] as any;
    if (!item) return { success: false, error: 'Item not found' };
    
    const purchaseResult = await db.execute(sql`
      SELECT * FROM raid_shop_purchases WHERE player_id = ${playerId} AND shop_item_id = ${shopItemId}
    `);
    const purchase = purchaseResult.rows[0] as any;
    
    if (item.max_purchases && purchase && purchase.purchase_count >= item.max_purchases) {
      return { success: false, error: 'Purchase limit reached' };
    }
    
    const spendResult = await this.spendRaidTokens(playerId, item.token_cost);
    if (!spendResult.success) return spendResult;
    
    if (purchase) {
      await db.execute(sql`
        UPDATE raid_shop_purchases SET purchase_count = purchase_count + 1, last_purchase_at = NOW()
        WHERE player_id = ${playerId} AND shop_item_id = ${shopItemId}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO raid_shop_purchases (player_id, shop_item_id, purchase_count) VALUES (${playerId}, ${shopItemId}, 1)
      `);
    }
    
    return { success: true, item };
  }

  async getPlayerShopPurchases(playerId: string): Promise<any[]> {
    const result = await db.execute(sql`SELECT * FROM raid_shop_purchases WHERE player_id = ${playerId}`);
    return result.rows as any[];
  }

  async getGuildActivityPoints(guildId: string): Promise<{ current: number; total: number }> {
    const result = await db.execute(sql`SELECT * FROM guild_activity_points WHERE guild_id = ${guildId}`);
    if (result.rows.length === 0) return { current: 0, total: 0 };
    const row = result.rows[0] as any;
    return { current: row.current_points, total: row.total_points_earned };
  }

  async addGuildActivityPoints(guildId: string, points: number): Promise<any> {
    const result = await db.execute(sql`
      INSERT INTO guild_activity_points (guild_id, current_points, total_points_earned)
      VALUES (${guildId}, ${points}, ${points})
      ON CONFLICT (guild_id) DO UPDATE SET 
        current_points = guild_activity_points.current_points + ${points},
        total_points_earned = guild_activity_points.total_points_earned + ${points},
        updated_at = NOW()
      RETURNING *
    `);
    return result.rows[0];
  }

  async spendGuildActivityPoints(guildId: string, points: number): Promise<{ success: boolean; error?: string }> {
    const activityPoints = await this.getGuildActivityPoints(guildId);
    if (activityPoints.current < points) return { success: false, error: 'Insufficient activity points' };
    
    await db.execute(sql`
      UPDATE guild_activity_points SET current_points = current_points - ${points}, updated_at = NOW()
      WHERE guild_id = ${guildId}
    `);
    return { success: true };
  }


  // Admin player management operations
  async getAllPlayersForAdmin(): Promise<{ id: string; username: string; email: string | null; totalLevel: number; gold: number; lastSaved: Date | null; lastSeen: Date | null }[]> {
    const result = await db.select({
      id: players.id,
      username: players.username,
      email: players.email,
      totalLevel: players.totalLevel,
      gold: players.gold,
      lastSaved: players.lastSaved,
      lastSeen: players.lastSeen,
    }).from(players).orderBy(desc(players.lastSeen));
    return result;
  }

  async deletePlayerCompletely(playerId: string): Promise<boolean> {
    try {
      return await db.transaction(async (tx) => {
        // Delete trades (sender or receiver)
        await tx.delete(trades).where(
          sql`${trades.senderId} = ${playerId} OR ${trades.receiverId} = ${playerId}`
        );
        
        // Delete raid shop purchases
        await tx.delete(raidShopPurchases).where(eq(raidShopPurchases.playerId, playerId));
        
        // Delete raid tokens
        await tx.delete(raidTokens).where(eq(raidTokens.playerId, playerId));
        
        // Delete raid participation
        await tx.delete(raidParticipation).where(eq(raidParticipation.playerId, playerId));
        
        // Nullify startedBy in guild raids where this player started the raid
        await tx.update(guildRaids)
          .set({ startedBy: null })
          .where(eq(guildRaids.startedBy, playerId));
        
        // Remove from guild if member
        await tx.delete(guildMembers).where(eq(guildMembers.playerId, playerId));
        
        // Nullify respondedBy in guild join requests where this player responded
        await tx.update(guildJoinRequests)
          .set({ respondedBy: null })
          .where(eq(guildJoinRequests.respondedBy, playerId));
        
        // Delete guild join requests made by this player
        await tx.delete(guildJoinRequests).where(eq(guildJoinRequests.playerId, playerId));
        
        // Delete guild invites (as target or inviter)
        await tx.delete(guildInvites).where(
          sql`${guildInvites.targetPlayerId} = ${playerId} OR ${guildInvites.inviterId} = ${playerId}`
        );
        
        // Delete notifications
        await tx.delete(notifications).where(eq(notifications.playerId, playerId));
        
        // Delete market listings
        await tx.delete(marketListings).where(eq(marketListings.sellerId, playerId));
        
        // Delete push subscriptions
        await tx.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.playerId, playerId));
        
        // Delete player badges
        await tx.delete(playerBadges).where(eq(playerBadges.playerId, playerId));
        
        // Finally delete the player
        const result = await tx.delete(players).where(eq(players.id, playerId)).returning();
        return result.length > 0;
      });
    } catch (error) {
      console.error('Error deleting player completely:', error);
      return false;
    }
  }

  async seedRaidBosses(): Promise<void> {
    console.log('[Seed] Upserting raid bosses...');
    
    const bosses = [
      {
        id: 'infernal_titan',
        name: 'Infernal Titan',
        description: 'A colossal demon lord from the depths of the Abyss. Its flames burn with the heat of a thousand suns.',
        icon: 'flame',
        icon_path: 'attached_assets/generated_images/infernal_titan_demon_boss.webp',
        base_hp: 500000,
        attack_level: 150,
        strength_level: 180,
        defence_level: 120,
        attack_speed: 3500,
        skills: JSON.stringify([
          { id: 'hellfire_blast', name: 'Hellfire Blast', type: 'aoe', chance: 0.15, damage: 500, description: 'Engulfs all attackers in hellfire' },
          { id: 'molten_rage', name: 'Molten Rage', type: 'buff', chance: 0.1, effect: 'strength', value: 50, duration: 30000, description: 'Enters a rage state, increasing damage' }
        ]),
        loot: JSON.stringify([
          { itemId: 'infernal_essence', chance: 0.10, minQty: 1, maxQty: 3 }
        ]),
        milestone_rewards: JSON.stringify({
          '75': { raidTokens: 10, guildCoins: 500 },
          '50': { raidTokens: 25, guildCoins: 1000, items: [{ itemId: 'Rare Material Chest', qty: 1 }] },
          '25': { raidTokens: 50, guildCoins: 2000, items: [{ itemId: 'Epic Gear Chest', qty: 1 }] },
          '0': { raidTokens: 100, guildCoins: 5000, items: [{ itemId: 'Legendary Chest', qty: 1 }] }
        }),
        token_reward: 100,
        rotation_week: 1,
        is_premium: 0,
        premium_activity_cost: 0
      },
      {
        id: 'frost_wyrm',
        name: 'Frost Wyrm',
        description: 'An ancient dragon of eternal winter. Its breath can freeze the very soul.',
        icon: 'snowflake',
        icon_path: 'attached_assets/generated_images/frost_wyrm_ice_dragon_boss.webp',
        base_hp: 600000,
        attack_level: 140,
        strength_level: 160,
        defence_level: 150,
        attack_speed: 4000,
        skills: JSON.stringify([
          { id: 'blizzard', name: 'Blizzard', type: 'debuff', chance: 0.12, effect: 'slow', value: 30, duration: 20000, description: 'Slows all attackers with freezing winds' },
          { id: 'ice_tomb', name: 'Ice Tomb', type: 'stun', chance: 0.08, duration: 5000, description: 'Encases a random attacker in ice' }
        ]),
        loot: JSON.stringify([
          { itemId: 'frost_essence', chance: 0.10, minQty: 1, maxQty: 3 }
        ]),
        milestone_rewards: JSON.stringify({
          '75': { raidTokens: 12, guildCoins: 600 },
          '50': { raidTokens: 30, guildCoins: 1200, items: [{ itemId: 'Rare Material Chest', qty: 1 }] },
          '25': { raidTokens: 60, guildCoins: 2500, items: [{ itemId: 'Epic Gear Chest', qty: 1 }] },
          '0': { raidTokens: 120, guildCoins: 6000, items: [{ itemId: 'Legendary Chest', qty: 1 }] }
        }),
        token_reward: 120,
        rotation_week: 2,
        is_premium: 0,
        premium_activity_cost: 0
      },
      {
        id: 'shadow_colossus',
        name: 'Shadow Colossus',
        description: 'A being of pure darkness that consumes all light. None have seen its true form and lived.',
        icon: 'moon',
        icon_path: 'attached_assets/generated_images/shadow_colossus_void_boss.webp',
        base_hp: 750000,
        attack_level: 160,
        strength_level: 200,
        defence_level: 100,
        attack_speed: 3000,
        skills: JSON.stringify([
          { id: 'void_drain', name: 'Void Drain', type: 'lifesteal', chance: 0.1, value: 20, description: 'Drains life from all attackers' },
          { id: 'dark_veil', name: 'Dark Veil', type: 'evasion', chance: 0.15, value: 50, duration: 15000, description: 'Becomes nearly impossible to hit' }
        ]),
        loot: JSON.stringify([
          { itemId: 'shadow_essence', chance: 0.10, minQty: 1, maxQty: 3 }
        ]),
        milestone_rewards: JSON.stringify({
          '75': { raidTokens: 15, guildCoins: 700 },
          '50': { raidTokens: 35, guildCoins: 1500, items: [{ itemId: 'Rare Material Chest', qty: 1 }] },
          '25': { raidTokens: 70, guildCoins: 3000, items: [{ itemId: 'Epic Gear Chest', qty: 1 }] },
          '0': { raidTokens: 150, guildCoins: 7500, items: [{ itemId: 'Legendary Chest', qty: 1 }] }
        }),
        token_reward: 150,
        rotation_week: 3,
        is_premium: 0,
        premium_activity_cost: 0
      },
      {
        id: 'thunder_god',
        name: 'Thunder God',
        description: 'An ancient deity of storms. Each step brings thunder, each strike brings lightning.',
        icon: 'zap',
        icon_path: 'attached_assets/generated_images/thunder_god_storm_deity_boss.webp',
        base_hp: 900000,
        attack_level: 180,
        strength_level: 220,
        defence_level: 140,
        attack_speed: 2500,
        skills: JSON.stringify([
          { id: 'chain_lightning', name: 'Chain Lightning', type: 'chain', chance: 0.2, damage: 300, jumps: 5, description: 'Lightning that jumps between attackers' },
          { id: 'storm_call', name: 'Storm Call', type: 'aoe', chance: 0.1, damage: 800, description: 'Calls down a devastating lightning storm' }
        ]),
        loot: JSON.stringify([
          { itemId: 'thunder_essence', chance: 0.10, minQty: 1, maxQty: 3 }
        ]),
        milestone_rewards: JSON.stringify({
          '75': { raidTokens: 18, guildCoins: 800 },
          '50': { raidTokens: 40, guildCoins: 1800, items: [{ itemId: 'Rare Material Chest', qty: 1 }] },
          '25': { raidTokens: 80, guildCoins: 3500, items: [{ itemId: 'Epic Gear Chest', qty: 2 }] },
          '0': { raidTokens: 180, guildCoins: 9000, items: [{ itemId: 'Legendary Chest', qty: 1 }, { itemId: 'Thunder God Fragment', qty: 1 }] }
        }),
        token_reward: 180,
        rotation_week: 4,
        is_premium: 0,
        premium_activity_cost: 0
      },
      {
        id: 'void_emperor',
        name: 'Void Emperor',
        description: 'The supreme ruler of the void realm. Its power transcends mortal understanding.',
        icon: 'skull',
        icon_path: 'attached_assets/generated_images/void_emperor_cosmic_boss.webp',
        base_hp: 1250000,
        attack_level: 200,
        strength_level: 250,
        defence_level: 180,
        attack_speed: 2000,
        skills: JSON.stringify([
          { id: 'reality_tear', name: 'Reality Tear', type: 'execute', chance: 0.05, threshold: 20, description: 'Instantly defeats attackers below 20% HP' },
          { id: 'void_storm', name: 'Void Storm', type: 'aoe', chance: 0.15, damage: 1000, description: 'Unleashes devastating void energy' },
          { id: 'emperor_wrath', name: "Emperor's Wrath", type: 'enrage', chance: 0.1, value: 100, duration: 60000, description: 'Doubles all damage when below 25% HP' }
        ]),
        loot: JSON.stringify([
          { itemId: 'Void Emperor Core', chance: 0.02, minQty: 1, maxQty: 1 },
          { itemId: 'Emperor Fragment', chance: 0.08, minQty: 1, maxQty: 1 },
          { itemId: 'Void Essence', chance: 0.15, minQty: 3, maxQty: 5 },
          { itemId: 'Mythic Gear Box', chance: 0.01, minQty: 1, maxQty: 1 }
        ]),
        milestone_rewards: JSON.stringify({
          '75': { raidTokens: 25, guildCoins: 1000 },
          '50': { raidTokens: 60, guildCoins: 2500, items: [{ itemId: 'Epic Gear Chest', qty: 1 }] },
          '25': { raidTokens: 100, guildCoins: 5000, items: [{ itemId: 'Legendary Chest', qty: 1 }] },
          '0': { raidTokens: 300, guildCoins: 15000, items: [{ itemId: 'Mythic Chest', qty: 1 }, { itemId: 'Void Emperor Trophy', qty: 1 }] }
        }),
        token_reward: 300,
        rotation_week: 0,
        is_premium: 1,
        premium_activity_cost: 5000
      }
    ];
    
    for (const boss of bosses) {
      await db.execute(sql`
        INSERT INTO raid_bosses (id, name, description, icon, icon_path, base_hp, attack_level, strength_level, defence_level, attack_speed, skills, loot, milestone_rewards, token_reward, rotation_week, is_premium, premium_activity_cost)
        VALUES (${boss.id}, ${boss.name}, ${boss.description}, ${boss.icon}, ${boss.icon_path}, ${boss.base_hp}, ${boss.attack_level}, ${boss.strength_level}, ${boss.defence_level}, ${boss.attack_speed}, ${boss.skills}::jsonb, ${boss.loot}::jsonb, ${boss.milestone_rewards}::jsonb, ${boss.token_reward}, ${boss.rotation_week}, ${boss.is_premium}, ${boss.premium_activity_cost})
        ON CONFLICT (id) DO UPDATE SET
          loot = EXCLUDED.loot,
          skills = EXCLUDED.skills,
          milestone_rewards = EXCLUDED.milestone_rewards,
          base_hp = EXCLUDED.base_hp,
          attack_level = EXCLUDED.attack_level,
          strength_level = EXCLUDED.strength_level,
          defence_level = EXCLUDED.defence_level,
          attack_speed = EXCLUDED.attack_speed,
          token_reward = EXCLUDED.token_reward,
          icon_path = EXCLUDED.icon_path
      `);
    }
    
    console.log('[Seed] Raid bosses seeded successfully');
  }

  async logSuspiciousActivity(playerId: string, playerUsername: string, type: string, details: any, severity: string = 'medium'): Promise<SuspiciousActivity> {
    const [activity] = await db.insert(suspiciousActivities).values({
      playerId,
      playerUsername,
      type,
      details,
      severity,
    }).returning();
    return activity;
  }

  async getSuspiciousActivities(limit: number = 100, unreviewedOnly: boolean = false): Promise<SuspiciousActivity[]> {
    if (unreviewedOnly) {
      return db.select().from(suspiciousActivities)
        .where(eq(suspiciousActivities.reviewed, 0))
        .orderBy(desc(suspiciousActivities.createdAt))
        .limit(limit);
    }
    return db.select().from(suspiciousActivities)
      .orderBy(desc(suspiciousActivities.createdAt))
      .limit(limit);
  }

  async markActivityReviewed(activityId: string): Promise<void> {
    await db.update(suspiciousActivities)
      .set({ reviewed: 1 })
      .where(eq(suspiciousActivities.id, activityId));
  }

  async banPlayer(playerId: string, reason: string): Promise<Player | undefined> {
    const [player] = await db.update(players)
      .set({ isBanned: 1, banReason: reason, bannedAt: new Date() })
      .where(eq(players.id, playerId))
      .returning();
    if (player?.email) {
      await this.addBannedEmail(player.email, player.username, reason);
    }
    return player;
  }

  async unbanPlayer(playerId: string): Promise<Player | undefined> {
    const player = await this.getPlayer(playerId);
    if (!player) return undefined;
    if (player.email) {
      await this.removeBannedEmail(player.email);
    }
    const [updated] = await db.update(players)
      .set({ isBanned: 0, banReason: null, bannedAt: null })
      .where(eq(players.id, playerId))
      .returning();
    return updated;
  }

  async addBannedEmail(email: string, playerUsername: string | null, reason: string | null): Promise<BannedEmail> {
    const [entry] = await db.insert(bannedEmails).values({
      email,
      playerUsername,
      reason,
    }).onConflictDoNothing().returning();
    if (!entry) {
      const [existing] = await db.select().from(bannedEmails).where(eq(bannedEmails.email, email));
      return existing;
    }
    return entry;
  }

  async removeBannedEmail(email: string): Promise<boolean> {
    const result = await db.delete(bannedEmails).where(eq(bannedEmails.email, email));
    return true;
  }

  async isEmailBanned(email: string): Promise<boolean> {
    const [entry] = await db.select().from(bannedEmails).where(eq(bannedEmails.email, email)).limit(1);
    return !!entry;
  }

  async getAllBannedEmails(): Promise<BannedEmail[]> {
    return db.select().from(bannedEmails).orderBy(desc(bannedEmails.bannedAt));
  }

  // Achievement operations
  async getAllAchievements(): Promise<Achievement[]> {
    return db.select().from(achievements).orderBy(achievements.sortOrder);
  }

  async getAchievement(id: string): Promise<Achievement | undefined> {
    const [a] = await db.select().from(achievements).where(eq(achievements.id, id));
    return a;
  }

  async createAchievement(achievement: InsertAchievement): Promise<Achievement> {
    const [created] = await db.insert(achievements).values(achievement).returning();
    return created;
  }

  async updateAchievement(id: string, updates: Partial<InsertAchievement>): Promise<Achievement | undefined> {
    const [updated] = await db.update(achievements).set(updates).where(eq(achievements.id, id)).returning();
    return updated;
  }

  async deleteAchievement(id: string): Promise<boolean> {
    await db.delete(playerAchievements).where(eq(playerAchievements.achievementId, id));
    await db.delete(achievements).where(eq(achievements.id, id));
    return true;
  }

  async bulkCreateAchievements(achList: InsertAchievement[]): Promise<number> {
    if (achList.length === 0) return 0;
    const batchSize = 50;
    let count = 0;
    for (let i = 0; i < achList.length; i += batchSize) {
      const batch = achList.slice(i, i + batchSize);
      await db.insert(achievements).values(batch).onConflictDoNothing();
      count += batch.length;
    }
    return count;
  }

  async getPlayerAchievements(playerId: string): Promise<PlayerAchievement[]> {
    return db.select().from(playerAchievements).where(eq(playerAchievements.playerId, playerId));
  }

  async upsertPlayerAchievement(playerId: string, achievementId: string, progress: number, completedTiers: number[]): Promise<PlayerAchievement> {
    const [existing] = await db.select().from(playerAchievements)
      .where(and(eq(playerAchievements.playerId, playerId), eq(playerAchievements.achievementId, achievementId)));

    if (existing) {
      const [updated] = await db.update(playerAchievements)
        .set({ progress, completedTiers: completedTiers as any, lastUpdated: new Date() })
        .where(eq(playerAchievements.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(playerAchievements)
        .values({ playerId, achievementId, progress, completedTiers: completedTiers as any })
        .returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
