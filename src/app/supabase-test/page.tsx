import { createClient } from '@/lib/supabase/server'

export default async function SupabaseTestPage() {
  const supabase = await createClient()

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Supabase Connection Test</h1>
      <pre>
        {JSON.stringify(
          {
            connected: !error,
            error: error ? { message: error.message } : null,
            hasSession: !!session,
          },
          null,
          2
        )}
      </pre>
      {!error && <p>✅ Conexión exitosa con Supabase</p>}
      {error && <p>❌ Falló la conexión: {error.message}</p>}
    </main>
  )
}