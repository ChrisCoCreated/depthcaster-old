# Future Development Notes

## Caching Infrastructure

### Redis Migration for Multi-Instance Scaling

**Current State:**
- Using in-memory LRU cache for API response caching
- Cache is scoped to individual server instances

**Why Redis:**
When scaling to multiple server instances (horizontal scaling), each instance maintains its own in-memory cache. This leads to:
- Duplicate cache entries across instances
- Lower cache hit rates
- Redundant API calls to Neynar

**Migration Path:**
1. Replace in-memory cache with Redis client
2. Use Redis for:
   - Feed response caching
   - User data caching
   - Conversation thread caching
   - Notification caching
3. Maintain same cache key structure and TTLs
4. Consider Redis connection pooling for performance

**Implementation Notes:**
- Use `ioredis` or `@upstash/redis` (serverless-friendly)
- Keep cache key naming consistent with current implementation
- Add Redis connection error handling and fallback to direct API calls
- Monitor Redis memory usage and set appropriate eviction policies

**When to Migrate:**
- Deploying to multiple server instances
- Cache hit rate drops below 50% due to instance distribution
- Need for cache persistence across deployments





