const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validacion de UUID antes de tocar la DB: un id malformado hace
 * fallar a Postgres ("invalid input syntax for type uuid") en vez
 * de devolver 0 filas. Con esto, el caller puede responder un 404
 * claro sin exponer el error crudo.
 */
export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}
