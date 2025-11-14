import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // For production builds - trace files outside project root
    outputFileTracingRoot: join(__dirname, '../../'),
  },
  // @ts-ignore - turbopack config is not in official types yet
  turbopack: {
    // For development - allow Turbopack to resolve files from parent directory
    root: join(__dirname, '../'),
  },
}

export default nextConfig
