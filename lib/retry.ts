/**
 * Retry utility for handling transient database errors
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
}

/**
 * Check if an error is a transient database error that should be retried
 */
function isTransientError(error: any): boolean {
  // Check for NeonDbError with connection issues
  if (error?.name === "NeonDbError" || error?.constructor?.name === "NeonDbError") {
    const message = error?.message || "";
    const cause = error?.cause;
    
    // Check for connection failures
    if (message.includes("fetch failed") || message.includes("Error connecting to database")) {
      return true;
    }
    
    // Check cause for socket errors
    if (cause) {
      if (cause.code === "UND_ERR_SOCKET" || cause.message?.includes("other side closed")) {
        return true;
      }
      if (cause.name === "SocketError" || cause.constructor?.name === "SocketError") {
        return true;
      }
    }
  }
  
  // Check for SocketError directly
  if (error?.name === "SocketError" || error?.constructor?.name === "SocketError") {
    if (error.code === "UND_ERR_SOCKET" || error.message?.includes("other side closed")) {
      return true;
    }
  }
  
  // Check for fetch failed errors
  if (error?.message?.includes("fetch failed") || error?.message?.includes("TypeError: fetch failed")) {
    return true;
  }
  
  // Check error cause recursively
  if (error?.cause) {
    return isTransientError(error.cause);
  }
  
  return false;
}

/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff on transient errors
 * 
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    backoffMultiplier = 2,
    maxDelay = 800,
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's not a transient error
      if (!isTransientError(error)) {
        throw error;
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Log retry attempt
      console.log(
        `[Retry] Transient error detected, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`
      );

      // Wait before retrying
      await sleep(delay);

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  // All retries exhausted, throw the last error
  console.error(`[Retry] All retry attempts exhausted after ${maxRetries + 1} attempts`);
  throw lastError;
}




















