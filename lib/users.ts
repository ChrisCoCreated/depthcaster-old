import { db } from "./db";
import { users } from "./schema";
import { eq, inArray } from "drizzle-orm";
import { neynarClient } from "./neynar";
import { cacheUser } from "./cache";

export async function upsertUser(fid: number, userData?: { username?: string; displayName?: string; pfpUrl?: string }) {
  // Try to fetch user data from Neynar if not provided
  if (!userData) {
    try {
      // Check cache first
      const cacheKey = cacheUser.generateKey([fid]);
      const cached = cacheUser.get(cacheKey);
      if (cached) {
        const cachedUser = cached.users?.[0];
        if (cachedUser) {
          userData = {
            username: cachedUser.username,
            displayName: cachedUser.display_name,
            pfpUrl: cachedUser.pfp_url,
          };
        }
      } else {
        const response = await neynarClient.fetchBulkUsers({ fids: [fid] });
        // Cache the response
        cacheUser.set(cacheKey, response);
        const neynarUser = response.users?.[0];
        if (neynarUser) {
          userData = {
            username: neynarUser.username,
            displayName: neynarUser.display_name,
            pfpUrl: neynarUser.pfp_url,
          };
        }
      }
    } catch (error) {
      console.error(`Failed to fetch user ${fid} from Neynar:`, error);
    }
  }

  const existingUser = await db.select().from(users).where(eq(users.fid, fid)).limit(1);

  if (existingUser.length > 0) {
    // Update existing user
    const [updated] = await db
      .update(users)
      .set({
        username: userData?.username ?? existingUser[0].username,
        displayName: userData?.displayName ?? existingUser[0].displayName,
        pfpUrl: userData?.pfpUrl ?? existingUser[0].pfpUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.fid, fid))
      .returning();
    return updated;
  } else {
    // Insert new user
    const [newUser] = await db
      .insert(users)
      .values({
        fid,
        username: userData?.username ?? null,
        displayName: userData?.displayName ?? null,
        pfpUrl: userData?.pfpUrl ?? null,
      })
      .returning();
    return newUser;
  }
}

export async function upsertBulkUsers(
  userDataMap: Map<number, { username?: string; displayName?: string; pfpUrl?: string }>
): Promise<void> {
  if (userDataMap.size === 0) return;

  const fids = Array.from(userDataMap.keys());
  
  // Fetch existing users from database
  const existingUsers = await db
    .select()
    .from(users)
    .where(inArray(users.fid, fids));

  const existingFids = new Set(existingUsers.map((u) => u.fid));
  const fidsToFetch = fids.filter((fid) => {
    const data = userDataMap.get(fid);
    // Fetch if we don't have userData or if username is missing
    return !data || !data.username;
  });

  // Fetch missing user data from Neynar in batches
  if (fidsToFetch.length > 0) {
    try {
      // Neynar API accepts up to 100 FIDs at a time
      const batchSize = 100;
      for (let i = 0; i < fidsToFetch.length; i += batchSize) {
        const batch = fidsToFetch.slice(i, i + batchSize);
        
        // Check cache first
        const cacheKey = cacheUser.generateKey(batch);
        let response = cacheUser.get(cacheKey);
        
        if (!response) {
          response = await neynarClient.fetchBulkUsers({ fids: batch });
          // Cache the response
          cacheUser.set(cacheKey, response);
        }
        
        const neynarUsers = response.users || [];
        
        for (const neynarUser of neynarUsers) {
          const fid = neynarUser.fid;
          const existingData = userDataMap.get(fid);
          userDataMap.set(fid, {
            username: existingData?.username || neynarUser.username,
            displayName: existingData?.displayName || neynarUser.display_name,
            pfpUrl: existingData?.pfpUrl || neynarUser.pfp_url,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch bulk users from Neynar:", error);
    }
  }

  // Prepare updates and inserts
  const updates: Array<{ fid: number; username: string | null; displayName: string | null; pfpUrl: string | null }> = [];
  const inserts: Array<{ fid: number; username: string | null; displayName: string | null; pfpUrl: string | null }> = [];

  for (const fid of fids) {
    const data = userDataMap.get(fid);
    const existingUser = existingUsers.find((u) => u.fid === fid);
    
    const userData = {
      fid,
      username: data?.username ?? null,
      displayName: data?.displayName ?? null,
      pfpUrl: data?.pfpUrl ?? null,
    };

    if (existingUser) {
      // Only update if data has changed
      if (
        userData.username !== existingUser.username ||
        userData.displayName !== existingUser.displayName ||
        userData.pfpUrl !== existingUser.pfpUrl
      ) {
        updates.push(userData);
      }
    } else {
      inserts.push(userData);
    }
  }

  // Perform batch updates
  if (updates.length > 0) {
    for (const updateData of updates) {
      await db
        .update(users)
        .set({
          username: updateData.username,
          displayName: updateData.displayName,
          pfpUrl: updateData.pfpUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.fid, updateData.fid));
    }
  }

  // Perform batch inserts
  if (inserts.length > 0) {
    await db.insert(users).values(inserts);
  }
}

export async function getUser(fid: number) {
  const [user] = await db.select().from(users).where(eq(users.fid, fid)).limit(1);
  return user;
}

export async function updateUserPreferences(fid: number, preferences: Record<string, any>) {
  const [updated] = await db
    .update(users)
    .set({
      preferences,
      updatedAt: new Date(),
    })
    .where(eq(users.fid, fid))
    .returning();
  return updated;
}

export async function getUserPreferences(fid: number) {
  const user = await getUser(fid);
  const preferences = (user?.preferences || {}) as {
    autoLikeOnCurate?: boolean;
    hasSeenAutoLikeNotification?: boolean;
  };
  
  return {
    autoLikeOnCurate: preferences.autoLikeOnCurate !== undefined ? preferences.autoLikeOnCurate : true,
    hasSeenAutoLikeNotification: preferences.hasSeenAutoLikeNotification || false,
  };
}

