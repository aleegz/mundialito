"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";

type Props = {
  participantId: string;
  displayName: string;
  /** estado actual del participante (JOINED | EXCLUDED). */
  currentStatus: string;
};

/**
 * Excluir / re-incluir un participante durante el torneo CRUCES.
 * Solo el owner (RLS lo refuerza en el server). Excluir a alguien que
 * nunca vota permite cerrar el cruce (el gate de finalizacion cuenta
 * solo activos); re-incluirlo lo devuelve al juego.
 *
 * La confirmacion en dos pasos vive en <ConfirmButton>; el tono cambia
 * segun la direccion de la accion (excluir = destructivo).
 */
export function ToggleParticipantStatusButton({
  participantId,
  displayName,
  currentStatus,
}: Props) {
  const router = useRouter();

  const excluding = currentStatus === "JOINED";
  const actionLabel = excluding ? "Excluir" : "Re-incluir";

  async function onToggle(): Promise<string | null> {
    try {
      const response = await fetch(
        `/api/participants/${participantId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: excluding ? "EXCLUDED" : "JOINED" }),
        },
      );

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        return data?.error ?? "No se pudo actualizar.";
      }

      router.refresh();
      return null;
    } catch {
      return "No se pudo actualizar.";
    }
  }

  return (
    <ConfirmButton
      label={actionLabel}
      ariaLabel={`${actionLabel} a ${displayName}`}
      pendingLabel="Actualizando…"
      tone={excluding ? "danger" : "brand"}
      onConfirm={onToggle}
    />
  );
}
