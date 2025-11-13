import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

if (!process.env.NEYNAR_API_KEY) {
  throw new Error("NEYNAR_API_KEY is not set in environment variables");
}

const config = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY,
});

export const neynarClient = new NeynarAPIClient(config);

// Helper to get headers with experimental flag for quality filtering
export function getNeynarHeaders(): Record<string, string> {
  return {
    "x-api-key": process.env.NEYNAR_API_KEY!,
    "x-neynar-experimental": "true", // Enable quality filtering
  };
}



