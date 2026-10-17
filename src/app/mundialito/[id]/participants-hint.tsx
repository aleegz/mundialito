type Props = {
  status: string;
  /** modo del mundialito (RANKING | CRUCES): cambia el copy. */
  mode: string;
  /** true si el owner ya figura en la lista (se anota al crear). */
  ownerJoined: boolean;
};

/**
 * Explica COMO entran los participantes. No hay formulario: la lista se
 * arma sola desde el link de votacion, y el owner queda anotado al
 * crear el torneo. Reemplaza al AddParticipantsForm (roster manual en
 * DRAFT), que le daba al owner un trabajo que nadie le pidio.
 *
 * Server Component: es texto, no necesita estado ni JS en el cliente.
 * `ownerJoined` existe para los torneos viejos (creados antes de que el
 * owner se anotara solo): ahi decir "ya estas anotado vos" seria mentira.
 */
export function ParticipantsHint({ status, mode, ownerJoined }: Props) {
  if (status === "DRAFT") {
    return (
      <p className="hint">
        {ownerJoined ? "Ya estás anotado vos." : "Todavía no estás anotado."}{" "}
        El resto se suma con su nombre desde el link{" "}
        {mode === "CRUCES"
          ? "cuando abras la inscripción."
          : "cuando inicies la votación."}
      </p>
    );
  }

  if (status === "ACTIVE") {
    // La lista ya no se precarga: se arma sola mientras vota la gente.
    return (
      <p className="hint">
        No hace falta cargar la lista: quien entra al link de votación se
        registra con su nombre al votar.
      </p>
    );
  }

  if (mode === "CRUCES" && status === "PARTICIPANTS_OPEN") {
    return (
      <p className="hint">
        Los participantes se suman solos desde el link de inscripción.
      </p>
    );
  }

  if (mode === "CRUCES" && status === "PARTICIPANTS_LOCKED") {
    return (
      <p className="hint">
        La inscripción ya está cerrada: desde acá solo se puede excluir a
        alguien de los cruces.
      </p>
    );
  }

  return (
    <p className="hint">
      La lista de participantes no se puede modificar en este estado.
    </p>
  );
}
