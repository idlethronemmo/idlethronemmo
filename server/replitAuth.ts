import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { verifyFirebaseToken, getFirebaseUidFromToken } from "./firebaseAdmin";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      console.log("[LOGOUT] User ID:", userId);
      if (userId) {
        console.log("[LOGOUT] Clearing activeTask for userId:", userId);
        await storage.clearActiveTaskByUserId(userId);
        console.log("[LOGOUT] activeTask cleared successfully");
      } else {
        console.log("[LOGOUT] No user ID found in session");
      }
    } catch (error) {
      console.error("[LOGOUT] Error clearing active task:", error);
    }
    
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Dev mode bypass - use first player as authenticated user
  if (process.env.NODE_ENV === 'development') {
    try {
      const players = await storage.getLeaderboard(1);
      if (players.length > 0) {
        const player = players[0];
        (req as any).user = {
          claims: {
            sub: player.userId,
            email: player.email,
          },
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          firebaseUid: player.firebaseUid, // Include for parity with Firebase auth
        };
        return next();
      }
    } catch (error) {
      console.error("[Dev Auth] Error getting dev user:", error);
    }
    return res.status(401).json({ message: "Unauthorized - no dev player found" });
  }

  // First try Replit session auth
  const user = req.user as any;
  if (req.isAuthenticated?.() && user?.expires_at) {
    const now = Math.floor(Date.now() / 1000);
    if (now <= user.expires_at) {
      return next();
    }

    // Try to refresh the token
    const refreshToken = user.refresh_token;
    if (refreshToken) {
      try {
        const config = await getOidcConfig();
        const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
        updateUserSession(user, tokenResponse);
        return next();
      } catch (error) {
        console.log("[isAuthenticated] Token refresh failed, trying Firebase auth");
      }
    }
  }

  // Then try Firebase token auth
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1];
    
    try {
      const decodedToken = await verifyFirebaseToken(idToken);
      if (decodedToken) {
        const firebaseUid = getFirebaseUidFromToken(decodedToken);
        const player = await storage.getPlayerByFirebaseUid(firebaseUid);
        if (player) {
          (req as any).user = {
            claims: {
              sub: player.userId,
              email: player.email,
            },
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            firebaseUid: firebaseUid,
          };
          return next();
        }
      }
    } catch (error) {
      console.error("[isAuthenticated] Firebase token verification failed:", error);
    }
  }

  // Final fallback: session token lookup (x-session-token header)
  const sessionToken = req.headers['x-session-token'] as string;
  if (sessionToken) {
    try {
      const player = await storage.getPlayerBySessionToken(sessionToken);
      if (player) {
        (req as any).user = {
          claims: {
            sub: player.userId,
            email: player.email,
          },
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          firebaseUid: player.firebaseUid,
        };
        return next();
      }
    } catch (error) {
      console.error("[isAuthenticated] Session token lookup failed:", error);
    }
  }

  return res.status(401).json({ message: "Unauthorized" });
};
