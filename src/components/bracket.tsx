import type { CSSProperties } from "react";
import type { Database } from "@/types/database.types";
import type { MatchTally } from "@/lib/calculations/bracket";

export type BracketMatch = Database["public"]["Tables"]["matches"]["Row"];
export type BracketItem = Database["public"]["Tables"]["items"]["Row"];

type Props = {
  matches: BracketMatch[];
  items: BracketItem[];
  /** Estado del mundialito: ajusta el copy del estado vacío. */
  status?: string;
  /**
   * Votos por cruce (#10). Solo trae los cruces con votos visibles
   * (`matchTallies` deja afuera los demás): ausente = no pintar nada,
   * nunca un 0 inventado.
   */
  tallies?: Record<string, MatchTally>;
};

/**
 * `CSSProperties` no conoce las custom properties, y los conectores se
 * configuran con ellas (altura del codo, color de cada tramo). Se tipa
 * una sola vez en vez de castear en cada uso.
 */
type BracketStyle = CSSProperties & Partial<Record<`--${string}`, string>>;

/**
 * Nombre de la ronda segun la distancia a la FINAL, que es la unica
 * referencia que tiene sentido para alguien que mira un cuadro de copa:
 * "Ronda 3" no le dice nada a nadie, "Cuartos" si.
 */
const roundLabel = (round: number, totalRounds: number): string => {
  switch (totalRounds - round) {
    case 0:
      return "Final";
    case 1:
      return "Semifinal";
    case 2:
      return "Cuartos";
    case 3:
      return "Octavos";
    default:
      return `Ronda ${round}`;
  }
};

/**
 * Presentacion del bracket (modo CRUCES) con las llaves ENFRENTADAS.
 *
 * La ronda 1 se abre en abanico: su mitad de arriba va a la izquierda y
 * la de abajo a la derecha; las rondas siguientes convergen hacia el
 * centro y la final queda en el medio, sola. Es el cuadro clasico de
 * copa, no una lista de rondas una al lado de la otra.
 *
 * Por que esto se alinea solo, sin calcular alturas: cada ronda tiene
 * una potencia de 2 de partidos, asi que el corte por mitad es exacto y
 * `(r, p)` alimenta siempre a `(r+1, piso(p/2))` — o sea que la mitad
 * de arriba de una ronda contiene a la mitad de arriba de la anterior.
 * Con cada columna en `justify-content: space-around`, los centros de
 * las tarjetas quedan equiespaciados y el punto medio de dos hermanas
 * cae EXACTAMENTE sobre el centro de su padre. La geometria del arbol
 * sale de la disposicion, no de aritmetica de offsets — y da exacta
 * con cualquier `gap`, porque el espacio libre se reparte proporcional.
 *
 * Por eso tambien el badge "En votación" es absoluto: si empujara la
 * tarjeta, esa tarjeta seria mas alta que sus hermanas y el arbol se
 * correria. Todas las tarjetas miden lo mismo por construccion: dos
 * filas `min-h-5` con el nombre siempre en una linea via `truncate`.
 * Por lo mismo los labels de ronda van con `whitespace-nowrap`: una
 * columna cuyo encabezado se parta en dos lineas cambia de alto y
 * desalinea el arbol entero.
 *
 * POR QUE EL ALTO DE LA TARJETA ES FIJO: de aca salen los conectores.
 * La distancia entre los centros de dos hermanas es (alto + gap) y se
 * DUPLICA en cada ronda hacia adentro (con `space-around` y `n` tarjetas
 * de igual alto, el espaciado es `step * M / n`, con `M` fijo y `n`
 * partido a la mitad ronda a ronda). Entonces el codo de una tarjeta de
 * la ronda `r` mide `step * 2^(r-2)`: un numero, medible en CSS. Si el
 * alto quedara librado al contenido, el codo se desalinearia en silencio
 * — ni tsc ni eslint ni vitest miran layout.
 *
 * LA LLAVE: cada partido que recibe a dos hijas dibuja las tres patas
 * del empalme desde su propio slot — dos horizontales que van a buscar a
 * cada hija, el codo vertical que las une, y el tallo que sale de la
 * union hacia el partido de la ronda siguiente. Ninguna tarjeta dibuja su
 * salida: la dibuja el partido que la recibe. Una sola vez, sin duplicar
 * y sin depender del ancho de la tarjeta.
 *
 * La final no lleva codo: sus dos hijas (las semis) estan a la misma
 * altura, una a cada lado, asi que su conexion son dos rectas
 * horizontales en vez de un empalme.
 *
 * Componente compartido y sin hooks: lo usan tanto el panel del owner
 * (server component) como la pantalla de votacion (client component).
 * No deriva nada de la DB: recorre `matches` + `items` tal como vienen
 * de Supabase (el README manda "nunca persistir derivados").
 */
export function Bracket({
  matches,
  items,
  status,
  tallies,
}: Props) {
  if (!matches.length) {
    return (
      <p className="hint">
        Todavía no se sorteó el bracket.
        {status === "PARTICIPANTS_LOCKED" && " Ya se puede sortear."}
        {status === "DRAWN" && " Se puede iniciar la votación cuando quieras."}
      </p>
    );
  }

  const itemName = (id: string | null): string => {
    if (!id) return "A definir";
    return items.find((i) => i.id === id)?.name ?? "—";
  };

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const totalRounds = rounds[rounds.length - 1];

  const matchesOf = (round: number): BracketMatch[] =>
    matches
      .filter((m) => m.round === round)
      .sort((a, b) => a.position - b.position);

  /** Para saber si una hija ya se resolvió: es lo que pinta el camino. */
  const matchByKey = new Map(
    matches.map((m) => [`${m.round}:${m.position}`, m]),
  );

  /** `[mitad de arriba, mitad de abajo]` — exacto: la cantidad es par. */
  const halvesOf = (round: number): [BracketMatch[], BracketMatch[]] => {
    const all = matchesOf(round);
    const cut = Math.ceil(all.length / 2);
    return [all.slice(0, cut), all.slice(cut)];
  };

  // La final no se reparte: es una sola y va al centro.
  const sideRounds = rounds.filter((round) => round < totalRounds);

  const slotRow = (id: string | null, won: boolean, votes?: number) => {
    const name = itemName(id);
    const votesLabel = votes === 1 ? "1 voto" : `${votes ?? 0} votos`;
    return (
      <div
        className={`flex min-h-5 items-center justify-between gap-2 text-xs sm:text-sm ${
          won ? "font-semibold text-brand" : id ? "text-fg" : "italic text-subtle"
        }`}
      >
        <span className="min-w-0 truncate" title={name}>
          {name}
        </span>
        {/* El numero de votos va en la MISMA fila: el alto de la tarjeta
            es fijo por construccion (de ahi salen los conectores de la
            copa), y una fila nueva romperia toda la geometria. */}
        {votes !== undefined || won ? (
          <span className="flex flex-none items-center gap-1.5">
            {votes !== undefined ? (
              <span
                className="tabular-nums"
                title={votesLabel}
                aria-label={votesLabel}
              >
                {votes}
              </span>
            ) : null}
            {won ? (
              <span title="Ganador" aria-label="Ganador">
                ✓
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
    );
  };

  const matchCard = (match: BracketMatch, isFinal = false) => {
    const isOpen = match.status === "OPEN";
    const winner = match.winner_item_id;
    // Votos de la ronda vigente, si el caller los trajo (undefined =
    // sin datos visibles: no se pinta nada, ver matchTallies).
    const tally = tallies?.[match.id];
    // Toda tarjeta de ronda > 1 recibe a dos hijas. La final tambien,
    // pero degeneradas: las semis estan a la misma altura.
    const isLink = match.round > 1;
    const hasFork = isLink && !isFinal;

    // `(r, p)` recibe a `(r-1, 2p)` en el slot A y a `(r-1, 2p+1)` en el
    // B. Si esa hija ya tiene ganador, esa pata se pinta con el color de
    // marca: es el camino del campeón dibujándose solo. Para la final,
    // A es la semi de la izquierda y B la de la derecha.
    const childA = isLink
      ? matchByKey.get(`${match.round - 1}:${match.position * 2}`)
      : undefined;
    const childB = isLink
      ? matchByKey.get(`${match.round - 1}:${match.position * 2 + 1}`)
      : undefined;

    const connector: BracketStyle = {};
    if (isLink) {
      if (childA?.winner_item_id) connector["--leg-a"] = "var(--brand)";
      if (childB?.winner_item_id) connector["--leg-b"] = "var(--brand)";
      // El codo y el tallo se encienden recién cuando el partido tiene
      // ganador: son el tramo por el que sale hacia el padre.
      if (childA?.winner_item_id || childB?.winner_item_id) {
        connector["--leg-root"] = "var(--brand)";
      }
    }
    if (hasFork) {
      // Las patas abarcan el hueco entre las dos hijas, que con
      // `space-around` y slots de igual alto es `step * 2^(r-2)`. Exacto.
      connector["--fork-h"] = `calc(var(--bracket-step) * ${2 ** (match.round - 2)})`;
    }

    return (
      <div
        key={match.id}
        style={connector}
        className={[
          "bracket-node",
          hasFork ? "bracket-node--fork" : "",
          isFinal ? "bracket-node--final" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          className={[
            "card relative",
            isFinal ? "bracket-final-node" : "flex h-full flex-col justify-center p-2.5",
            winner !== null ? "bracket-card--won" : "",
            isOpen ? "ring-2 ring-brand" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {isFinal ? <span className="bracket-final-tag">Final</span> : null}

          {isOpen ? (
            <span className="bracket-badge">
              {match.vote_round > 1
                ? `Desempate ${match.vote_round}`
                : "En votación"}
            </span>
          ) : null}

          {slotRow(
            match.item_a_id,
            winner !== null && winner === match.item_a_id,
            tally?.a,
          )}

          <div className="divider my-1" />

          {slotRow(
            match.item_b_id,
            winner !== null && winner === match.item_b_id,
            tally?.b,
          )}
        </div>
      </div>
    );
  };

  const sideColumn = (round: number, side: "left" | "right") => {
    const [top, bottom] = halvesOf(round);

    return (
      <div
        key={`${round}-${side}`}
        className={`bracket-side--${side} flex flex-col gap-3`}
      >
        <p className="eyebrow whitespace-nowrap text-center">{roundLabel(round, totalRounds)}</p>
        {/* `space-around` es el que reparte la columna y centra cada
            tarjeta respecto de sus dos hijas. El gap va por CSS
            (`--node-gap`), no por clase: es el mismo numero que entra en
            la formula del codo. */}
        <div className="bracket-col-body">
          {(side === "left" ? top : bottom).map((match) => matchCard(match))}
        </div>
      </div>
    );
  };

  const totalColumns = sideRounds.length * 2 + 1;

  return (
    <div className="bracket overflow-x-auto pb-2">
      <div
        className="grid items-stretch"
        style={{
          // El gap de la grilla ES `--col-gap`: de ahi sale la union de
          // cada llave. Si se desincronizan, las patas no llegan.
          gap: "var(--col-gap)",
          gridTemplateColumns: `repeat(${totalColumns}, minmax(6.5rem, 1fr))`,
        }}
      >
        {sideRounds.map((round) => sideColumn(round, "left"))}

        {/* El centro: la final, sola. Sus dos hijas (las semis) estan a la
            misma altura, una a cada lado, asi que su conexion son dos
            rectas horizontales en vez de un codo. */}
        <div className="flex flex-col gap-3">
          <p className="eyebrow whitespace-nowrap text-center">
            {roundLabel(totalRounds, totalRounds)}
          </p>
          <div className="bracket-col-body">
            {matchesOf(totalRounds).map((match) => matchCard(match, true))}
          </div>
        </div>

        {/* Lado derecho espejado: la ronda mas interna (semis) queda
            pegada al centro y la ronda 1 en el borde de afuera. */}
        {[...sideRounds].reverse().map((round) => sideColumn(round, "right"))}
      </div>
    </div>
  );
}
