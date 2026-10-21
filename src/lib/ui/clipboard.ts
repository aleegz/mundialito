/**
 * Copia texto al portapapeles.
 *
 * `navigator.clipboard` solo existe en contextos seguros (`https` o
 * `localhost`): el celular entrando por IP de la red local NO lo tiene,
 * que es justo el escenario de probar esto. Cuando falta, se usa el
 * `textarea` + `execCommand("copy")` de toda la vida.
 *
 * Devuelve `true` si copio; `false` si no hubo forma (el caller decide
 * como avisar — nunca mentir con un "copiado" que no copio).
 *
 * Vive en lib/ui porque toca `navigator`/`document`: no es logica pura,
 * pero si una sola implementacion para los dos que copian.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const copied = document.execCommand("copy");
    textArea.remove();

    return copied;
  } catch {
    return false;
  }
}
