import type { Database } from "@/types/database.types";

type Item = Database["public"]["Tables"]["items"]["Row"];
type Match = Database["public"]["Tables"]["matches"]["Row"];

type Props = {
  status: string;
  matches: Match[];
  items: Item[];
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "—",
  OPEN: "Abierto",
  RESOLVED: "Resuelto",
};

/**
 * Vista de bracket (modo CRUCES). Server component: renderiza las
 * llaves del torneo desde `matches` + `items` tal como vienen de
 * Supabase (sin derivar nada: el README manda "nunca persistir
 * derivados", y aca no hay calculos, solo presentacion).
 *
 * El votante usa la version interactive en /vote/[mundialitoId]
 * (cruces-vote-client); esta vista estatica alcanza para que el
 * owner (o quien mire el link compartido del mundialito) vea el
 * tablero sin sesion.
 */
export function BracketView({ status, matches, items }: Props) {
  if (!matches.length) {
    return (
      <p style={{ color: "#888" }}>
        Todavía no se sorteó el bracket. {status === "PARTICIPANTS_LOCKED" && "El owner puede sortear ahora."}
        {status === "DRAWN" && "Se puede iniciar la votación cuando quieras."}
      </p>
    );
  }

  const itemName = (id: string | null): string => {
    if (!id) return "—";
    return items.find((i) => i.id === id)?.name ?? "—";
  };

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))`,
        gap: "0.5rem",
        marginTop: "0.5rem",
        overflowX: "auto",
      }}
    >
      {rounds.map((round) => {
        const roundMatches = matches
          .filter((m) => m.round === round)
          .sort((a, b) => a.position - b.position);

        return (
          <div key={round} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h3 style={{ margin: 0, fontSize: "0.85rem", color: "#666", textAlign: "center" }}>
              {round === 1 ? "Primera ronda" : round === rounds.length ? "Final" : `Ronda ${round}`}
            </h3>

            {roundMatches.map((match) => {
              const isOpen = match.status === "OPEN";
              const winner = match.winner_item_id;

              return (
                <div
                  key={match.id}
                  style={{
                    border: isOpen ? "2px solid #f59e0b" : "1px solid #ddd",
                    borderRadius: "0.5rem",
                    padding: "0.5rem 0.75rem",
                    background: isOpen ? "#fffbeb" : "white",
                    fontSize: "0.85rem",
                  }}
                >
                  {isOpen && (
                    <small style={{ color: "#b45309", fontWeight: 600 }}>
                      {STATUS_LABEL[match.status]}
                      {match.vote_round > 1 && ` · desempate ${match.vote_round}`}
                    </small>
                  )}

                  <div
                    style={{
                      padding: "0.25rem 0",
                      color: winner === match.item_a_id ? "#047857" : "inherit",
                      fontWeight: winner === match.item_a_id ? 600 : 400,
                    }}
                  >
                    {itemName(match.item_a_id)}
                  </div>

                  <div style={{ color: "#bbb", fontSize: "0.75rem", lineHeight: 1 }}>
                    ─
                  </div>

                  <div
                    style={{
                      padding: "0.25rem 0",
                      color: winner === match.item_b_id ? "#047857" : "inherit",
                      fontWeight: winner === match.item_b_id ? 600 : 400,
                    }}
                  >
                    {itemName(match.item_b_id)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}