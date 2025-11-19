# Parent Cast Display Feature

## Overview

This feature displays the parent cast above quote casts when they are not root casts. This helps users understand the context of what a quote cast is replying to, especially when the quote cast is a reply to another cast (not the root curated cast).

## Key Concepts

### Quote Casts
- Quote casts are casts that embed another cast (they quote/reference another cast)
- They can be:
  - **Root quote casts**: Quote casts that directly quote the curated cast (no parent)
  - **Non-root quote casts**: Quote casts that have a parent cast (they're replies to another cast that quotes the curated cast)

### Parent Casts
- The parent cast is the cast that a quote cast is replying to
- For example: If Cast A quotes the curated cast, and Cast B quotes Cast A, then Cast A is the parent of Cast B
- Parent casts are saved to the database for display purposes but should NOT appear as replies in conversation trees

## Implementation Details

### 1. Database Schema

#### Placeholder Curated Cast
A special placeholder curated cast entry exists in the `curated_casts` table:
- **Hash**: `0x0000000000000000000000000000000000000000`
- **Purpose**: Used as `curatedCastHash` for parent casts saved for display only
- **Why**: Parent casts need a `curatedCastHash` for the foreign key constraint, but we don't want them linked to actual curated casts

#### Parent Cast Storage
Parent casts are stored in the `cast_replies` table with:
- `curatedCastHash`: `0x0000000000000000000000000000000000000000` (placeholder)
- `replyCastHash`: The parent cast's hash
- `castData`: Full parent cast data (JSONB)
- `rootCastHash`: The actual curated cast hash (for reference)
- `isQuoteCast`: `false`
- `quotedCastHash`: `null`

This allows parent casts to be:
- Stored in the database for future reference
- Filtered out from conversation queries (they use the placeholder hash)
- Retrieved when needed for display

### 2. API Endpoints

#### `/api/conversation/parent-cast` (POST)
Saves a parent cast to the database.

**Request Body:**
```json
{
  "parentCastHash": "0x...",
  "parentCastData": { /* full cast object */ },
  "rootCastHash": "0x..." // The curated cast hash
}
```

**Process:**
1. Verifies root cast is curated
2. Ensures placeholder curated cast exists
3. Checks if parent cast already exists
4. Calculates reply depth
5. Checks quality threshold
6. Saves to database with placeholder `curatedCastHash`

#### `/api/conversation/database` (GET)
Fetches conversation tree for a curated cast.

**Filtering:**
- Filters out parent casts that use the placeholder hash (`0x0000...`)
- Only includes actual replies and quote casts

#### `/api/feed` (GET)
Fetches curated feed.

**Parent Cast Handling:**
1. Identifies quote casts with parents
2. Fetches parent casts from database (using placeholder hash)
3. Fetches missing parent casts from Neynar in parallel
4. Adds `_parentCast` to quote cast objects
5. Saves fetched parents to database for future use

### 3. Frontend Components

#### `ConversationView.tsx`
Handles parent cast fetching and display in conversation threads.

**Key Functions:**
- `findCastByHash()`: Recursively searches replies tree for a cast by hash
- `fetchParentCast()`: Fetches a parent cast from API and saves it
- `renderThreadedReply()`: Renders replies and includes parent cast data

**Process:**
1. When rendering a quote cast, checks if it has a parent
2. First checks if parent is in the replies tree
3. If not found, checks `fetchedParentCasts` state
4. If still not found, fetches from API
5. Passes parent cast to `CastCard` via `_parentCast` property

#### `CastCard.tsx`
Displays the parent cast above quote casts.

**Display Logic:**
- Checks if `_isQuoteCast` is true AND `_parentCast` exists
- Shows "REPLYING TO" label in small uppercase text
- Displays parent cast in a subtle background box with:
  - Small avatar (6x6)
  - Author name and username
  - Truncated cast text (2 lines max, `line-clamp-2`)
  - Clickable link to navigate to parent cast
  - Border separator above the quote cast

**Visual Design:**
- Small text (`text-xs`)
- Subtle background (`bg-gray-50 dark:bg-gray-800/30`)
- Rounded corners with padding
- Clear visual separation from the quote cast content

### 4. Data Flow

#### Conversation View Flow:
```
1. User views conversation
2. ConversationView fetches replies from /api/conversation/database
3. For each quote cast with parent_hash:
   a. Check if parent is in replies tree
   b. If not, check fetchedParentCasts state
   c. If not, fetch from /api/conversation/parent-cast
   d. Save to database and state
4. Pass parent cast to CastCard via _parentCast
5. CastCard displays "Replying to" section above quote cast
```

#### Feed Flow:
```
1. User views curated feed
2. Feed API identifies quote casts with parents
3. Fetches parent casts from database (placeholder hash)
4. Fetches missing parents from Neynar in parallel
5. Adds _parentCast to cast objects
6. CastCard displays parent cast above quote cast
```

### 5. Filtering Logic

#### Conversation Tree Filtering
In `/api/conversation/database/route.ts`:
- Filters out casts where `curatedCastHash === "0x0000000000000000000000000000000000000000"`
- This ensures parent casts don't appear as replies in conversation trees

#### Additional Checks
- Checks if cast's `parent_hash` (from castData) is NOT the root cast
- Checks if parent is actually in the stored replies (meaning it's part of the thread)
- If parent is not in replies, it's a metadata-only entry and should be skipped

### 6. Key Files

#### Backend:
- `app/api/conversation/parent-cast/route.ts` - Saves parent casts
- `app/api/conversation/database/route.ts` - Fetches conversation (filters parent casts)
- `app/api/feed/route.ts` - Fetches feed (includes parent casts)
- `app/api/conversation/route.ts` - Fetches conversation from Neynar (filters parent casts)
- `app/api/feed/replies/route.ts` - Fetches replies (filters parent casts)
- `drizzle/0011_add_parent_cast_placeholder.sql` - Migration for placeholder cast
- `scripts/run-migration-0011.ts` - Script to run migration

#### Frontend:
- `app/components/ConversationView.tsx` - Fetches and passes parent casts
- `app/components/CastCard.tsx` - Displays parent cast above quote cast

#### Library:
- `lib/conversation.ts` - `isQuoteCast()` function to identify quote casts

### 7. Constants

```typescript
const PARENT_CAST_PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000";
```

This placeholder hash is used consistently across:
- Database queries (to filter out parent casts)
- Saving parent casts (as `curatedCastHash`)
- Migration script (to create placeholder entry)

### 8. Edge Cases Handled

1. **Parent cast not in database**: Fetches from Neynar and saves for future use
2. **Parent cast already exists**: Skips duplicate saves
3. **Parent cast is root cast**: Doesn't show parent (only shows for non-root quote casts)
4. **Multiple quote casts with same parent**: Reuses fetched parent cast data
5. **Parent cast fetch fails**: Gracefully handles errors, doesn't block UI
6. **Parent cast in replies tree**: Uses existing data instead of fetching

### 9. Performance Considerations

- **Parallel fetching**: Parent casts are fetched in parallel using `Promise.all()`
- **Database caching**: Parent casts are saved to database to avoid repeated Neynar API calls
- **Lazy loading**: In feed, parent casts are fetched but don't block the response
- **Filtering at query level**: Parent casts are filtered out in SQL queries, not in application code

### 10. Visual Example

```
┌─────────────────────────────────────┐
│ REPLYING TO                         │
│ ┌─────────────────────────────────┐ │
│ │ [Avatar] Jacob                  │ │
│ │ @jacob                           │ │
│ │ the feed is the problem...      │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ [Avatar] Cassie Heart               │
│ @cassie · about 21 hours ago 💬    │
│ Massively agree https://...         │
└─────────────────────────────────────┘
```

The parent cast (Jacob's cast) is displayed above the quote cast (Cassie Heart's cast) with clear visual separation and labeling.

## Migration

To apply the database migration:

```bash
npx tsx scripts/run-migration-0011.ts
```

This creates the placeholder curated cast entry needed for the foreign key constraint.

## Testing

To verify the feature works:

1. Find a quote cast that has a parent (not a root quote cast)
2. View it in the conversation view - should see "REPLYING TO" section
3. View it in the curated feed - should see "REPLYING TO" section
4. Check database - parent cast should be saved with placeholder hash
5. Verify parent cast doesn't appear as a reply in conversation tree





