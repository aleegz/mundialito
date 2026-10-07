import { VoteClient } from "./vote-client";

type Params = Promise<{ mundialitoId: string }>;

/**
 * Superficie del votante (link abierto, Opcion A). El proxy no
 * protege /vote: solo /mundialito y /rls-test requieren sesion.
 * Toda la carga de datos pasa por el browser client anonimo.
 */
export default async function VotePage({ params }: { params: Params }) {
  const { mundialitoId } = await params;

  return (
    <main
      style={{
        padding: "2rem",
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "system-ui",
      }}
    >
      <VoteClient mundialitoId={mundialitoId} />
    </main>
  );
}
