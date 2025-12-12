# Depthcaster - Complete Application Capabilities

## Overview

Depthcaster is a sophisticated Farcaster client application focused on surfacing high-quality, thoughtful content. It combines algorithmic intelligence with human curation to create feeds that prioritize substance, quality, and meaningful conversations over viral metrics.

## Core Architecture

- **Framework**: Next.js 16 with React 19
- **Language**: TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Neynar Sign in with Neynar (SIWN)
- **Protocol**: Farcaster via Neynar SDK
- **AI Integration**: DeepSeek API for quality analysis
- **Deployment**: Vercel with serverless functions

## Feed System

### Feed Types

1. **Curated Feed**
   - Hand-picked content from high-quality users and channels
   - Customizable curator selection
   - Multiple sorting options:
     - Recently Curated
     - Time of Cast
     - Recent Reply
   - Quality-filtered content

2. **Trending Feed**
   - Quality-filtered trending content across Farcaster
   - Surfaces what's resonating with quality thresholds

3. **For You Feed**
   - Personalized recommendations based on user interests
   - Interaction-based suggestions

4. **Following Feed**
   - Clean view of casts from followed users
   - Standard chronological feed

5. **My 37 Feed** (Plus feature)
   - Personal feed with up to 37 carefully selected users
   - Default users: 7 users (free tier)
   - Plus users: 37 users
   - Creates intimate social circles

6. **Custom Feeds**
   - Channel-based feeds (e.g., philosophy, art, writing, design)
   - User-based feeds
   - FID-based feeds
   - Configurable display modes and filters

7. **Replies Feed**
   - Dedicated feed for conversation threads
   - Quality-ranked replies

8. **Art Feed**
   - Specialized feed for art-focused channels
   - Admin-configurable

## Content Curation System

### Manual Curation

- **Curator Packs**: User-created collections of curators
  - Public or private packs
  - Subscribe to packs
  - Favorite packs
  - Usage tracking
  - Pack management interface

- **Individual Curator Selection**: Choose specific curators to influence feed
- **Curator Recommendations**: System suggests quality curators
- **Curator Leaderboard**: Tracks top curators by activity

### Automatic Curation

- **Quality Scoring**: AI-powered analysis (0-100 scale)
  - Analyzes cast text, embedded casts, links
  - Categorizes content
  - DeepSeek API integration
  - Batch processing capabilities

- **Quality Thresholds**:
  - User quality scores (default: 0.55 minimum)
  - Cast length requirements (default: 150 characters)
  - Bot detection and filtering
  - Engagement quality metrics

- **Content Filtering**:
  - Hybrid algorithmic + manual approach
  - User quality scores
  - Cast length analysis
  - Engagement depth (replies > likes/recasts)
  - Curated FID lists
  - Channel-based filtering
  - Spam reduction via Neynar experimental flags

## Collections System

Collections are curated sets of casts with advanced features:

### Collection Types

1. **Open Collections**: Publicly accessible
2. **Gated User Collections**: Restricted to specific users
3. **Gated Rule Collections**: Custom access rules

### Collection Features

- **Display Types**: Text, Image, Image-Text
- **Auto-Curation**: Automatic cast addition based on rules
- **Custom Display Modes**:
  - Replace embeds
  - Hide channel links
  - Hide URL links
  - Hide author information
  - Strip text prefixes
  - Character replacement
  - Bold first line
  - Custom button styling
  - Expand mentioned profiles

- **Header Configuration**: Custom titles, descriptions, images
- **Hidden Embed URLs**: Hide specific URL embeds
- **Ordering**: Manual or automatic (ascending/descending)
- **Collection Management**: Create, edit, delete collections
- **Cast Addition**: Add/remove casts from collections
- **Batch Operations**: Add multiple casts at once

## Conversation & Threading

### Thread Features

- **Full Conversation Threads**: Complete reply chains
- **Quality-Ranked Replies**: Replies sorted by quality score
- **Reply Depth Tracking**: Track conversation depth
- **Quote Cast Support**: Handle quoted casts in threads
- **Parent Cast Resolution**: Navigate conversation hierarchy
- **Reply Detection**: Automatic detection of new replies
- **Conversation Database**: Store and retrieve full threads

### Reply Analysis

- **Quality Scoring**: Each reply analyzed for quality
- **Category Classification**: Categorize reply content
- **Engagement Metrics**: Track likes, recasts, replies
- **Author Tracking**: Link replies to authors
- **Timestamp Extraction**: Accurate timing information

## Quality Analysis System

### AI-Powered Analysis

- **DeepSeek Integration**: Uses DeepSeek API for quality analysis
- **Batch Processing**: Efficient bulk analysis
- **Score Range**: 0-100 quality scores
- **Category Classification**: Content categorization
- **Feedback Loop**: Curator feedback improves scoring
- **Quote Cast Analysis**: Analyzes quoted content
- **Link Analysis**: Considers linked content

### Quality Feedback

- **Curator Feedback**: Curators can provide quality feedback
- **Score Adjustment**: Feedback triggers re-evaluation
- **Admin Override**: Admins can adjust scores
- **Feedback History**: Track all quality adjustments

## Notification System

### Notification Types

1. **Quality Reply Notifications**
   - Notifies curators when high-quality replies appear
   - Configurable quality threshold (default: 60)
   - Push notification support

2. **Curation Notifications**
   - Notifies when casts are curated by others
   - Multi-curator awareness

3. **Interaction Notifications**
   - Likes on curated casts
   - Recasts of curated casts
   - Configurable preferences

4. **App Update Notifications**
   - Feature updates
   - System announcements
   - Admin-sent notifications

5. **Feedback Notifications**
   - Admins notified of new feedback
   - Bug reports
   - Feature requests

### Notification Features

- **Push Notifications**: Web Push API integration
- **Badge Updates**: Real-time badge refresh
- **In-App Notifications**: Notification panel
- **Notification Preferences**: Per-user customization
- **Read/Unread Status**: Track notification state
- **Notification Count**: Cached counts for performance
- **Miniapp Notifications**: Farcaster miniapp notifications

## Webhook System

### Webhook Types

1. **User Watch Webhooks**
   - Monitor specific users for new casts
   - Automatic webhook management

2. **Curated Reply Webhooks**
   - Unified webhook for all curated cast replies
   - Monitors quote casts and existing replies
   - Automatic reply detection and storage

3. **Quote Cast Webhooks**
   - Track quote casts to curated content

### Webhook Features

- **Unified Webhooks**: Single webhook for multiple casts
- **Automatic Management**: Create/update/delete webhooks
- **Signature Verification**: Secure webhook validation
- **Batch Processing**: Efficient webhook handling
- **Error Handling**: Robust retry mechanisms

## User Management

### User Features

- **Profile Pages**: Comprehensive user profiles
- **User Search**: Search by username or FID
- **Following System**: Follow/unfollow users
- **User Roles**: Admin, Superadmin, Curator, Plus
- **User Preferences**: Customizable settings
- **Usage Statistics**: Track user activity
- **Signer Management**: Multiple signer support

### Role System

- **Admin**: Administrative access
- **Superadmin**: Full system access
- **Curator**: Content curation privileges
- **Plus**: Premium features (37 users in My 37, feature updates access)

## Admin Panel

### Admin Features

1. **Dashboard**: Overview of system status
2. **Statistics**: Comprehensive analytics
   - User statistics
   - Feed view sessions
   - Cast views
   - Page views
   - Daily aggregations
   - Time range filtering

3. **User Management**:
   - Role assignment
   - Users without roles
   - Curator recommendations
   - User search and filtering

4. **Content Management**:
   - Cast tags (legacy)
   - Cast quotes management
   - Collections management
   - Quality filter
   - Curators leaderboard

5. **System Management**:
   - Build ideas and feedback
   - Notification management
   - Webhook cleanup
   - Art feed configuration

6. **Analytics Tools**:
   - Reply quality analysis
   - Cast quality analysis
   - Statistics dashboard
   - Test notification sending

## Cast Publishing

### Publishing Features

- **Cast Composer**: Clean, distraction-free interface
- **Reply Support**: Reply to any cast
- **Quote Cast Support**: Quote existing casts
- **Image Support**: Rich media sharing
- **Link Previews**: Automatic link unfurling
- **Mention Support**: @mention users
- **Channel Support**: Post to channels

### Cast Features

- **Cast Threading**: View full conversation threads
- **Cast Interactions**: Like, recast, reply
- **Cast Quality**: See quality scores
- **Cast Categories**: View content categories
- **Cast Timestamps**: Accurate timing
- **Cast Metadata**: Rich metadata extraction

## Analytics & Tracking

### Analytics Features

- **Feed View Sessions**: Track feed usage
- **Cast Views**: Track cast visibility
- **Page Views**: Track page navigation
- **Interaction Tracking**: Track user interactions
- **Daily Aggregations**: Efficient data storage
- **Time Range Analysis**: Flexible time filtering
- **User Activity Monitoring**: Track user engagement

### Statistics

- **User Statistics**: Active users, new users
- **Feed Statistics**: Feed type usage
- **Content Statistics**: Cast counts, engagement
- **Quality Statistics**: Quality score distributions
- **Curator Statistics**: Curation activity

## Build Ideas & Feedback

### Build Ideas System

- **Admin Creation**: Admins create build ideas
- **Status Tracking**: Backlog, In Progress, Complete
- **User Attribution**: Track who created ideas
- **Unified Interface**: Build ideas and feedback together

### Feedback System

- **User Feedback**: Any user can submit feedback
- **Feedback Types**: Bug, Feature, General feedback
- **Cast Linking**: Link feedback to specific casts
- **Admin Notifications**: Admins notified of new feedback
- **Feedback Management**: Admin interface for feedback

## Custom Feeds

### Custom Feed Configuration

- **Feed Types**: Channel, User, FIDs, Custom
- **Filters**: Author FID, exclude recasts, min length, custom
- **Display Modes**: Extensive customization options
- **Header Configuration**: Custom headers and images
- **Feed Slugs**: URL-friendly feed identifiers

### Example Custom Feeds

- **Reframe Feed**: Daily optimistic science news
- **Channel Feeds**: Philosophy, art, writing, design
- **User Feeds**: Specific user content

## Plus Features

### Premium Features

- **My 37**: 37 users vs 7 (default)
- **Feature Updates Access**: Access to updates page
- **Future Features**: Extensible premium system

## PWA & Mobile Support

### Progressive Web App

- **Service Worker**: Offline support
- **App Manifest**: Installable PWA
- **Push Notifications**: Web Push API
- **Badge API**: Notification badges
- **Update Detection**: Automatic update notifications
- **Installation Prompt**: PWA installation flow

### Mobile Features

- **Responsive Design**: Mobile-optimized UI
- **Touch Interactions**: Mobile-friendly interactions
- **Miniapp Support**: Farcaster miniapp integration
- **Miniapp Installation**: Track miniapp installs

## Translation & Internationalization

### Translation Features

- **Cast Translation**: Translate cast content
- **Multi-language Support**: Support for multiple languages
- **Translation API**: Integration with translation services

## Image & Media

### Media Features

- **Image Proxy**: Proxy images for performance
- **Image Support**: Rich image sharing
- **Video Support**: Video player integration (HLS.js)
- **Link Previews**: Automatic link unfurling
- **Embed Support**: Rich embed handling

## Search & Discovery

### Search Features

- **User Search**: Search by username or FID
- **Cast Search**: Search cast content
- **Channel Search**: Find channels
- **Suggested Users**: User recommendations

## Settings & Preferences

### User Settings

- **Feed Settings**: Control feed content
- **Notification Preferences**: Customize notifications
- **Curator Selection**: Choose curators
- **Sort Options**: Control feed sorting
- **Dark Mode**: Full dark mode support
- **Bot Settings**: Configure bot filtering

## API Endpoints

### Public APIs

- **Feed APIs**: `/api/feed/*`
- **Cast APIs**: `/api/cast/*`
- **User APIs**: `/api/user/*`
- **Collection APIs**: `/api/collections/*`
- **Curator Pack APIs**: `/api/curator-packs/*`
- **Notification APIs**: `/api/notifications/*`
- **Translation API**: `/api/translate`
- **Metadata API**: `/api/metadata`
- **Image Proxy**: `/api/image-proxy`

### Admin APIs

- **Admin Statistics**: `/api/admin/statistics`
- **Admin Roles**: `/api/admin/roles`
- **Admin Quality**: `/api/admin/quality`
- **Admin Notifications**: `/api/admin/notifications/*`
- **Admin Collections**: `/api/admin/collections`
- **Admin Cast Quotes**: `/api/admin/cast-quotes/*`

### Webhook APIs

- **Webhook Handler**: `/api/webhooks`
- **User Watch Webhook**: `/api/webhooks/user-watch`

## Cron Jobs

### Scheduled Tasks

1. **Daily Statistics**: Aggregate daily statistics
2. **Auto-Curate Collections**: Automatic collection curation
3. **Timeout Feed Sessions**: Clean up old sessions
4. **Weekly Contributors**: Track weekly contributors

## Database Schema

### Core Tables

- **users**: User profiles and preferences
- **user_roles**: Role assignments
- **curated_casts**: Curated content
- **cast_replies**: Reply threads
- **curator_packs**: Curator collections
- **collections**: Cast collections
- **user_notifications**: Notification storage
- **push_subscriptions**: Push notification subscriptions
- **webhooks**: Webhook configuration
- **build_ideas**: Build ideas and feedback
- **quality_feedback**: Quality score feedback
- **analytics tables**: Feed sessions, cast views, page views

## Security & Authentication

### Security Features

- **Neynar Authentication**: Secure Farcaster authentication
- **Webhook Signatures**: Secure webhook validation
- **Role-Based Access**: Granular permissions
- **User Validation**: User verification
- **Signer Management**: Multiple signer support

## Performance Optimizations

### Performance Features

- **Caching**: LRU cache for frequently accessed data
- **Database Indexing**: Optimized database queries
- **Daily Aggregations**: Efficient data storage
- **Batch Processing**: Efficient bulk operations
- **Lazy Loading**: On-demand data loading
- **Image Optimization**: Image proxy and optimization

## Error Handling

### Error Management

- **Retry Logic**: Automatic retry with backoff
- **Error Logging**: Comprehensive error tracking
- **Graceful Degradation**: Fallback mechanisms
- **User-Friendly Errors**: Clear error messages

## Development Tools

### Development Features

- **Database Migrations**: Drizzle migrations
- **Scripts**: Utility scripts for maintenance
- **Admin Tools**: Development and debugging tools
- **Analytics**: Development analytics

## Integration Points

### External Integrations

- **Neynar SDK**: Farcaster protocol integration
- **DeepSeek API**: AI quality analysis
- **Paragraph SDK**: Additional content integration
- **Vercel Analytics**: Usage analytics
- **Web Push**: Push notification service

## Future Capabilities

The system is designed to be extensible with:

- **Additional Feed Types**: New feed configurations
- **Enhanced Quality Analysis**: Improved AI models
- **More Plus Features**: Premium feature expansion
- **Additional Integrations**: New service integrations
- **Advanced Analytics**: Enhanced analytics features

---

This document provides a comprehensive overview of all capabilities in the Depthcaster application. The system is designed to be modular, extensible, and focused on quality content discovery and meaningful conversations.
