export const metadata = {
  title: 'Flow Studio',
  description: 'MVP estilo n8n/Miro con React Flow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: '#0b1020', color: '#E5E7EB', fontFamily: 'Inter, ui-sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
