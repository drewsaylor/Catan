#!/usr/bin/env node
/**
 * One-time script to crop logo.png to its visible content bounds.
 * Removes transparent padding from all edges.
 */

import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logoPath = join(__dirname, "../apps/server/public/shared/icons/logo-wide.png");

async function cropLogo() {
  console.log("Reading logo.png...");

  const image = sharp(logoPath);
  const metadata = await image.metadata();

  console.log(`Original dimensions: ${metadata.width}x${metadata.height}`);

  // Use sharp's trim() to remove transparent pixels from edges
  const trimmed = await image
    .trim()
    .toBuffer();

  // Get the new dimensions
  const trimmedImage = sharp(trimmed);
  const trimmedMetadata = await trimmedImage.metadata();

  console.log(`Cropped dimensions: ${trimmedMetadata.width}x${trimmedMetadata.height}`);

  // Save the cropped image
  await trimmedImage.toFile(logoPath);

  console.log(`Saved cropped logo to ${logoPath}`);
}

cropLogo().catch(err => {
  console.error("Error cropping logo:", err);
  process.exit(1);
});
