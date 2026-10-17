"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";

type Props = {
  itemId: string;
  name: string;
};

/**
 * Borrado de un item durante la etapa de inscripcion.
 * La confirmacion en dos pasos vive en <ConfirmButton>.
 */
export function DeleteItemButton({ itemId, name }: Props) {
  const router = useRouter();

  async function onDelete(): Promise<string | null> {
    const response = await fetch(`/api/items/${itemId}`, { method: "DELETE" });

    // 404 = ya no existe (o no hay permiso). Se trata como borrado
    // efectivo: alcanza con refrescar la lista.
    if (response.status === 404) {
      router.refresh();
      return null;
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return data?.error ?? "No se pudo eliminar.";
    }

    router.refresh();
    return null;
  }

  return (
    <ConfirmButton
      label="Eliminar"
      ariaLabel={`Eliminar ${name}`}
      pendingLabel="Eliminando…"
      tone="danger"
      onConfirm={onDelete}
    />
  );
}
