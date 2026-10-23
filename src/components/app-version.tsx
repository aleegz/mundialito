import packageJson from "../../package.json";

/**
 * Version de la app, en chiquito y sin ruido.
 *
 * Sale de `package.json` (unica fuente): se muestra como `v0.1.0` debajo
 * del login y del home para tenerla a mano cuando se prueba en el celular.
 *
 * OJO — lo que esta version NO dice: no prueba por si sola que un cambio
 * llego a produccion. `package.json` no se actualiza solo; hay que
 * bumpear `version` a mano al mergear. Si eso se vuelve una molestia, el
 * paso siguiente es sumarle el hash de commit del build (`VERCEL_GIT_
 * COMMIT_SHA`) al lado, que es automatico.
 *
 * Server component: lee el JSON en el servidor y manda solo el string
 * pelado al cliente, nunca el archivo entero.
 */
export function AppVersion() {
  return (
    <p className="text-xs text-subtle" aria-label="Versión de la aplicación">
      v{packageJson.version}
    </p>
  );
}
