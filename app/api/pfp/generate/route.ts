import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Hardcoded base prompt
const BASE_PROMPT = "front facing pfp of a deepsea diver, dystopic graphic novel style, optimistic, looking up";

export async function POST(request: NextRequest) {
  try {
    // Generate random seed for variation
    const seed = Math.floor(Math.random() * 1000000);
    
    // Add slight variations to the prompt for uniqueness
    const variations = [
      "with subtle color variations",
      "with unique lighting",
      "with distinct facial features",
      "with varied expression",
      "with different color palette",
    ];
    const variation = variations[Math.floor(Math.random() * variations.length)];
    const prompt = `${BASE_PROMPT}, ${variation}`;

    console.log(`[pfp/generate] Generating image with prompt: ${prompt}, seed: ${seed}`);

    // Use a stable diffusion model for image generation
    // You may need to adjust the model based on what's available on Replicate
    const output = await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      {
        input: {
          prompt: prompt,
          seed: seed,
          num_outputs: 1,
          aspect_ratio: "1:1", // Square for PFP
          output_format: "png",
          output_quality: 90,
        },
      }
    ) as string[];

    if (!output || output.length === 0 || !output[0]) {
      throw new Error("No image generated from Replicate");
    }

    const imageUrl = output[0];
    console.log(`[pfp/generate] Image generated successfully: ${imageUrl}`);

    return NextResponse.json({
      imageUrl,
      prompt,
      seed,
    });
  } catch (error) {
    console.error("[pfp/generate] Error generating image:", error);
    return NextResponse.json(
      {
        error: "Failed to generate image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



