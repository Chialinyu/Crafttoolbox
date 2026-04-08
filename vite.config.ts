import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const FIGMA_ASSET_PREFIX = 'figma:asset/'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    enforce: 'pre' as const,
    resolveId(source: string) {
      if (!source.startsWith(FIGMA_ASSET_PREFIX)) {
        return null
      }

      const rawAssetPath = source.slice(FIGMA_ASSET_PREFIX.length)
      const [assetFileName, query = ''] = rawAssetPath.split('?')
      const candidates = [
        path.resolve(__dirname, 'src/assets/figma', assetFileName),
        path.resolve(__dirname, 'src/assets', assetFileName),
      ]
      const resolved = candidates.find((candidate) => fs.existsSync(candidate))

      if (resolved) {
        return query ? `${resolved}?${query}` : resolved
      }

      throw new Error(
        `[figma-asset-resolver] Missing asset "${assetFileName}". ` +
          `Expected file at src/assets/${assetFileName} or src/assets/figma/${assetFileName}.`,
      )
    },
  }
}

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project from /Crafttoolbox/ in production.
  base: command === 'build' ? '/Crafttoolbox/' : '/',
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    figmaAssetResolver(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
