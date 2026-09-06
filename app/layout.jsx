import './globals.css';
import PWA from '@/components/PWA';

export const metadata = {
  title: 'Oudie',
  description: 'Hlasový asistent a tým osmnácti agentů.',
  applicationName: 'Oudie',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Oudie', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: ['/favicon.ico'],
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: '#05070c',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // The canvas fills the screen and there is nothing to read at 2x, so
  // pinch-zoom would only ever be an accident.
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="cs">
      <body>
        {children}
        <PWA />
      </body>
    </html>
  );
}
