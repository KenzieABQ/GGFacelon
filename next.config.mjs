// Static export: the whole app runs in the browser (photos never leave the device), so it can be hosted
// anywhere static — Vercel, GitHub Pages, or `npx serve out`. NEXT_PUBLIC_BASE_PATH serves it from a sub-path.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export default {
  output: 'export',
  distDir: process.env.NEXT_DIST_DIR || '.next', // lets a production build run beside `next dev`
  basePath,
  images: { unoptimized: true },
  reactStrictMode: true,
  trailingSlash: true,
};
