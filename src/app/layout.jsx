import './globals.css';
import { ModalRoot, ToastRoot } from '@/components/ui.jsx';

export const metadata = {
  title: 'GGFacelon',
  description: 'Landmark-based facial analysis: harmony, angularity, dimorphism and features from a front and side photo — analysed in your browser.',
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23111827' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2'/%3E%3Cpath d='M9.5 15a3.5 3.5 0 0 0 5 0'/%3E%3C/svg%3E" },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* plain font link so canvas drawing can use the family names "Manrope" / "Instrument Serif" */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Instrument+Serif&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div id="app">{children}</div>
        <ModalRoot />
        <ToastRoot />
      </body>
    </html>
  );
}
