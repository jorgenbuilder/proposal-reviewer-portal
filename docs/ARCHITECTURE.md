# ICP Proposal Reviewer Portal - Architecture

## Overview

A PWA for ICP governance proposal reviewers that sends push notifications when new proposals appear in subscribed topics. Built with Next.js, shadcn/ui, deployed to Vercel.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              VERCEL                                     │
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐                             │
│  │ Upstash QStash  │    │ Vercel Cron     │                             │
│  │ (every 3 min)   │───>│ (hourly backup) │──┐                          │
│  └─────────────────┘    └─────────────────┘  │                          │
│                                              ▼                          │
│                              ┌──────────────────────────┐               │
│                              │ /api/check-proposals     │               │
│                              │ (Idempotent handler)     │               │
│                              └────────────┬─────────────┘               │
│                                           │                             │
│         ┌─────────────────────────────────┼─────────────────────┐       │
│         ▼                                 ▼                     ▼       │
│  ┌──────────────┐               ┌──────────────────┐   ┌────────────┐   │
│  │ NNS Canister │               │ Vercel Postgres  │   │ Web Push   │   │
│  │ Query        │               │ (subscriptions,  │   │ + Resend   │   │
│  └──────────────┘               │  proposal state) │   │ (fallback) │   │
│                                 └──────────────────┘   └────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Notification Reliability Strategy

PWAs alone cannot achieve reliable notifications - a backend is mandatory. Service workers can only _receive_ push events; something must _send_ them.

- **Primary**: Web Push via `web-push` library with VAPID keys
- **Fallback**: Email via Resend (free tier: 3000/month) after push failure
- **Polling**: Upstash QStash every 3 minutes (free: 500/day) + Vercel hourly backup
- **Idempotency**: Track seen proposals in Postgres to prevent duplicate notifications

### PWA Install Flow

- Landing page shows PWA install instructions only
- Full app UI revealed only when:
  1. Running in standalone/installed mode (`display-mode: standalone`)
  2. Notification permission granted
  3. Push subscription active

### Proposal → GitHub Actions Mapping

- Query `github.com/jorgenbuilder/icp-build-verifier` Actions API
- Parse run names matching pattern: `Verify Proposal #<ID>`
- Link format: `https://github.com/jorgenbuilder/icp-build-verifier/actions/runs/<RUN_ID>`

## Tech Stack

| Layer          | Technology                                      |
| -------------- | ----------------------------------------------- |
| Framework      | Next.js 14 (App Router)                         |
| UI             | shadcn/ui + Tailwind CSS                        |
| Database       | Vercel Postgres                                 |
| Push           | web-push + VAPID                                |
| Email Fallback | Resend                                          |
| Cron           | Upstash QStash (primary) + Vercel Cron (backup) |
| ICP Query      | @dfinity/agent                                  |
| Deployment     | Vercel (Free tier)                              |

## Database Schema

```sql
-- Push subscriptions
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  email TEXT,  -- For fallback notifications
  created_at TIMESTAMP DEFAULT NOW(),
  last_success TIMESTAMP
);

-- Proposals seen (idempotency)
CREATE TABLE proposals_seen (
  proposal_id BIGINT PRIMARY KEY,
  topic TEXT NOT NULL,
  title TEXT,
  seen_at TIMESTAMP DEFAULT NOW(),
  notified BOOLEAN DEFAULT FALSE
);

-- Notification log (audit trail)
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id BIGINT NOT NULL,
  subscription_id UUID NOT NULL,
  channel TEXT NOT NULL,  -- 'push' or 'email'
  status TEXT NOT NULL,   -- 'sent', 'failed', 'delivered'
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## File Structure

```
/app
  /api
    /check-proposals/route.ts     # Cron handler
    /subscribe/route.ts           # Push subscription endpoint
    /unsubscribe/route.ts
  /(install)
    /page.tsx                     # Install instructions
  /(app)
    /layout.tsx                   # App shell (requires installed PWA)
    /page.tsx                     # Proposal list
    /proposals/[id]/page.tsx      # Proposal detail
/lib
  /db.ts                          # Vercel Postgres client
  /nns.ts                         # NNS canister queries
  /push.ts                        # Web push utilities
  /github.ts                      # GitHub Actions API
/public
  /manifest.json                  # PWA manifest
  /sw.js                          # Service worker
/components
  /ui/                            # shadcn components
  /install-instructions.tsx
  /proposal-card.tsx
  /notification-prompt.tsx
```

## Environment Variables

```
# VAPID Keys (generate with: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# Database
POSTGRES_URL=

# Email fallback
RESEND_API_KEY=

# Cron security
CRON_SECRET=

# Upstash QStash
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
```

## Implementation Phases

### Phase 1: Project Setup

1. Initialize Next.js 14 project with TypeScript
2. Configure Tailwind CSS + shadcn/ui
3. Set up PWA manifest and service worker
4. Configure Vercel Postgres

### Phase 2: PWA Install Experience

1. Create install instructions landing page
2. Implement standalone mode detection via `window.matchMedia('(display-mode: standalone)')`
3. Add notification permission request flow
4. Build push subscription registration

### Phase 3: Backend - Proposal Monitoring

1. Set up @dfinity/agent for NNS canister queries
2. Implement `/api/check-proposals` endpoint (idempotent)
3. Configure Upstash QStash webhook + Vercel cron
4. Add proposal deduplication logic

### Phase 4: Notification System

1. Generate and configure VAPID keys
2. Implement web-push notification sending
3. Add Resend email fallback
4. Build retry logic with exponential backoff

### Phase 5: Proposal Detail Pages

1. Create `/proposals/[id]` dynamic route
2. Fetch proposal data from NNS canister
3. Query GitHub API for verification action runs
4. Add links to IC Dashboard and GitHub diff

### Phase 6: Service Worker

1. Handle push events and display notifications
2. Handle notification clicks (open proposal detail)
3. Implement background sync for offline resilience

## NNS Canister Integration

### Canister Details

- **Canister ID**: `rrkah-fqaaa-aaaaa-aaaaq-cai`
- **Endpoint**: `list_proposals`
- **Dashboard**: https://dashboard.internetcomputer.org/canister/rrkah-fqaaa-aaaaa-aaaaq-cai

### Query Pattern (from icp-build-verifier)

```typescript
import { HttpAgent, Actor } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";

const NNS_GOVERNANCE_CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// Topic 17 = Protocol Canister Management (InstallCode proposals)
const PROTOCOL_CANISTER_MANAGEMENT_TOPIC = 17;

// Minimum proposal ID to track (filter old proposals)
const MIN_PROPOSAL_ID = 139900n;

async function queryProposals() {
  const agent = await HttpAgent.create({ host: "https://ic0.app" });
  const actor = Actor.createActor(governanceIdlFactory, {
    agent,
    canisterId: Principal.fromText(NNS_GOVERNANCE_CANISTER_ID),
  });

  const response = await actor.list_proposals({
    include_reward_status: [],
    omit_large_fields: [true],
    before_proposal: [],
    limit: 100,
    exclude_topic: [],
    include_all_manage_neuron_proposals: [false],
    include_status: [],
  });

  return response.proposal_info;
}
```

### Proposal Data Structure

```typescript
interface ProposalInfo {
  id: { id: bigint }[];
  proposer: { id: bigint }[];
  topic: number;
  title: string;
  summary: string;
  url: string;
  proposal: {
    action: {
      InstallCode?: {
        wasm_module_hash: number[];
        canister_id: Principal;
      };
    };
  }[];
}
```

## GitHub Actions Integration

### Repository

- **Repo**: `github.com/jorgenbuilder/icp-build-verifier`
- **Local path**: `../icp-build-verifier` (for reference)

### Discovering Action Runs

Action runs use naming convention: `Verify Proposal #<PROPOSAL_ID>`

```typescript
// Query GitHub Actions API
const response = await fetch(
  "https://api.github.com/repos/jorgenbuilder/icp-build-verifier/actions/runs?per_page=100",
  {
    headers: {
      Accept: "application/vnd.github.v3+json",
      // Authorization: `Bearer ${GITHUB_TOKEN}` // Optional for higher rate limits
    },
  }
);

const data = await response.json();

// Find run for specific proposal
function findRunForProposal(proposalId: string, runs: any[]) {
  return runs.find((run) =>
    run.display_title?.match(new RegExp(`Verify Proposal #${proposalId}`))
  );
}
```

### Link Format

- **IC Dashboard**: `https://dashboard.internetcomputer.org/proposal/{proposalId}`
- **GitHub Action Run**: `https://github.com/jorgenbuilder/icp-build-verifier/actions/runs/{runId}`

## Service Worker Implementation

### Push Event Handler

```javascript
// public/sw.js
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};

  const options = {
    body: data.body || "New proposal available",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: `proposal-${data.proposalId}`,
    data: {
      url: data.url || `/proposals/${data.proposalId}`,
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Focus existing window or open new one
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
```

### PWA Manifest

```json
{
  "name": "ICP Proposal Reviewer",
  "short_name": "Proposals",
  "description": "Get notified about new ICP governance proposals",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## API Endpoint Details

### POST /api/check-proposals

Idempotent endpoint called by cron. Must verify cron secret.

```typescript
export async function POST(request: Request) {
  // 1. Verify authorization (CRON_SECRET or QStash signature)
  // 2. Query NNS for recent proposals
  // 3. Filter to topic 17 (Protocol Canister Management)
  // 4. Check proposals_seen table for new ones
  // 5. For each new proposal:
  //    a. Insert into proposals_seen
  //    b. Get all push_subscriptions
  //    c. Send web push to each
  //    d. If push fails, send email fallback
  //    e. Log to notification_log
  // 6. Return summary
}
```

### POST /api/subscribe

Register push subscription from client.

```typescript
interface SubscribeRequest {
  subscription: PushSubscription; // From browser's pushManager.subscribe()
  email?: string; // Optional email for fallback
}
```

## Vercel Configuration

### vercel.json

```json
{
  "crons": [
    {
      "path": "/api/check-proposals",
      "schedule": "0 * * * *"
    }
  ]
}
```

Note: Free tier limited to hourly. Upstash QStash provides more frequent polling.

## Verification Plan

1. **PWA Install Flow**

   - Load app in Chrome, verify install prompt appears
   - Install PWA, verify standalone mode detected
   - Grant notification permission, verify subscription created in DB

2. **Notification Delivery**

   - Manually call `/api/check-proposals` with test data
   - Verify push notification received on device
   - Test email fallback by using invalid push endpoint

3. **Proposal Detail**

   - Navigate to `/proposals/139941`
   - Verify IC Dashboard link: `https://dashboard.internetcomputer.org/proposal/139941`
   - Verify GitHub Action link resolves correctly

4. **End-to-End**
   - Wait for new proposal on NNS
   - Verify notification arrives within polling interval
   - Click notification, verify opens correct proposal detail

## Scope Limitations (MVP)

- Topic subscription UI stubbed (hardcoded to "Protocol Canister Management" / topic 17)
- AI summary of proposal changes (placeholder for later)
- User authentication (anonymous subscriptions for MVP)
- Code diff viewer (link to GitHub only for now)

## Dependencies

```json
{
  "dependencies": {
    "@dfinity/agent": "^2.0.0",
    "@dfinity/principal": "^2.0.0",
    "@vercel/postgres": "^0.10.0",
    "web-push": "^3.6.0",
    "resend": "^4.0.0",
    "@upstash/qstash": "^2.0.0"
  }
}
```

## References

- NNS Governance: https://dashboard.internetcomputer.org/canister/rrkah-fqaaa-aaaaa-aaaaq-cai
- icp-build-verifier: https://github.com/jorgenbuilder/icp-build-verifier
- Web Push Protocol: https://web.dev/articles/push-notifications-web-push-protocol
- VAPID: https://rossta.net/blog/using-the-web-push-api-with-vapid.html
