import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ error?: string }>;

export default async function NewMundialitoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  async function createMundialito(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      redirect("/login");
    }

    const name = (formData.get("name") as string | null)?.trim() ?? "";
    const description =
      (formData.get("description") as string | null)?.trim() || null;

    /**
     * Validacion espejo de la DB (CHECK length(trim(name)) > 0).
     * La DB sigue siendo la fuente de verdad; esto solo evita un round-trip
     * con un error que el usuario puede resolver al instante.
     */
    if (name.length === 0) {
      redirect("/mundialito/new?error=El+nombre+es+obligatorio");
    }

    if (name.length > 100) {
      redirect("/mundialito/new?error=El+nombre+es+demasiado+largo");
    }

    const { data, error } = await supabase
      .from("mundialitos")
      .insert({
        name,
        description,
        owner_id: user.id,
      })
      .select()
      .single();

    if (error || !data) {
      redirect(
        `/mundialito/new?error=${encodeURIComponent(error?.message ?? "Error desconocido")}`,
      );
    }

    redirect(`/mundialito/${data.id}`);
  }

  const { error: errorMessage } = await searchParams;

  return (
    <main
      style={{
        padding: "2rem",
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "system-ui",
      }}
    >
      <h1>Nuevo Mundialito</h1>
      <p style={{ color: "#666" }}>
        Empieza por el nombre. Después vas a agregar participantes e items.
      </p>

      <form action={createMundialito} style={{ display: "grid", gap: "1rem" }}>
        <label style={labelStyle}>
          Nombre
          <input
            name="name"
            type="text"
            placeholder="Mundialito de alfajores"
            maxLength={100}
            required
            autoFocus
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Descripción <span style={{ color: "#999" }}>(opcional)</span>
          <textarea
            name="description"
            placeholder="El mejor alfajor del barrio"
            rows={3}
            style={inputStyle}
          />
        </label>

        <button type="submit" style={buttonStyle}>
          Crear Mundialito
        </button>
      </form>

      {errorMessage && (
        <p style={{ color: "crimson", marginTop: "1rem" }}>{errorMessage}</p>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  fontSize: "1rem",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  fontSize: "0.9rem",
  fontWeight: "500",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.75rem",
  background: "black",
  color: "white",
  border: "none",
  borderRadius: "0.5rem",
  fontSize: "1rem",
  cursor: "pointer",
};