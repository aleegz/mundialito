import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function RlsTestPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const userId = user.id;
  const results: Record<string, unknown> = {};
  results["1_usuario"] = user.email;

  const { data: own, error: ownErr } = await supabase
    .from("mundialitos")
    .select("*");
  results["2_leer_mis_mundialitos"] = {
    error: ownErr?.message ?? null,
    count: own?.length ?? 0,
  };

  /**
   * La insertion vive en una Server Action: el render de un Server
   * Component debe ser puro, y generar el nombre con un contador aleatorio
   * durante el render viola esa regla (react-hooks/purity).
   */
  async function createTestMundialito() {
    "use server";
    const supabase = await createClient();
    const suffix = crypto.randomUUID().slice(0, 8);
    return supabase
      .from("mundialitos")
      .insert({ name: `Mundialito test ${suffix}`, owner_id: userId })
      .select();
  }

  const { data: created, error: createErr } = await createTestMundialito();
  results["3_crear_mundialito_propio"] = {
    error: createErr?.message ?? null,
    created: created?.length ?? 0,
  };

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>RLS Test</h1>
      <pre>{JSON.stringify(results, null, 2)}</pre>
    </main>
  );
}