#!/usr/bin/env node

/**
 * Build script for Catan LAN game.
 *
 * Bundles the 3D renderer and its dependencies (including Three.js) into a
 * single file for production deployment. This allows the game to run on a
 * LAN without requiring internet access or serving many individual module files.
 *
 * Usage: node scripts/build.js
 *
 * Output:
 *   apps/server/public/build/3d.bundle.js      - ES module bundle
 *   apps/server/public/build/3d.bundle.js.map  - Source map for debugging
 */

import * as esbuild from "esbuild";
import { mkdir, rm, cp, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "apps", "server", "public");
const buildDir = path.join(publicDir, "build");
const sharedDir = path.join(publicDir, "shared");

/**
 * esbuild plugin to resolve bare "/shared/..." and "/vendor/three/..." imports
 * to their actual file paths.
 */
function resolveImportsPlugin() {
  return {
    name: "resolve-imports",
    setup(build) {
      // Resolve /shared/... imports to apps/server/public/shared/...
      build.onResolve({ filter: /^\/shared\// }, (args) => {
        const relativePath = args.path.slice("/shared/".length);
        return { path: path.join(sharedDir, relativePath) };
      });

      // Resolve /vendor/three/... imports to node_modules/three/build/...
      build.onResolve({ filter: /^\/vendor\/three\// }, (args) => {
        const relativePath = args.path.slice("/vendor/three/".length);
        return { path: path.join(rootDir, "node_modules", "three", "build", relativePath) };
      });
    }
  };
}

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

async function cleanBuildDir() {
  try {
    await rm(buildDir, { recursive: true, force: true });
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  await ensureDir(buildDir);
}

async function copyThemesIfExists() {
  // Future: copy theme assets to public/build/themes/
  const themesSourceDir = path.join(publicDir, "themes");
  const themesDestDir = path.join(buildDir, "themes");

  try {
    const themesInfo = await stat(themesSourceDir);
    if (themesInfo.isDirectory()) {
      await cp(themesSourceDir, themesDestDir, { recursive: true });
      console.log("  Copied themes to build/themes/");
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("  Warning: Could not copy themes:", err.message);
    }
    // themes directory doesn't exist yet, that's fine
  }
}

async function bundle3D() {
  const entryPoint = path.join(sharedDir, "board-3d.js");

  console.log("  Bundling board-3d.js with Three.js...");

  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    outfile: path.join(buildDir, "3d.bundle.js"),
    sourcemap: true,
    minify: true,
    target: ["es2020", "chrome90", "firefox88", "safari14", "edge90"],
    plugins: [resolveImportsPlugin()],
    // Tree-shake unused Three.js exports
    treeShaking: true,
    // Keep function/class names for better debugging
    keepNames: true,
    // Mark as side-effect free for better tree-shaking
    metafile: true,
    logLevel: "warning"
  });

  // Report bundle size
  if (result.metafile) {
    const outputs = result.metafile.outputs;
    for (const [file, info] of Object.entries(outputs)) {
      if (!file.endsWith(".map")) {
        const sizeKB = (info.bytes / 1024).toFixed(1);
        console.log(`  Output: ${path.basename(file)} (${sizeKB} KB)`);
      }
    }
  }

  return result;
}

async function main() {
  const startTime = Date.now();
  console.log("Building Catan LAN for production...\n");

  try {
    console.log("1. Cleaning build directory...");
    await cleanBuildDir();

    console.log("2. Bundling 3D renderer...");
    await bundle3D();

    console.log("3. Copying theme assets...");
    await copyThemesIfExists();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nBuild completed in ${elapsed}s`);
    console.log(`Output: ${buildDir}`);
    console.log("\nTo run in production mode:");
    console.log("  npm start");
  } catch (err) {
    console.error("\nBuild failed:", err.message);
    process.exit(1);
  }
}

main();
