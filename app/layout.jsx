import './globals.css';

export const metadata = {
  title: 'Oudie',
  description: 'Particle bust — assembly, listening and speaking states.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
