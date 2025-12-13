import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// Hardcoded prompt as specified
const PROMPT = "front faceing pfp of a deepsea diver, distopic graphic novel style, optimistic, looking up";

export async function POST(request: NextRequest) {
  try {
    if (!REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: "Replicate API token not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { seed } = body; // Optional seed for randomness

    const replicate = new Replicate({
      auth: REPLICATE_API_TOKEN,
    });

    // Use a popular image generation model - you can change this to your preferred model
    // Example: stability-ai/stable-diffusion
    const model = "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c1565e08b";

    const input: any = {
      prompt: PROMPT,
      num_outputs: 1,
      aspect_ratio: "1:1", // Square for PFP
      output_format: "png",
    };

    // Add seed if provided for reproducibility
    if (seed !== undefined) {
      input.seed = seed;
    }

    // Generate image
    const output = await replicate.run(model, { input });

    if (!output || !Array.isArray(output) || output.length === 0) {
      throw new Error("No image generated");
    }

    const imageUrl = output[0] as string;

    // Fetch the image to return as buffer
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error("Failed to fetch generated image");
    }

    const imageBuffer = await imageResponse.arrayBuffer();

    // Return image as base64 or buffer
    return NextResponse.json({
      imageUrl,
      imageData: Buffer.from(imageBuffer).toString("base64"),
      seed: seed || null,
    });
  } catch (error: any) {
    console.error("Error generating image:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate image" },
      { status: 500 }
    );
  }
}

