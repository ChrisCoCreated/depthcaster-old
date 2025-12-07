import { NextRequest, NextResponse } from "next/server";
import { logSignIn } from "@/lib/signInLogs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userFid, requestData, responseData, signerUuid, success, error } = body;

    await logSignIn({
      userFid,
      requestData,
      responseData,
      signerUuid,
      success: success ?? true,
      error,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error logging sign-in event:", error);
    return NextResponse.json(
      { error: error.message || "Failed to log sign-in event" },
      { status: 500 }
    );
  }
}

