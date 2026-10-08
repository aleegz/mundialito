import { VoteModeSwitch } from "./vote-mode-switch";

type Params = Promise<{ mundialitoId: string }>;

/**
 * Superficie del votante (link abierto, Opcion A). El proxy no
 * protege /vote: solo /mundialito y /rls-test requieren sesion.
 * Toda la carga de datos pasa por el browser client anonimo.
 * El enrutador por modo (VoteModeSwitch) elige la superficie:
 * RANKING usa VoteClient; CRUCES usa CrucesVoteClient.
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
      <VoteModeSwitch mundialitoId={mundialitoId} />
    </main>
  );
}
