import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

/**
 * Deploy NFT Collection Contract using thirdweb API
 * 
 * Note: This script requires:
 * - THIRDWEB_SECRET_KEY: Your thirdweb secret key
 * - DEPLOYER_PRIVATE_KEY: Private key of wallet to deploy from (must have ETH on Base)
 * 
 * For production, deploy via thirdweb Dashboard or use their CLI tools.
 * This script is a helper for programmatic deployment.
 */

const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!THIRDWEB_SECRET_KEY) {
  throw new Error("THIRDWEB_SECRET_KEY environment variable is required");
}

async function deployNFTContract() {
  try {
    console.log("⚠️  Note: Contract deployment via API requires specific setup.");
    console.log("For easier deployment, use the thirdweb Dashboard:");
    console.log("  1. Go to https://thirdweb.com/dashboard");
    console.log("  2. Create a new project");
    console.log("  3. Deploy 'NFT Collection' contract");
    console.log("  4. Configure: Max Supply = 1111, Price = 0.001 ETH");
    console.log("  5. Deploy to Base network");
    console.log("\nAlternatively, use thirdweb CLI: npx thirdweb deploy");
    console.log("\nAfter deployment, set NFT_CONTRACT_ADDRESS in .env.local");
    
    // For now, we'll provide instructions
    // Actual deployment should be done via Dashboard or CLI for simplicity
    console.log("\n📝 Manual Deployment Steps:");
    console.log("1. Visit: https://thirdweb.com/contracts/deploy");
    console.log("2. Select 'NFT Collection' contract type");
    console.log("3. Configure:");
    console.log("   - Name: Deepsea Diver PFPs");
    console.log("   - Symbol: DEEPSEA");
    console.log("   - Max Supply: 1111");
    console.log("   - Price per token: 0.001 ETH");
    console.log("4. Deploy to Base network (Chain ID: 8453)");
    console.log("5. Copy the contract address and set NFT_CONTRACT_ADDRESS in .env.local");
    
    return null;
  } catch (error: any) {
    console.error("Error:", error);
    throw error;
  }
}

deployNFTContract()
  .then(() => {
    console.log("\n✅ Deployment script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });

