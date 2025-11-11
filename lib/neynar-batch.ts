import { neynarClient } from "./neynar";

// Request deduplication map: key -> Promise
const pendingRequests = new Map<string, Promise<any>>();

// Batch queue for single-user requests
interface QueuedUserRequest {
  fid: number;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

let userBatchQueue: QueuedUserRequest[] = [];
let batchTimeout: NodeJS.Timeout | null = null;
const BATCH_DELAY_MS = 50; // Wait 50ms to collect multiple requests
const MAX_BATCH_SIZE = 100; // Neynar API limit

/**
 * Deduplicate concurrent requests with the same key
 */
export async function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // Check if there's already a pending request with this key
  const pending = pendingRequests.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  // Create new request
  const promise = requestFn().finally(() => {
    // Remove from pending requests when done
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}

/**
 * Process the batch queue
 */
async function processBatchQueue() {
  if (userBatchQueue.length === 0) return;

  const batch = userBatchQueue.splice(0, MAX_BATCH_SIZE);
  const fids = batch.map((req) => req.fid);

  try {
    const response = await neynarClient.fetchBulkUsers({ fids });
    const users = response.users || [];
    const userMap = new Map(users.map((u: any) => [u.fid, u]));

    // Resolve all promises in the batch
    for (const queued of batch) {
      const user = userMap.get(queued.fid);
      if (user) {
        queued.resolve(user);
      } else {
        queued.reject(new Error(`User ${queued.fid} not found in batch response`));
      }
    }

    // Process remaining items in queue if any
    if (userBatchQueue.length > 0) {
      batchTimeout = setTimeout(processBatchQueue, BATCH_DELAY_MS);
    }
  } catch (error) {
    // Reject all promises in the batch
    for (const queued of batch) {
      queued.reject(error);
    }

    // Process remaining items in queue if any
    if (userBatchQueue.length > 0) {
      batchTimeout = setTimeout(processBatchQueue, BATCH_DELAY_MS);
    }
  }
}

/**
 * Queue a single-user request for batching
 */
export function queueUserRequest(fid: number): Promise<any> {
  return new Promise((resolve, reject) => {
    userBatchQueue.push({ fid, resolve, reject });

    // Start batch processing if not already started
    if (!batchTimeout) {
      batchTimeout = setTimeout(processBatchQueue, BATCH_DELAY_MS);
    }

    // Process immediately if batch is full
    if (userBatchQueue.length >= MAX_BATCH_SIZE) {
      if (batchTimeout) {
        clearTimeout(batchTimeout);
        batchTimeout = null;
      }
      processBatchQueue();
    }
  });
}

/**
 * Clear the batch queue (useful for testing)
 */
export function clearBatchQueue() {
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  userBatchQueue = [];
}

