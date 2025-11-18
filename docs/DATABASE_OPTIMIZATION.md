# Database Optimization Guide

This document describes the database optimization strategies used in Depthcaster to improve query performance and reduce compute costs on Neon DB.

## Overview

Depthcaster uses a hybrid storage approach that balances flexibility with performance:

- **JSONB storage**: Full cast data stored in `cast_data` JSONB column
- **Extracted columns**: Frequently queried fields extracted to dedicated columns
- **Indexes**: Composite indexes for efficient filtering and sorting

## Migration 0012: Cast Metadata Extraction

### Problem

Previously, all cast data was stored only in JSONB, requiring:
- Full JSONB parsing for every query
- In-memory filtering after fetching data
- No database-level filtering capabilities
- Higher compute usage on Neon DB

### Solution

Extract frequently queried fields into dedicated columns:

#### Columns Added

**curated_casts and cast_replies tables:**
- `cast_text` (text) - Cast text content
- `cast_text_length` (integer) - Length for quick filtering
- `author_fid` (bigint) - Foreign key to users table
- `likes_count` (integer) - Number of likes
- `recasts_count` (integer) - Number of recasts
- `replies_count` (integer) - Number of replies
- `engagement_score` (integer) - Computed: replies*4 + recasts*2 + likes

**curated_casts only:**
- `parent_hash` (text) - For threading queries

### Benefits

1. **Database-level filtering**: Can filter by text length, engagement score, etc. in SQL
2. **Reduced JSONB parsing**: Only parse JSONB when full cast data is needed
3. **Indexed queries**: Composite indexes enable fast filtering and sorting
4. **Lower compute costs**: Fewer JSONB operations on Neon DB
5. **Better scalability**: Text filtering at database level scales better

### Indexes Created

- `curated_casts_cast_text_length_engagement_score_idx` - For quality filtering
- `curated_casts_author_fid_cast_created_at_idx` - For author-based queries
- `curated_casts_parent_hash_idx` - For threading
- `cast_replies_cast_text_length_engagement_score_idx` - For reply filtering
- `cast_replies_author_fid_cast_created_at_idx` - For author queries
- `cast_replies_parent_hash_idx` - For threading

### Usage

All new inserts and updates automatically populate these columns via `extractCastMetadata()` helper function.

**Example query optimization:**

Before (JSONB parsing):
```typescript
// Fetch all, then filter in memory
const casts = await db.select().from(curatedCasts);
const filtered = casts.filter(c => {
  const data = c.castData as any;
  return data.text?.length >= 50 && calculateEngagementScore(data) > 10;
});
```

After (database-level filtering):
```typescript
// Filter at database level
const filtered = await db
  .select()
  .from(curatedCasts)
  .where(
    and(
      gte(curatedCasts.castTextLength, 50),
      gt(curatedCasts.engagementScore, 10)
    )
  );
```

## Query Patterns

### Feed Queries

The curated feed uses a two-phase approach:

1. **Phase 1**: Fetch lightweight metadata (hashes, timestamps, engagement scores) using extracted columns
2. **Phase 2**: Sort in memory using extracted data
3. **Phase 3**: Fetch full JSONB only for selected casts

This minimizes JSONB parsing while maintaining flexibility.

### Future Optimizations

Potential further optimizations:

1. **Materialized views**: For common aggregations (latest curation times, etc.)
2. **Database-level text filtering**: Use extracted `cast_text` column for user filter preferences
3. **Author normalization**: Join with users table via `author_fid` instead of parsing from JSONB
4. **Full-text search**: Add GIN index on `cast_text` for search functionality

## Running Migrations

```bash
# Run migration 0012
npx tsx scripts/run-migration-0012.ts
```

The migration will:
1. Add new columns (nullable initially)
2. Backfill existing data from JSONB
3. Clean up invalid foreign key references
4. Add foreign key constraints
5. Create indexes

## Monitoring

To monitor the impact of these optimizations:

1. **Query performance**: Check Neon DB query analytics
2. **Compute usage**: Monitor Neon DB compute units
3. **Cache hit rates**: Monitor API response caching
4. **Response times**: Track feed API response times

## Best Practices

1. **Always populate extracted columns**: Use `extractCastMetadata()` when inserting/updating casts
2. **Use extracted columns for filtering**: Prefer column-based WHERE clauses over JSONB parsing
3. **Keep JSONB for full data**: Still store complete cast data in JSONB for flexibility
4. **Index strategically**: Add indexes based on actual query patterns
5. **Monitor performance**: Track query times and adjust indexes as needed


