import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { signInLogs, users } from "../lib/schema";
import { logSignIn } from "../lib/signInLogs";
import { eq, isNull, desc } from "drizzle-orm";

async function testSignInLog() {
  try {
    console.log("🧪 Testing sign-in log functionality...\n");

    // Create test users first (required for foreign key constraint)
    const testFid = 12345;
    const testFid2 = 67890;
    
    console.log("Creating test users...");
    try {
      await db.insert(users).values({
        fid: testFid,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
      
      await db.insert(users).values({
        fid: testFid2,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
      console.log("✅ Test users created\n");
    } catch (error) {
      console.log("Test users may already exist, continuing...\n");
    }

    // Test 1: Successful sign-in log
    console.log("Test 1: Logging successful sign-in...");
    const testSignerUuid = "test-signer-uuid-123";
    const testRequestData = { fid: testFid, signer_uuid: testSignerUuid };
    const testResponseData = {
      success: true,
      signer_uuid: testSignerUuid,
      signers_match: true,
    };

    await logSignIn({
      userFid: testFid,
      requestData: testRequestData,
      responseData: testResponseData,
      signerUuid: testSignerUuid,
      success: true,
    });

    // Verify the log was saved
    const savedLogs = await db
      .select()
      .from(signInLogs)
      .where(eq(signInLogs.userFid, testFid))
      .orderBy(desc(signInLogs.createdAt))
      .limit(1);

    if (savedLogs.length === 0) {
      throw new Error("❌ Failed: No log entry found in database");
    }

    const savedLog = savedLogs[0];
    if (savedLog.userFid !== testFid) {
      throw new Error(`❌ Failed: userFid mismatch. Expected ${testFid}, got ${savedLog.userFid}`);
    }
    if (savedLog.signerUuid !== testSignerUuid) {
      throw new Error(`❌ Failed: signerUuid mismatch. Expected ${testSignerUuid}, got ${savedLog.signerUuid}`);
    }
    if (savedLog.success !== true) {
      throw new Error(`❌ Failed: success mismatch. Expected true, got ${savedLog.success}`);
    }
    if (!savedLog.requestData || JSON.stringify(savedLog.requestData) !== JSON.stringify(testRequestData)) {
      throw new Error("❌ Failed: requestData mismatch");
    }
    if (!savedLog.responseData || JSON.stringify(savedLog.responseData) !== JSON.stringify(testResponseData)) {
      throw new Error("❌ Failed: responseData mismatch");
    }
    if (savedLog.error !== null) {
      throw new Error(`❌ Failed: error should be null for successful sign-in, got ${savedLog.error}`);
    }

    console.log("✅ Test 1 passed: Successful sign-in log saved correctly");
    console.log(`   - Log ID: ${savedLog.id}`);
    console.log(`   - User FID: ${savedLog.userFid}`);
    console.log(`   - Signer UUID: ${savedLog.signerUuid}`);
    console.log(`   - Success: ${savedLog.success}`);
    console.log(`   - Created at: ${savedLog.createdAt}\n`);

    // Test 2: Failed sign-in log
    console.log("Test 2: Logging failed sign-in...");
    const testError = "Authentication failed: Invalid credentials";

    await logSignIn({
      userFid: testFid2,
      requestData: { fid: testFid2 },
      responseData: null,
      signerUuid: undefined,
      success: false,
      error: testError,
    });

    // Verify the failed log was saved
    const savedFailedLogs = await db
      .select()
      .from(signInLogs)
      .where(eq(signInLogs.userFid, testFid2))
      .orderBy(desc(signInLogs.createdAt))
      .limit(1);

    if (savedFailedLogs.length === 0) {
      throw new Error("❌ Failed: No failed log entry found in database");
    }

    const savedFailedLog = savedFailedLogs[0];
    if (savedFailedLog.success !== false) {
      throw new Error(`❌ Failed: success should be false, got ${savedFailedLog.success}`);
    }
    if (savedFailedLog.error !== testError) {
      throw new Error(`❌ Failed: error mismatch. Expected "${testError}", got "${savedFailedLog.error}"`);
    }

    console.log("✅ Test 2 passed: Failed sign-in log saved correctly");
    console.log(`   - Log ID: ${savedFailedLog.id}`);
    console.log(`   - User FID: ${savedFailedLog.userFid}`);
    console.log(`   - Success: ${savedFailedLog.success}`);
    console.log(`   - Error: ${savedFailedLog.error}\n`);

    // Test 3: Log without userFid (optional field)
    console.log("Test 3: Logging sign-in without userFid...");
    await logSignIn({
      requestData: { message: "test" },
      responseData: { success: false },
      success: false,
      error: "No user FID provided",
    });

    const logsWithoutFid = await db
      .select()
      .from(signInLogs)
      .where(isNull(signInLogs.userFid))
      .orderBy(desc(signInLogs.createdAt))
      .limit(1);

    if (logsWithoutFid.length === 0) {
      throw new Error("❌ Failed: No log entry without userFid found");
    }

    console.log("✅ Test 3 passed: Log without userFid saved correctly\n");

    // Cleanup: Delete test logs and test users
    console.log("🧹 Cleaning up test data...");
    await db.delete(signInLogs).where(eq(signInLogs.userFid, testFid));
    await db.delete(signInLogs).where(eq(signInLogs.userFid, testFid2));
    // Delete the log without userFid by finding it by the error message
    await db.delete(signInLogs).where(eq(signInLogs.error, "No user FID provided"));
    // Delete test users
    await db.delete(users).where(eq(users.fid, testFid));
    await db.delete(users).where(eq(users.fid, testFid2));
    console.log("✅ Test data cleaned up\n");

    console.log("🎉 All tests passed! Sign-in logging is working correctly.");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Test failed:", error.message || error);
    process.exit(1);
  }
}

testSignInLog();

