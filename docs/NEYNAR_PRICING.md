# Neynar API Pricing

This document contains pricing information for the Neynar API to help agents make informed decisions about API usage, rate limits, and cost optimization.

**Source**: https://dev.neynar.com/pricing  
**Last Updated**: January 2025

## Pricing Plans

Neynar offers multiple subscription tiers:

- **Starter Plan**: Entry-level plan for development and small projects
- **Growth Plan**: For growing applications with moderate traffic
- **Scale Plan**: For high-traffic applications
- **Enterprise Plan**: Custom pricing and limits for large-scale deployments

**Note**: For specific pricing details, visit [dev.neynar.com/pricing](https://dev.neynar.com/pricing)

## Rate Limits

Rate limits are set per subscription plan and enforced per API endpoint:

### General Rate Limits

| Plan | Requests Per Minute (RPM) | Requests Per Second (RPS) |
|------|---------------------------|---------------------------|
| Starter | 300 RPM | 5 RPS |
| Growth | 600 RPM | 10 RPS |
| Scale | 1200 RPM | 20 RPS |
| Enterprise | Custom | Custom |

### API-Specific Rate Limits

Some endpoints have higher rate limits:

| Endpoint | Starter (RPM) | Growth (RPM) | Scale (RPM) | Enterprise |
|----------|---------------|--------------|-------------|------------|
| `POST /v2/farcaster/frame/validate` | 5,000 | 10,000 | 20,000 | Custom |
| `GET /v2/farcaster/signer` | 3,000 | 6,000 | 12,000 | Custom |
| `GET /v2/farcaster/signer/developer_managed` | 3,000 | 6,000 | 12,000 | Custom |
| `GET /v2/farcaster/cast/search` | 60 | 120 | 240 | Custom |
| All other endpoints | 300 | 600 | 1,200 | Custom |

**Important**: Rate limits are per API endpoint. You can call different APIs simultaneously up to their individual limits without triggering rate limits. For example, on the Growth plan, you can call two different APIs at 500 RPM each for a total of 1000 RPM.

## Credits Pricing

Neynar uses a credits system (CU - Compute Units) for all API endpoints. Pricing applies to all plans. Different endpoints consume different amounts of credits:

### REST API

#### API (REST, Onchain)

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | POST | `/farcaster/nft/mint` | 100 |
| v2 | POST | `/v2/farcaster/fungible/send` | 200 |
| v2 | POST | `/v2/farcaster/user/register` | 500 |
| v2 | POST | `/v2/fungible` | 50,000 |
| v2 | GET | `/farcaster/nft/mint` | 25 |
| v2 | GET | `/v2/farcaster/fungible/owner/relevant` | 40 |
| v2 | GET | `/v2/farcaster/user/balance` | 100 |

#### Auth Address

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/auth_address/developer_managed` | 0 |
| v2 | POST | `/v2/farcaster/auth_address/developer_managed/signed_key` | 5 |

**Add-ons:**
- **Sponsored Signer**: Neynar Sponsored Signer - 4,000 CU

#### Ban

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | POST | `/v2/farcaster/ban` | 2 |
| v2 | DELETE | `/v2/farcaster/ban` | 2 |
| v2 | GET | `/v2/farcaster/ban/list` | 2 |

#### Block

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | POST | `/v2/farcaster/block` | 2 |
| v2 | DELETE | `/v2/farcaster/block` | 2 |
| v2 | GET | `/v2/farcaster/block/list` | 2 |

#### Cast

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/cast` | 4 |
| v2 | GET | `/v2/farcaster/cast/conversation` | 10 |
| v2 | GET | `/v2/farcaster/cast/conversation/summary` | 20 |
| v2 | GET | `/v2/farcaster/cast/embed/crawl` | 25 |
| v2 | GET | `/v2/farcaster/cast/quotes` | 3 |
| v2 | GET | `/v2/farcaster/cast/search` | 10 |
| v2 | GET | `/v2/farcaster/casts` | 4 |
| v1 | GET | `/v1/farcaster/recent-casts` | 2 |
| v1 | GET | `/v1/castById` | 100 |
| v1 | GET | `/v1/castsByFid` | 200 |
| v1 | GET | `/v1/castsByMention` | 100 |
| v1 | GET | `/v1/castsByParent` | 200 |
| v2 | POST | `/v2/farcaster/cast` | 150 |
| v2 | DELETE | `/v2/farcaster/cast` | 10 |

#### Metrics

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/cast/metrics` | 50 |

#### Channel

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/channel` | 2 |
| v2 | GET | `/v2/farcaster/channel/bulk` | 2 |
| v2 | GET | `/v2/farcaster/channel/followers` | 1 |
| v2 | GET | `/v2/farcaster/channel/followers/relevant` | 10 |
| v2 | GET | `/v2/farcaster/channel/list` | 2 |
| v2 | GET | `/v2/farcaster/channel/member/invite/list` | 2 |
| v2 | GET | `/v2/farcaster/channel/member/list` | 3 |
| v2 | GET | `/v2/farcaster/channel/search` | 5 |
| v2 | GET | `/v2/farcaster/channel/trending` | 4 |
| v2 | GET | `/v2/farcaster/channel/user` | 3 |
| v2 | GET | `/v2/farcaster/user/channels` | 2 |
| v2 | GET | `/v2/farcaster/user/memberships/list` | 2 |
| v2 | POST | `/v2/farcaster/channel/follow` | 10 |
| v2 | POST | `/v2/farcaster/channel/member/invite` | 10 |
| v2 | DELETE | `/v2/farcaster/channel/follow` | 10 |
| v2 | DELETE | `/v2/farcaster/channel/member` | 10 |
| v2 | PUT | `/v2/farcaster/channel/member/invite` | 10 |

#### Feed

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/feed` | 4 |
| v2 | GET | `/v2/farcaster/feed/channels` | 4 |
| v2 | GET | `/v2/farcaster/feed/following` | 4 |
| v2 | GET | `/v2/farcaster/feed/for_you` | 4 |
| v2 | GET | `/v2/farcaster/feed/parent_urls` | 4 |
| v2 | GET | `/v2/farcaster/feed/trending` | 8 |
| v2 | GET | `/v2/farcaster/feed/user/casts` | 4 |
| v2 | GET | `/v2/farcaster/feed/user/popular` | 10 |
| v2 | GET | `/v2/farcaster/feed/user/replies_and_recasts` | 4 |

#### Fname

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/fname/availability` | 1 |

#### Follow

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/followers` | 4 |
| v2 | GET | `/v2/farcaster/followers/reciprocal` | 8 |
| v2 | GET | `/v2/farcaster/followers/relevant` | 40 |
| v2 | GET | `/v2/farcaster/following` | 4 |
| v2 | GET | `/v2/farcaster/following/suggested` | 8 |
| v2 | POST | `/v2/farcaster/user/follow` | 10 |

#### Frame

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/frame/catalog` | 10 |
| v2 | GET | `/v2/farcaster/frame/notification_tokens` | 1 |
| v2 | GET | `/v2/farcaster/frame/notifications` | 10 |
| v2 | GET | `/v2/farcaster/frame/relevant` | 20 |
| v2 | GET | `/v2/farcaster/frame/search` | 20 |
| v2 | GET | `/v2/farcaster/frame/transaction/pay` | 10 |
| v2 | POST | `/v2/farcaster/frame/notifications` | 100 |
| v2 | POST | `/v2/farcaster/frame/notifications/open` | 0 |
| v2 | POST | `/v2/farcaster/frame/transaction/pay` | 25 |

#### Signer

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/login/authorize` | 2 |
| v2 | GET | `/v2/farcaster/login/nonce` | 0 |
| v2 | GET | `/v2/farcaster/signer` | 0 |
| v2 | GET | `/v2/farcaster/signer/developer_managed` | 0 |
| v2 | GET | `/v2/farcaster/signer/list` | 0 |
| v2 | POST | `/v2/farcaster/message` | 125 |
| v2 | POST | `/v2/farcaster/signer` | 2 |
| v2 | POST | `/v2/farcaster/signer/developer_managed/signed_key` | 20 |
| v2 | POST | `/v2/farcaster/signer/signed_key` | 5 |

**Add-ons:**
- **Prune Message**: Additional CU charged when message causes protocol-level prune - 125 CU
- **Sponsored Signer** (for `/v2/farcaster/signer/developer_managed/signed_key`): 4,000 CU
- **Sponsored Signer** (for `/v2/farcaster/signer/signed_key`): 40,000 CU

#### Mute

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | POST | `/v2/farcaster/mute` | 2 |
| v2 | DELETE | `/v2/farcaster/mute` | 2 |
| v2 | GET | `/v2/farcaster/mute/list` | 2 |

#### Notification

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/notifications` | 12 |
| v2 | GET | `/v2/farcaster/notifications/channel` | 5 |
| v2 | GET | `/v2/farcaster/notifications/parent_url` | 5 |
| v2 | POST | `/v2/farcaster/notifications/seen` | 20 |

#### Reaction

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | POST | `/v2/farcaster/reaction` | 10 |
| v2 | DELETE | `/v2/farcaster/reaction` | 10 |
| v2 | GET | `/v2/farcaster/reactions/cast` | 2 |
| v2 | GET | `/v2/farcaster/reactions/user` | 2 |
| v1 | GET | `/v1/reactionById` | 100 |
| v1 | GET | `/v1/reactionsByCast` | 150 |
| v1 | GET | `/v1/reactionsByFid` | 200 |
| v1 | GET | `/v1/reactionsByTarget` | 150 |

#### Storage

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/storage/allocations` | 1 |
| v2 | GET | `/v2/farcaster/storage/usage` | 1 |
| v1 | GET | `/v1/storageLimitsByFid` | 5 |

#### User

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | POST | `/v2/farcaster/user` | 500 |
| v2 | POST | `/v2/farcaster/user/verification` | 10 |
| v2 | PATCH | `/v2/farcaster/user` | 20 |
| v2 | GET | `/v2/farcaster/user/best_friends` | 30 |
| v2 | GET | `/v2/farcaster/user/bulk` | 2 |
| v2 | GET | `/v2/farcaster/user/bulk-by-address` | 2 |
| v2 | GET | `/v2/farcaster/user/by_location` | 3 |
| v2 | GET | `/v2/farcaster/user/by_username` | 2 |
| v2 | GET | `/v2/farcaster/user/by_x_username` | 3 |
| v2 | GET | `/v2/farcaster/user/custody-address` | 1 |
| v2 | GET | `/v2/farcaster/user/fid` | 25 |
| v2 | GET | `/v2/farcaster/user/interactions` | 8 |
| v2 | GET | `/v2/farcaster/user/power` | 1 |
| v2 | GET | `/v2/farcaster/user/power_lite` | 1,000 |
| v2 | GET | `/v2/farcaster/user/search` | 6 |
| v1 | GET | `/v1/farcaster/recent-users` | 1 |
| v1 | GET | `/v1/userNameProofByName` | 50 |
| v1 | GET | `/v1/userNameProofsByFid` | 50 |
| v2 | DELETE | `/v2/farcaster/user/follow` | 10 |
| v2 | DELETE | `/v2/farcaster/user/verification` | 10 |

#### Subscription

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/user/subscribed_to` | 2 |
| v2 | GET | `/v2/farcaster/user/subscribers` | 2 |
| v2 | GET | `/v2/farcaster/user/subscriptions_created` | 2 |

#### Webhook

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/farcaster/webhook` | 2 |
| v2 | GET | `/v2/farcaster/webhook/list` | 0 |
| v2 | POST | `/v2/farcaster/webhook` | 20 |
| v2 | PATCH | `/v2/farcaster/webhook` | 0 |
| v2 | DELETE | `/v2/farcaster/webhook` | 2 |
| v2 | PUT | `/v2/farcaster/webhook` | 2 |

#### Subscribers

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v2 | GET | `/v2/stp/subscription_check` | 2 |

#### Hub Event

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | GET | `/v1/eventById` | 25 |
| v1 | GET | `/v1/events` | 5,000 |

#### Fid

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | GET | `/v1/fids` | 4,000 |

#### Info

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | GET | `/v1/info` | 100 |

#### Link

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | GET | `/v1/linkById` | 50 |
| v1 | GET | `/v1/linksByFid` | 200 |
| v1 | GET | `/v1/linksByTargetFid` | 200 |

#### Onchain Event

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | GET | `/v1/onChainEventsByFid` | 150 |
| v1 | GET | `/v1/onChainIdRegistryEventByAddress` | 50 |
| v1 | GET | `/v1/onChainSignersByFid` | 50 |

#### Message

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/v1/submitMessage` | 75 |
| v1 | POST | `/v1/validateMessage` | 4 |

**Add-ons:**
- **Prune Message**: Additional CU charged when message causes protocol-level prune - 75 CU

#### User Data

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | GET | `/v1/userDataByFid` | 100 |

#### Verification

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | GET | `/v1/verificationsByFid` | 50 |

### gRPC API

#### Cast

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetAllCastMessagesByFid` | 2,000 |
| v1 | POST | `/HubService/GetCast` | 1 |
| v1 | POST | `/HubService/GetCastsByFid` | 200 |
| v1 | POST | `/HubService/GetCastsByMention` | 100 |
| v1 | POST | `/HubService/GetCastsByParent` | 200 |

#### Link

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetAllLinkMessagesByFid` | 2,000 |
| v1 | POST | `/HubService/GetLink` | 1 |
| v1 | POST | `/HubService/GetLinksByFid` | 200 |
| v1 | POST | `/HubService/GetLinksByTarget` | 200 |

#### Sync

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetAllMessagesBySyncIds` | 2,000 |
| v1 | POST | `/HubService/GetAllSyncIdsByPrefix` | 1,000 |
| v1 | POST | `/HubService/GetSyncMetadataByPrefix` | 1,000 |
| v1 | POST | `/HubService/GetSyncSnapshotByPrefix` | 1,000 |
| v1 | POST | `/HubService/GetSyncStatus` | 1 |

#### Reaction

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetAllReactionMessagesByFid` | 2,000 |
| v1 | POST | `/HubService/GetReaction` | 1 |
| v1 | POST | `/HubService/GetReactionsByCast` | 150 |
| v1 | POST | `/HubService/GetReactionsByFid` | 200 |
| v1 | POST | `/HubService/GetReactionsByTarget` | 150 |

#### User Data

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetAllUserDataMessagesByFid` | 2,000 |
| v1 | POST | `/HubService/GetUserData` | 1 |
| v1 | POST | `/HubService/GetUserDataByFid` | 1 |

#### Verification

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetAllVerificationMessagesByFid` | 2,000 |
| v1 | POST | `/HubService/GetVerification` | 1 |
| v1 | POST | `/HubService/GetVerificationsByFid` | 5 |

#### Info

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetCurrentPeers` | 1 |
| v1 | POST | `/HubService/GetInfo` | 100 |

#### Storage

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetCurrentStorageLimitsByFid` | 5 |

#### Onchain Event

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetEvent` | 1 |
| v1 | POST | `/HubService/GetIdRegistryOnChainEvent` | 1 |
| v1 | POST | `/HubService/GetIdRegistryOnChainEventByAddress` | 2 |
| v1 | POST | `/HubService/GetOnChainEvents` | 15 |
| v1 | POST | `/HubService/GetOnChainSigner` | 15 |
| v1 | POST | `/HubService/GetOnChainSignersByFid` | 15 |

#### Fid

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetFids` | 2,000 |

#### User

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/GetUsernameProof` | 2 |
| v1 | POST | `/HubService/GetUserNameProofsByFid` | 2 |

#### Message

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/SubmitMessage` | 150 |
| v1 | POST | `/HubService/ValidateMessage` | 4 |

#### Subscribe

| Version | Method | Endpoint | Credits per unit |
|---------|--------|----------|------------------|
| v1 | POST | `/HubService/Subscribe` | 5,000 |

### Add-ons

#### Signer
- **API Signer**: 20,000 CU per active signer monthly

#### Data
- **Webhooks**: Data webhooks - 100 CU per webhook delivered

## Notification Rate Limits

When sending notifications to mini-app users:
- **Per token**: 1 notification per 30 seconds
- **Daily limit**: 100 notifications per day per token

These limits are enforced by Merkle's Long from farcaster client. Neynar will filter out notifications to disabled tokens to avoid rate limiting.

## API Usage Considerations

### Endpoint Selection
- Use batch endpoints when available to reduce API calls
- Prefer v2 APIs over v1 APIs (v1 APIs will be deprecated on March 31, 2025)
- Consider using `lib/neynar-batch.ts` for batch operations

### Cost Optimization Strategies
1. **Caching**: Implement aggressive caching for frequently accessed data
   - User data can be cached for longer periods
   - Feed data should be cached with appropriate TTLs
   - See `lib/cache.ts` for current caching implementation

2. **Batch Requests**: Use batch endpoints when fetching multiple items
   - Batch user lookups instead of individual calls
   - Fetch multiple casts in a single request when possible

3. **Rate Limit Management**:
   - Monitor API usage to stay within plan limits
   - Implement exponential backoff for rate limit errors
   - Consider upgrading plan if consistently hitting limits

4. **Endpoint Efficiency**:
   - Use lower-credit endpoints when possible
   - Avoid unnecessary API calls by caching responses
   - Use webhooks for real-time updates instead of polling

## Current Implementation

This codebase uses Neynar for:
- User authentication (Sign in with Neynar)
- Fetching feed data (`/v2/farcaster/feed`)
- Publishing casts (`/v2/farcaster/cast`)
- Fetching conversation threads (`/v2/farcaster/cast/conversation`)
- User data retrieval (`/v2/farcaster/user`)
- Batch user lookups (`lib/neynar-batch.ts`)

**Current API Key Type**: Check your Neynar dashboard to determine your plan

## Migration Notes

**Important**: All v1 APIs (`/v1/farcaster/*`) will be fully turned off on March 31, 2025. If using v1 APIs, migrate to v2 counterparts as soon as possible.

## References

- [Neynar Pricing Page](https://dev.neynar.com/pricing)
- [Rate Limits Documentation](https://docs.neynar.com/reference/what-are-the-rate-limits-on-neynar-apis)
- [Credits Pricing](https://docs.neynar.com/reference/compute-units)
- [API Migration Guide](https://docs.neynar.com/reference/neynar-nodejs-sdk-v1-to-v2-migration-guide)

