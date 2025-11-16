/**
 * Safely extract cast timestamp from castData object
 * Handles various timestamp formats and missing values
 */
export function extractCastTimestamp(castData: any): Date | null {
  if (!castData) return null;
  
  const timestamp = castData.timestamp;
  if (!timestamp) return null;
  
  try {
    // Handle ISO string format
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return null;
      return date;
    }
    
    // Handle Date object
    if (timestamp instanceof Date) {
      if (isNaN(timestamp.getTime())) return null;
      return timestamp;
    }
    
    // Handle numeric timestamp (milliseconds)
    if (typeof timestamp === 'number') {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return null;
      return date;
    }
    
    return null;
  } catch (error) {
    console.error('[extractCastTimestamp] Error parsing timestamp:', error);
    return null;
  }
}

