# IdleThrone - Idle RPG

## Overview
IdleThrone is an idle RPG web game set in a dark fantasy world, emphasizing automated skill training, experience gain, and persistent progress. It features a robust combat system, a comprehensive guild system, and extensive offline progression, aiming to deliver a rich, engaging, and high-performance experience across multiple platforms. The monetization strategy focuses on "not pay-to-win" enhancements like premium memberships, battle passes, and one-time purchases that improve comfort and speed without granting direct power advantages.

## User Preferences
Preferred communication style: Simple, everyday language.
**Debug Environment**: User runs in PRODUCTION build, never check dev logs for debugging.
**Debugging Approach**: Use code analysis only, not log inspection.
**UI Text Rule**: NEVER show underscored IDs (like `normal_logs`) to users. Always use `translateItemName(itemId, language)` or `formatItemIdAsName(itemId)` from `@/lib/items` to display proper names (like "Normal Logs"). This applies to ALL user-facing text: item names, notifications, toasts, tooltips, dialogs, push notifications, and combat logs.

## System Architecture

### Frontend
- **Technology Stack**: React 18 with TypeScript, Wouter for routing, React Context for global state, and TanStack Query for server state.
- **UI/UX**: Utilizes shadcn/ui (based on Radix UI) and Tailwind CSS v4 with a dark fantasy theme. Supports 8 languages, features modular UI components, and employs a visual style of dark charcoal gray radial gradients, smooth stylized pixel art, and a 1:1 aspect ratio. Robust authentication safety measures are in place to handle 401 errors gracefully.

### Core Systems
- **State Management**: Game state (skills, inventory, gold, equipment, buffs, itemModifications) is synchronized between React state and refs. `itemModifications` is included in `saveToServer`, `sendBeacon`, visibility change sync, and `checkSession` sync. `saveVersionRef` counter prevents isDirtyRef race conditions during async saves.
- **Combat System**: Features a unified, deterministic combat engine with seeded RNG, monster skills/debuffs, equipment durability, and loss on death. Includes a dynamic buff system, canonical authority layer for stat resolution, and consistent application of core formulas. Implements 5 weapon-variety monster passive mechanics and `poison_immunity` buff mechanic. Combat engine generates `formulaString` in events for Advanced > Formulas combat log display.
- **Offline Progression**: Server-authoritative system uses a "Slot-Aware Fractional Carry System" and hybrid analytical+micro-simulation for offline combat, ensuring parity with online play. Robust mechanisms prevent unintended online state resurrection. Visibility change and checkSession sync handlers always apply server inventory/gold/firemakingSlots after offline processing to prevent item loss.
- **Progression & Resources**: Includes a Combat Style System, Crafting & Resource Management (salvaging, fragment-based crafting), and a Weapon Mastery system across 7 weapon types.
- **Potion System**: 63 potions across 7 regions with 10 effect types. Server-side `POTION_DATA`.
- **Equipment Tiers**: Bronze(1) through Dragon(drop-only), with Dragon set being boss-exclusive drops with stats ~10-15% above Void. Region armor sets (verdant, quarry, dunes, obsidian, frost, void) are rare monster drops (0.1-0.3% chance) balanced ~15-25% above best craftable at their level tier.
- **Automation**: Configurable auto-eat and auto-potion systems with offline parity.
- **Travel & Regions**: Players' `currentRegion` controls content access; travel is restricted during combat/tasks. An XP Scaling System prevents low-level content grinding.
- **Party System**: Supports party creation (up to 5 members), equipment-based auto-roles via sub-class system, combat mechanics, DB-driven bonuses, and loot distribution. Hardened with optimistic concurrency, transactional integrity, and a dedicated WebSocket Event Bus. Supports distinct "social" and "dungeon" party types. Includes ghost party prevention mechanisms and real-time party updates via WebSockets. Party finder shows all public parties globally.
- **Chat Item Sharing**: Albion-style item sharing in global chat with `[item:item_id]` or `[item:item_id#enhLevel]` format. ItemInspectPopup has Share button to queue items in chat.
- **Sub-Class System**: Equipment-based sub-class determination (21 unique sub-classes) with unique passive abilities.
- **Dungeon V2 System**: Re-engineered system supporting Solo (offline deterministic simulation) and Party (online-only) modes. Features a pure-function math engine for seeded RNG, batch floor resolution, threat calculation, and real loot tables. Includes 13 skill-based boss mechanics, party-exclusive loot, real-time party dungeon WS events, Dungeon Intermission Features, and an "Endless Mode."
- **Achievement System**: DB-driven with tier-based progression and "Achievement Milestone Buffs."
- **Weapon Enhancement System**: Dynamic success rates, visual indicators, and a player-wide pity system. Enhancement levels (+N) displayed on ProfilePage equipment panel and PartyMemberDetailDialog popup. Uses `itemModifications` from `toPublicProfile()` API for other players. `equipItem` accepts optional `targetSlot` to prevent dual-dagger redirect when swapping from EquipmentPanel. Two-handed weapons (`staff`, `bow`, `2h_sword`, `2h_axe`, `2h_warhammer`) block off-hand slot; equipping non-dagger weapon auto-unequips off-hand daggers. Orphan off-hand daggers are excluded from stat/lifesteal calculations on both client and server.
- **Item Image Resolution**: `getItemImage` handles both space-ID ("Iron Shield") and underscore-ID ("iron_shield") formats via bidirectional conversion (space↔underscore, title-casing). ITEM_IMAGES checked first, then DB icon path, then placeholder.
- **Daily Systems**: Daily Login Rewards and Daily Quests with tier-based difficulty.
- **NPC Shop System**: Regional shops with unique inventory and daily stock resets.
- **Trade System**: Real-time WebSocket-based player-to-player trading with atomic item transfer (including enhancement data, weapon enhancements, and durability). Server bumps `dataVersion` on trade completion; client auto-save handles 409 conflicts by reloading from server. Validates cursed items and damaged equipment (durability < 100%) at both HTTP route and WebSocket levels.
- **Marketplace**: 4-tab layout (Browse, Sell, My Listings, Orders) with search/category/subcategory filters. Includes duplicate listing prevention for non-enhanced items and transactional integrity for updates. Buy Order system: players post "want to buy X at price Y" orders (gold escrowed from buyer), sellers fill orders via Quick Sell in the sell dialog. `buy_orders` table with status (open/partial/filled/cancelled), transactional fill logic, buyer notifications on fill. Max 10 active buy orders per player.
- **Economy & Price Intelligence**: Player-driven economy with `market_price_history`, suggested pricing, and regional trading posts. Real-time updates via WebSocket.
- **Bot System**: 20 AI bots indistinguishable from real players, distributed across all 7 regions with region-appropriate equipment, varied skill levels, weapon mastery XP, and realistic `combatSessionStats`. Bots participate in party activities. Bots sync combat state (`currentMonsterId`, `isInCombat`) to `party_members` table enabling same-monster buffs, loot sharing, and skill sharing with real players. Badge backfill runs on startup to assign badges to existing bots.
- **Dev Account Switcher**: Dev mode only. Allows switching between player accounts and bots for testing purposes.
- **Console Guard**: Suppresses console output in production, with an option to re-enable for authorized users.
- **Admin & Anti-Cheat**: `APP_VERSION` cache clearing, server-side anti-cheat, `staffRole` system for granular access, admin panel for granting enhanced items. Server-side anti-dupe validation detects enhanced items in equipment and inventory.
- **Cost Optimization**: Unified polling endpoints with caching, conditional intervals, autosave dirty flag system, and ephemeral WebSockets.

### Backend
- **Technology Stack**: Express.js with TypeScript.
- **Database Interaction**: PostgreSQL using Drizzle ORM.
- **API**: RESTful pattern.
- **Session Management**: Express sessions with a PostgreSQL store.
- **Scheduler Optimization**: Zero CPU/DB usage when no players are connected, activates logic only upon player WebSocket connection.

### Data Model
- **Core Entities**: Players (skills, inventory, tasks), Guilds (members, upgrades), and dynamic Game Data Tables (items, recipes, monsters) utilizing JSONB.

### Guild System Features
- Supports guild creation, membership, role management, XP contribution, and upgrades funded by guild bank resources.

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: Object-relational mapper for TypeScript and PostgreSQL.
- **drizzle-kit**: Database migration tool for Drizzle ORM.

### Frontend Libraries
- **@tanstack/react-query**: For server state management and data caching.
- **Radix UI**: Accessible component primitives.
- **Lucide React**: Icon library.
- **class-variance-authority**: Utility for composing Tailwind CSS classes dynamically.
- **wouter**: Small, declarative routing library for React.