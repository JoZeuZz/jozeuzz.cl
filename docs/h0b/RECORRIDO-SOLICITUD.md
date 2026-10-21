# Recorrido de la solicitud de servicio técnico (F2) — jozeuzz.cl

> **Estado:** Propuesta (H0-b, 2026-10-21). No aprobado.
> **Autor:** jz-architect, unidad U4 de H0-b, rama `work/jozeuzz-autonomo` sobre `45af7a5`. No contiene datos reales.
> **Etiquetas:** **[Definido]** lo fija una fuente citada · **[Propuesto]** recomendación sin aprobar · **[Pendiente]** decide el responsable · **[POC]** comportamiento leído en el código de `poc1a/` (desechable, no es scaffold, H0A-14), no verificado en ejecución salvo que se indique.
> **Abreviaturas:** `RM` = [ROADMAP-MVP.md](../ROADMAP-MVP.md) · `ESP` = [ESPECIFICACION-FUNCIONAL.md](../ESPECIFICACION-FUNCIONAL.md) · `REG` = [REGISTRO-DECISIONES-H0A.md](../REGISTRO-DECISIONES-H0A.md) · `P3` = [PLAN-POC-3.md](../PLAN-POC-3.md) · `DIS` = [POC-3-DISENO.md](../POC-3-DISENO.md) · `GATE` = [GATE-DOCKER-POC-3.md](../GATE-DOCKER-POC-3.md) · `EST` = [ESTADO-PROYECTO.md](../ESTADO-PROYECTO.md) · `PROD` = [PRODUCTO.md](../PRODUCTO.md) · `WIREFRAMES` = [WIREFRAMES.md](WIREFRAMES.md) · `INVENTARIO` = [INVENTARIO-CONTENIDO.md](INVENTARIO-CONTENIDO.md). Las citas a la POC van como `archivo:línea` relativas a `poc1a/src/`.

**Propósito.** Completa lo que WIREFRAMES › §3.6 y §3.10 dejan a este documento: campos, estados, errores, aviso de privacidad y confirmación de `/servicios/solicitar` (MVP-06, H4). No remodela la Solicitud: estados, observaciones y eventos son H0A-02 a H0A-04 (INVENTARIO › §3.7). Los textos de interfaz son borradores A→R (V-09); el tratamiento «tú» de los borradores sigue a la POC y depende de DC-13.

## 1. Alcance y límites

**Qué es una Solicitud [Definido].** Un pedido de revisión técnica que el visitante deja sin cuenta: identificación y contacto, equipo, descripción y, si quiere, un servicio activo (RF-06; ESP › §5). El servidor le asigna el estado `recibida` (H0A-02; RM › INV-06). **No es una reserva ni una orden de trabajo** (RM › INV-10; PROD › Reglas fundamentales, 4): el formulario no ofrece fechas, horarios, presupuesto ni aceptación de condiciones, y ningún texto habla de «reservar», «agendar» u «orden».

**Qué no hace [Definido salvo indicación].**

| Fuera de alcance | Fuente |
|---|---|
| Seguimiento público del estado, número de solicitud consultable o consulta por correo | F2, paso 5; PROD › Reglas fundamentales, 1; RM › INV-13 |
| Cuenta, inicio de sesión o contraseña del solicitante | MVP-06.9; ESP › §6 «Privacidad» |
| Adjuntos (fotos, documentos) | RF-06 sólo pide identificación, equipo y descripción [Deducido]; no hay almacenamiento previsto para ellos |
| Notificaciones automáticas (al administrador o al solicitante), correo de confirmación incluido | H0A-06, que resuelve C-07 (EST › §3) |
| Edición o retirada de la solicitud por el solicitante | F2; F4 (sólo el administrador gestiona) |
| Campos de estado, notas, precio, presupuesto, auditoría o id | RM › INV-05 [Definido]; MVP-06.2. Rechazar en vez de ignorar: [Propuesto] para el producto, con P3-03 como evidencia de la POC |

Discrepancia documental, sin corregir aquí: MVP-06.12 sigue escrito como [Pendiente] (C-07), aunque H0A-06 ya lo resuelve para el MVP. La corrección de RM es ajena a U4.

## 2. Recorrido paso a paso

1. **Entrada [Propuesto sobre WIREFRAMES › §3.5].** Desde «Solicitar revisión» de `/servicios` (sin preselección), desde «Solicitar: `<nombre>`» de una tarjeta (`/servicios/solicitar?servicio=<slug>`), desde INI-06, desde CON-02 o directamente. El parámetro `servicio` es único y sólo lleva un slug: el servidor lo compara con los servicios activos; si es desconocido, inactivo, repetido o malformado se ignora en silencio y la página es idéntica a la que se sirve sin parámetro, salvo el valor del token y de la cookie `__Host-intake`. Con el slug de un servicio activo se preselecciona exactamente esa opción [Propuesto]. El `GET` ignora cualquier otro parámetro (§8). Sin servicios activos, el campo «Servicio» no se muestra y el formulario sigue disponible (SER-07 enlaza aquí).
2. **Formulario (WIREFRAMES › §3.6).** Migas, `h1`, introducción SOL-01, campos de §3, aviso de privacidad (§4) inmediatamente antes del botón «Enviar solicitud» (A→R).
3. **Envío.** `POST` `application/x-www-form-urlencoded` al endpoint del intake, sin JavaScript (P3-08; en la POC, la acción `/api/intake` está en `lib/intake/html.ts:34` y el tipo se acepta en `lib/intake/manejador.ts:84`). La ruta definitiva se fija en H4.
4. **Respuesta [Propuesto].** Válido: `303` a la confirmación fija (§6). Rechazo por validación (§3), tiempo mínimo (si RS-05 = a), cualquier `csrf_invalido` con origen válido (si RS-08 = a), un límite decidido tras verificar el origen y el CSRF, o un `5xx` posterior a esa verificación: la misma página con el resumen de errores y los campos repoblados (§7). Rechazo por `campos_no_permitidos`, origen inválido, `413`, `415`, cuerpo inválido o trampa: respuesta genérica, sin repoblar y con token nuevo (§5.2). Nunca se refleja una clave distinta de las cinco de §3.
5. **Después [Definido salvo indicación].** La Solicitud queda en `recibida` y aparece en la bandeja del administrador (F4; [PANEL-ADMIN.md](PANEL-ADMIN.md)). No hay aviso automático (H0A-06): el tiempo de respuesta depende de la revisión manual y no se promete (§6). El solicitante no tiene seguimiento; la respuesta llega fuera del sistema por el contacto indicado [Propuesto]. Un duplicado no detectado se cierra con `motivo_cierre = duplicada` (H0A-02).

### 2.1 Estados de la interfaz

```text
 GET (± ?servicio=<slug>)
        |
        v
    INICIAL --escribe--> EDITANDO --Enviar--> ENVIANDO --303--> EXITO (confirmacion fija, §6)
                            ^                    |   \--doble clic: mismo token -> mismo 303
                            |                    +--400 campos ---------> ERROR POR CAMPO
                            |                    +--400 demasiado rapido -> REVISAR Y REENVIAR
                            |                    +--403 caducado/pestana -> FORMULARIO CADUCADO
                            |                    +--429 -----------------> LIMITE SUPERADO
                            |                    +--5xx o sin respuesta --> ERROR DE RED / SERVIDOR
                            |                    +--abuso (paso 4) -------> RESPUESTA GENERICA, sin repoblar
                            +---- formulario repoblado, foco al resumen, REINTENTO <----+
```

La columna «Con JS» sólo aplica si RS-02 = (b). Sin JavaScript es el comportamiento base y obligatorio (MVP-14.4; WIREFRAMES › §3.10).

**Sin caché [Propuesto].** La ruta del formulario se genera en cada petición, nunca de forma estática ni con ISR, y ninguna caché compartida (proxy, CDN) la almacena: cada `GET` emite su propio token y su propia cookie (RS-P20).

| Estado | Disparador | Sin JS (base) [Propuesto] | Con JS (RS-02 b) [Propuesto] | En la POC |
|---|---|---|---|---|
| Inicial | `GET` | Formulario vacío o con el servicio preseleccionado; generado en cada petición; `Cache-Control: no-store, private`; token de un solo formulario en campo oculto y cookie | Igual | `lib/intake/formulario.ts:7-15`; sin preselección (`lib/intake/html.ts:29`) |
| Editando | La persona escribe | Sin validación mientras escribe: los errores se muestran al enviar (3.3.1) | Igual; contador de caracteres opcional sólo en la descripción, anunciado de forma moderada (`aria-live="polite"`, con retardo) | Sin JS (`lib/intake/formulario.ts:7`, CSP `default-src 'none'`) |
| Enviando | Pulsar «Enviar» | Indicador de carga del navegador | Botón con `aria-disabled="true"` (no `disabled`, para no perder el foco), texto «Enviando…» en una región `role="status"`; clics adicionales ignorados | — |
| Error por campo | `400 datos_invalidos` | Página con el `title` fijo «Error: revisa el formulario» (sin valores), resumen enfocado, mensaje específico por campo, campos repoblados (§7) y el token según §5.2 | Igual, sin recarga, con foco al resumen | Resumen `role="alert"` y foco al primer campo erróneo (`lib/intake/html.ts:22,33`); mensaje genérico (`:24`); sin repoblar (`:30`) |
| Revisar y reenviar | Envío antes del tiempo mínimo | Mensaje recuperable con datos repoblados y el mismo token verificado (RS-05; §5.2) | Igual | Rechazo genérico «Vuelve a cargar el formulario» sin datos (`lib/intake/manejador.ts:94`; `lib/intake/html.ts:7`) |
| Formulario caducado | `403 csrf_invalido` con origen válido (token caducado, dos pestañas, token ausente o firma rota; todos siguen RS-08) | Mensaje «el formulario caducó…», token nuevo, nunca el del cuerpo (§5.2); datos repoblados sólo si el origen fue válido y RS-08 = (a) | Igual | Mensaje claro, sin datos (`lib/intake/html.ts:11`; caducidad `lib/intake/token.ts:6`; DIS › §12, 1) |
| Límite superado | `429` con `Retry-After` | Mensaje comprensible (RS-06), sin registro. Se repuebla sólo si el origen y el CSRF de ese envío se verificaron (y el token se trata según §5.2); el `429` decidido antes responde sin repoblar y con token nuevo | Igual | Mensaje (`lib/intake/html.ts:8`); `Retry-After` (`lib/intake/manejador.ts:52`); sin repoblar; el `429` de intentos se decide antes del origen y del CSRF (`lib/intake/manejador.ts:75,79-81`) |
| Error de red | Sin respuesta | Página de error del navegador; al volver, los datos pueden no estar (la página es `no-store`) [Pendiente de verificar por navegador]. Reenviar el mismo formulario es idempotente con D-09 (a) o (c) | Mensaje `role="alert"` «No se pudo enviar. Revisa tu conexión e inténtalo de nuevo» (A→R), datos intactos, reintento con el mismo token | Idempotencia por token (`lib/intake/persistir.ts:22-23`) |
| Error del servidor | `5xx` | Página HTML (nunca JSON) con mensaje genérico sin datos técnicos (ERR-02). Si el error ocurrió tras verificar el origen y el CSRF: datos repoblados y **el mismo token** (§5.2); si no, sin repoblar y con token nuevo | Igual | Token nuevo en cada respuesta de error (`lib/intake/formulario.ts:11`). Sin configuración, o si falla la página de error, responde JSON (`lib/intake/manejador.ts:109` y `:112`): brecha, el producto exige HTML en todo `5xx` |
| Éxito | `303` | Confirmación fija (§6) | Navegar a la misma confirmación | `303` a `/solicitar?estado=recibida` (`lib/intake/manejador.ts:102`) |
| Doble clic | Dos `POST` con el mismo token | Un registro; ambas respuestas, el mismo `303` | El segundo clic no envía | `lib/intake/persistir.ts:22-23`; `lib/intake/manejador.ts:100-102` |
| Reintento | Tras cualquier error | Con el mismo token: sin duplicado. Recargar la página y reenviar tras un éxito sí crea otro registro (limitación de D-09) | Igual | GATE › «Decisiones humanas que bloquean el cierre», D-09 |
| Sin JavaScript | Siempre | Es la base de esta tabla | — | `x-www-form-urlencoded` aceptado (P3-08; `lib/intake/manejador.ts:84`) |

## 3. Campos

**Reglas comunes [Propuesto].** Etiqueta visible con `<label for>`; «Obligatorio» u «Opcional» en texto dentro de la ayuda; atributo `required` en los obligatorios para que la tecnología de apoyo lo anuncie, con `novalidate` en el formulario para que la validación y los mensajes sean siempre los del servidor (la POC ya usa `novalidate`, `lib/intake/html.ts:34`). **Sin `maxlength`:** el navegador cuenta unidades UTF-16 y el servidor cuenta code points (P3-04; `lib/solicitudes.ts:36`), así que `maxlength` bloquearía textos que el servidor acepta (120 emoji, DIS › §12, 3) y truncaría en silencio lo pegado; el límite se comunica en la ayuda y lo valida el servidor. Cada texto de ayuda tiene como máximo 80 caracteres. Las claves desconocidas o repetidas se rechazan (`lib/solicitudes.ts:14,31`; `lib/intake/cuerpo.ts:54`).

**Caracteres admitidos [Propuesto].** El servidor normaliza cada valor a NFC antes de contar y de guardar. Rechaza con «Contiene caracteres no admitidos.» (A→R; el mismo mensaje en todos los casos, sin nombrar el carácter) un valor que contenga:

- controles C0 y C1 o DEL, salvo tabulación, salto de línea y retorno de carro en `descripcion`;
- caracteres de formato bidireccional: U+202A–U+202E, U+2066–U+2069, U+200E, U+200F y U+061C;
- U+2028 o U+2029 en los campos de una línea;
- una cadena mal formada (sustitutos sueltos o UTF-8 inválido).

Un valor formado sólo por espacios o caracteres invisibles (`\p{White_Space}`, `\p{Cf}`, `\p{Default_Ignorable_Code_Point}`, U+2800, U+3164) cuenta como vacío. La POC sólo rechaza NUL y usa `trim()` (`lib/solicitudes.ts:36`). El panel muestra cada valor aislado (`<bdi>` o `dir="auto"`); esa regla se traslada a [PANEL-ADMIN.md](PANEL-ADMIN.md).

| Campo | Propósito y minimización (ESP › §6) | Oblig. | Límite (POC) | Control | Atributos HTML [Propuesto] | Validación en servidor | Mensajes borrador (A→R) |
|---|---|---|---|---|---|---|---|
| `nombre` | Dirigirse a la persona al responder. Basta un nombre de pila o un alias; no se verifica identidad | Sí | ≤ 120 code points (`lib/solicitudes.ts:16`) | `input type="text"` | `autocomplete="name"` (WCAG 1.3.5); `required`; sin `inputmode`; sin `maxlength` | Cadena, no vacía, sin caracteres no admitidos, ≤ 120 | Vacío: «Escribe tu nombre.» · Largo: «El nombre puede tener como máximo 120 caracteres.» |
| `contacto` | Único medio para responder: no hay cuenta ni seguimiento. **Forma pendiente: RS-01** | Sí | ≤ 200 (`lib/solicitudes.ts:17`) | Campo único: `input type="text"`; separado: `type="email"` y `type="tel"` | Único: sin `autocomplete` específico (no hay un token que cubra correo o teléfono). Separado: `autocomplete="email"` / `autocomplete="tel"` e `inputmode="email"` / `inputmode="tel"`; sin `maxlength` | Cadena, no vacía, sin caracteres no admitidos, ≤ 200. Sin validación de formato mientras RS-01 no se decida | Vacío: «Indica cómo responderte.» · Largo: «El contacto puede tener como máximo 200 caracteres.» |
| `tipo_equipo` | Saber de qué equipo se trata antes de responder | Sí | ≤ 120 (`lib/solicitudes.ts:18`) | Texto libre o lista cerrada según DC-09 y SOL-06 | Sin token de `autocomplete` aplicable; `required`; sin `maxlength` | Cadena, no vacía, sin caracteres no admitidos, ≤ 120 (o valor de la lista, si DC-09 la adopta) | Vacío: «Indica qué equipo necesita revisión.» · Largo: «… como máximo 120 caracteres.» |
| `descripcion` | Entender el problema; es el núcleo de la solicitud | Sí | ≤ 4000 (`lib/solicitudes.ts:19`) | `textarea` | `required`; sin `maxlength`; ayuda (75 caracteres): «Qué pasa y desde cuándo. No incluyas contraseñas, PIN ni datos de terceros.» (MVP-06.9) | Cadena, no vacía, sin caracteres no admitidos, ≤ 4000 | Vacío: «Describe el problema.» · Largo: «La descripción puede tener como máximo 4.000 caracteres.» |
| `servicio` | Orientar la revisión; opcional para no forzar una elección | No | Slug `[a-z0-9-]`, ≤ 80 (`lib/solicitudes.ts:21,42`) | `select` con «Sin preferencia» primero; sólo servicios activos (`lib/intake/html.ts:25,29`) | Sin `required`; opción preseleccionada según §2, paso 1. Al repoblar, se preselecciona el enviado sólo si sigue activo; si no, «Sin preferencia». Nunca se añade como opción el valor enviado | Vacío = sin servicio; si no, slug válido de un servicio **activo** en el momento del `POST` (`lib/intake/manejador.ts:97-98`; RM › INV-04). Desconocido, mal formado o inactivo: mismo mensaje y mismo código [Propuesto] | «El servicio elegido ya no está disponible. Elige otro o “Sin preferencia”.» No nombra el servicio |

**Lo que no se pide [Propuesto].** Dirección, RUT, número de serie, fecha preferida (sugiere una reserva, INV-10), contraseñas o PIN, fotos y adjuntos. Cada campo nuevo exige justificarlo aquí. Los campos ocultos `token` y la trampa de §5 no son datos de la persona.

**Mensaje por motivo [Propuesto].** La POC devuelve sólo la lista de campos inválidos, sin el motivo (`lib/solicitudes.ts:33-39`), y la interfaz muestra «Error: campo inválido.» (`lib/intake/html.ts:24`), lo que no cumple 3.3.3. El producto distingue al menos «vacío» y «demasiado largo» por campo; los caracteres no admitidos llevan el mensaje genérico de las reglas comunes. «Caracteres» en los mensajes equivale a code points; un emoji compuesto cuenta más de uno (DIS › §12, 3).

## 4. Aviso de privacidad (RF-13; brecha de la POC)

La POC no tiene aviso ni enlace (`lib/intake/html.ts:34`; EST › §7). RF-13 lo exige «accesible desde formularios» y MVP-06.8 lo hace criterio de aceptación.

- **Ubicación [Propuesto].** Un párrafo (componente AvisoPrivacidad, WIREFRAMES › §4) inmediatamente antes del botón de envío, dentro del formulario, más un recordatorio en SOL-01. El botón lleva `aria-describedby` hacia el aviso, para que se anuncie al enfocarlo. Sin aviso aprobado, el formulario no se publica (WIREFRAMES › §4).
- **Enlace.** A `/privacidad` (PRI-01), con texto que describe el destino. Abrirlo en la misma pestaña puede hacer perder lo escrito, porque la página es `no-store`; cómo se abre es RS-04.
- **Texto borrador (A→R) [Pendiente de texto legal].** Ejemplo ilustrativo, no legal; el texto lo aporta R como SOL-04: «Usaremos estos datos sólo para responder a tu solicitud. Lee cómo los tratamos y cuánto tiempo los guardamos en la política de privacidad.» Ningún agente lo redacta como definitivo (V-08; MVP-08.3). No afirma plazos de retención: dependen de H0A-11. La finalidad la confirma el responsable junto con RS-03; el agente no la fija.

**Aviso informativo frente a casilla de consentimiento.** Un **aviso** informa del tratamiento y no exige ninguna acción: no añade campos ni errores. Una **casilla de consentimiento** registra un acto afirmativo: debe estar desmarcada por defecto, tener su propia etiqueta y su error si es obligatoria, y conservar qué versión del texto se aceptó y cuándo, lo que añade datos a la Solicitud. Cuál corresponde depende de la base legal del tratamiento, que fija el responsable: **RS-03**, sin recomendación.

## 5. Antiabuso y duplicados vistos desde la UX

### 5.1 Lo implementado en la POC y su evidencia

| Control | Código [POC] | Efecto para la persona | Accesibilidad |
|---|---|---|---|
| Campo trampa `sitio_web` | Oculto fuera de pantalla, `aria-hidden`, `tabindex="-1"`, `autocomplete="off"` (`lib/intake/html.ts:34`); con valor → `400 envio_rechazado` (`lib/intake/manejador.ts:93`) | Invisible. Riesgo: un autorrelleno del navegador que lo complete produce un falso positivo con un mensaje genérico [Pendiente de verificar]; `sitio_web` y «Sitio web» se parecen a un campo de URL. Propuesta: contenedor con `aria-hidden="true"` e `inert`; `name`, `id` y etiqueta sin parecido con ningún token de autorrelleno; nunca un falso éxito (respuesta genérica de §2, paso 4) | No llega al lector ni al tabulador (E2E `e2e/intake.spec.ts:35-49`, en `poc1a/`) |
| Tiempo mínimo desde la emisión del token | 3 s por defecto, configurable, nunca 0 en producción (`lib/intake/config.ts:29-32`; P3-04); → `400 envio_rechazado` (`lib/intake/manejador.ts:94`) | Quien rellena con autocompletar y envía en menos de 3 s pierde lo escrito y ve «Vuelve a cargar el formulario» | Castiga a usuarios rápidos y a la tecnología de apoyo que rellena; ver propuesta abajo |
| Límites por ventana de 10 min, por IP o /64 con clave HMAC | 30 intentos y 5 creaciones (`lib/intake/limites.ts:3-6,21`; `lib/intake/manejador.ts:75`; `lib/intake/persistir.ts:25-26`) | `429` con mensaje y `Retry-After`. Detrás de una NAT compartida, varias personas comparten cupo, sin procedimiento de prueba en la POC (GATE › «Correcciones, huecos y hallazgos detectados al redactar», H-6). Riesgo: el contador de intentos sube antes de validar el origen (`lib/intake/manejador.ts:75`; origen en `:85`), así que una página ajena puede agotar el cupo de un visitante con `POST` entre sitios. H4 decide entre contar sólo tras validar el origen o un cupo separado para orígenes inválidos [Pendiente] | Mensaje en texto; no depende del color |
| Antiduplicados: nonce de 128 bits por formulario y su HMAC en `intake_envio` | `lib/intake/token.ts:15-20`; `lib/intake/esquema.ts:17-27`; `lib/intake/persistir.ts:22-23` | El duplicado recibe la misma respuesta que la creación (`lib/intake/manejador.ts:100-102`) | — |
| CSRF de doble envío y origen exacto. Origen válido [Propuesto]: `Origin` exacto igual a `<origen>`; `null` es inválido; el `Referer` del mismo origen sólo sirve de respaldo si falta `Origin`; sin ninguno de los dos, inválido (`lib/intake/origen.ts:1-12`) | `lib/intake/manejador.ts:27-40,85,91-92`; cookie `__Host-intake` (`lib/intake/formulario.ts:14`) | Dos pestañas: la primera da «formulario caducado» (DIS › §12, 1) | Mensaje recuperable con RS-08 |
| Tope del cuerpo | 32 KiB (`lib/intake/cuerpo.ts:8`) | Insuficiente: en `x-www-form-urlencoded` cada code point de 4 bytes ocupa 12 (`%XX` por byte), así que 4.000 emoji en la descripción suman ≈ 48 kB y dan `413`. Propuesta para H4 [Propuesto]: 64 KiB, por debajo del límite del proxy; el máximo de §3 todo en emoji (4.440 code points × 12 ≈ 53 kB, más el token) cabe | — |

**Estado de la evidencia.** Todo esto está implementado y tiene pruebas unitarias y E2E escritas, pero el gate Docker de POC-3 está detenido en D07 (GATE › cabecera «Estado»; EST › §5): los pasos de intake (D13, D17, D27), el E2E con teclado y axe (D18, D28) y la medición de falsos positivos (D30) están **[Pendiente]**. Nada de esta sección cuenta como validado en ejecución.

**Sin CAPTCHA cognitivo [Propuesto].** Ningún paso pide resolver un acertijo, transcribir caracteres ni reconocer imágenes. Si D-08 incorpora un desafío externo, debe ofrecer una alternativa que no sea una prueba cognitiva (WCAG 1.1.1) y funcionar sin JavaScript, o el formulario dejaría de cumplir MVP-14.4. El 3.3.8 sólo aplicaría si el desafío se usara en un acceso: el formulario no tiene autenticación.

**Envío demasiado rápido: mensaje recuperable [Propuesto; decisión en RS-05].** Distinguir el rechazo por tiempo mínimo del de la trampa: devolver el formulario repoblado, con el mismo token verificado (§5.2) y, como ejemplo si RS-05 = (a), el mensaje «Comprueba tus datos y pulsa “Enviar solicitud” de nuevo.» (A→R), sin mencionar el control. La trampa con valor sigue dando una respuesta genérica sin repoblar y nunca un falso éxito. Coste: un bot aprende que puede reenviar, cosa que ya puede hacer pidiendo otro formulario.

### 5.2 Reintento idempotente [Propuesto, condicionado a D-09 (a) o (c)]

La POC emite un token nuevo en toda respuesta de error (`lib/intake/formulario.ts:11`). Si un fallo ocurre después del commit (`lib/intake/persistir.ts:30-35`), la persona ve un error aunque la solicitud se guardó, y reenviar con el token nuevo crea un segundo registro. Propuesta (MVP-06.4):

- **Cuándo se reutiliza.** Una respuesta de error reutiliza el token sólo si, en esa misma petición, el origen fue válido y el token del cuerpo superó la verificación CSRF completa: igual a la cookie `__Host-intake`, con la firma HMAC y el `kid` vigentes y sin caducar. En la POC, esa verificación es `lib/intake/manejador.ts:34-40` (firma, `kid` y caducidad en `lib/intake/token.ts:28-48`), el origen se comprueba en `:85` y la llamada está en `:91`. Se devuelve la misma cadena, sin volver a firmarla ni cambiar `e` ni `x`.
- **Cuándo no.** En cualquier otro caso (`429` decidido antes de verificar, `415`, `413`, cuerpo inválido, origen o CSRF inválidos o cualquier error previo a la verificación) se emite un token nuevo. También con `campos_no_permitidos` y con la trampa: aunque ocurran tras el CSRF verificado, reciben token nuevo, coherente con el paso 4 de §2 (respuesta genérica, sin repoblar). Nunca se copia al HTML ni a `Set-Cookie` un valor tomado del cuerpo.
- **Lo que no cambia.** Reutilizar el token no exime del contador de intentos. Tras un éxito, el token es de un solo uso por la reserva en `intake_envio`: un reenvío posterior recibe el mismo `303` sin crear registro. La cookie no se borra en el `303`.
- **Purga.** `intake_envio` se purga con una antigüedad mayor o igual que el TTL del token más una tolerancia, para que un token aún válido no vuelva a reservarse. En la POC, TTL de 2 h (`lib/intake/token.ts:6`) y purga a las 4 h (`lib/intake/purga.ts:4,12`).

Así, el reintento tras un `5xx` posterior a la verificación o tras un error de red es idempotente. Con D-09 (b) esta sección se revisa.

### 5.3 D-08 y D-09: opciones neutrales [Pendiente del responsable]

D-08 y D-09 siguen sin decidir (RM › §5; GATE › «Decisiones humanas que bloquean el cierre»). Este documento no las decide.

| Decisión | Opción | Beneficio | Efecto en la UX y coste |
|---|---|---|---|
| **D-08** antiabuso | (a) Sólo controles propios en el servidor (lo de la POC) | Sin terceros ni JavaScript; ya implementado | Invisible; falsos positivos posibles por la trampa, el tiempo mínimo y la NAT |
| | (b) Controles propios y un desafío externo que sólo se activa con un disparador explícito | Defensa adicional ante un ataque sostenido sin coste para la mayoría | Invisible casi siempre; cuando se activa, aplica lo de (c) |
| | (c) Desafío externo en todos los envíos | Mayor resistencia a envíos automatizados | Envía datos del visitante a un tercero (el aviso de §4 debe decirlo), suele requerir JavaScript, añade una dependencia y exige una alternativa no cognitiva (1.1.1) |
| **D-09** antiduplicados | (a) Nonce por formulario con HMAC (lo de la POC) | Sin PII adicional; ya implementado | Doble clic y reintento sin duplicados; recargar y reenviar crea otro registro |
| | (b) (a) más una huella del contenido dentro de una ventana | Detecta reenvíos tras recargar | La huella deriva de PII, necesita retención (H0A-11) y puede bloquear reenvíos legítimos. Si se elige: HMAC con clave del servidor, no sólo sobre el contacto, y una coincidencia responde el mismo `303` [Propuesto] |
| | (c) (a) más deduplicación manual en la bandeja | Sin PII adicional ni bloqueos indebidos; decide una persona | Recargar y reenviar crea otro registro; trabajo manual en la bandeja; un duplicado no detectado puede atenderse dos veces; el administrador cierra con `motivo_cierre = duplicada` |

## 6. Confirmación

| Aspecto | Propuesta | Fuente |
|---|---|---|
| Ruta | URL fija sin parámetros, por ejemplo `/servicios/solicitar/recibida` (nombre A→R) | WIREFRAMES › §3.10. La POC usa `/solicitar?estado=recibida` (`lib/intake/manejador.ts:102`) |
| Respuesta al envío | `303 See Other` con `Location` absoluta sobre el `<origen>` de configuración, nunca sobre `Host` ni `X-Forwarded-Host`; `Cache-Control: no-store` | WIREFRAMES › §3.10 y §5 |
| Página | `200`, `no-store`, `noindex` (`<meta name="robots">` y `X-Robots-Tag`), fuera del sitemap y sin canonical | WIREFRAMES › §5 |
| Contenido (SOL-05, A→R) | `h1` «Solicitud recibida» y «Revisaremos tu solicitud y te responderemos por el contacto que indicaste.» Enlaces «Volver a servicios técnicos» e «Ir al inicio» | MVP-06.5 |
| Lo que nunca muestra | Datos enviados (eco), id o número consultable, enlace de seguimiento, mención de un correo enviado (H0A-06), plazos que el responsable no haya aprobado (RS-07) | F2, paso 5; PROD › Reglas fundamentales, 1 |
| Igualdad | Byte a byte idéntica para una solicitud nueva, un duplicado o un contacto ya conocido; la página no sabe qué ocurrió | WIREFRAMES › §3.10; MVP-06.5 |
| Acceso directo | Cualquiera puede abrir la URL con `GET`; como no contiene nada específico, no revela si hubo un envío | [Propuesto] |
| Sin búsquedas | Ninguna rama del intake busca solicitudes por contacto, nombre ni contenido: ni la respuesta ni su latencia dependen de que exista una. Con D-09 (b), la huella sigue §5.3 | [Propuesto] |
| Foco y anuncio | Carga de página completa: el `h1` basta, sin región viva. Con JS (RS-02 b) se navega a la misma URL | 4.1.3 no aplica a un cambio de página |

## 7. Accesibilidad

| Requisito | Propuesta | En la POC |
|---|---|---|
| Etiquetas visibles (3.3.2) | `<label for>` en cada campo; ayudas asociadas con `aria-describedby` | Sí (`lib/intake/html.ts:27,31`) |
| «Obligatorio» / «Opcional» en texto; no depender del color (1.4.1) | Texto en la ayuda y `required` | Texto sí (`lib/intake/html.ts:27`); `required` no (`:30`) |
| Propósito de los campos (1.3.5) | `autocomplete` según §3 | Falta (`lib/intake/html.ts:30`) |
| Identificación del error (3.3.1) | Resumen con un enlace a cada campo erróneo; mensaje junto al campo con el prefijo «Error:»; `aria-invalid="true"`; `aria-describedby` que incluye ayuda y error | Sí (`lib/intake/html.ts:21-24,33`) |
| Sugerencia de corrección (3.3.3) | Mensaje por motivo (§3) | Falta: mensaje genérico (`lib/intake/html.ts:24`) |
| Foco tras un envío fallido | Al resumen, que lleva un encabezado y `tabindex="-1"`; sin JS, mediante `autofocus` [Pendiente de verificar en navegadores sobre un elemento no interactivo]; `title` fijo «Error: revisa el formulario» | Foco al primer campo (`lib/intake/html.ts:22`); `title` fijo (`:34`) |
| Mensajes de estado (4.1.3) | `role="status"` sólo para «Enviando…» con JS; `role="alert"` sólo para un error que aparece sin recarga (red, con JS). Tras una recarga, el resumen enfocado no lleva `role="alert"` para no anunciarse dos veces [Pendiente de verificar con lector de pantalla] | Resumen con `role="alert"` y éxito con `role="status"` en la misma página (`lib/intake/html.ts:33-34`) |
| Entrada redundante (3.3.7) | Repoblar todos los campos tras cualquier error recuperable (§2, paso 4), con los valores escapados según el contexto (contenido de `textarea` y valor de atributo), la respuesta `no-store, private` y la misma CSP; nunca en la URL ni en el `title` | Falta (`lib/intake/html.ts:30`; DIS › §12, 2) |
| Alternativa al desafío (1.1.1) | Si D-08 añade un desafío, alternativa no cognitiva que funcione sin JS (§5.1) | No hay desafío |
| Autenticación accesible (3.3.8) | No aplica: el formulario no tiene autenticación | — |
| Tamaño de los objetivos (2.5.8) | ≥ 24×24 CSS px; WF-08 para 44×44 | Sin estilos en la POC; depende de `DIRECCION-VISUAL.md` |
| Reflujo (1.4.10) | Una columna a 320 px sin desplazamiento horizontal | Sin verificar |
| Teclado | Orden: campos, aviso, botón; la trampa nunca recibe foco; envío con Enter | E2E escrito (`e2e/intake.spec.ts:35-49`, en `poc1a/`), sin ejecutar en el gate (D18) |
| Auditoría automática | axe con `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `wcag22aa` en cada estado | Sólo `wcag2a` y `wcag2aa` (EST › §7) |

## 8. Privacidad y registros

- **Sin PII en URL [Propuesto].** Los datos viajan sólo en el cuerpo del `POST`; ni la redirección, ni la confirmación, ni las respuestas de error llevan valores en la URL. `?servicio=` lleva sólo un slug público.
- **Sin PII en logs, trazas, métricas ni errores (RM › INV-15; MVP-06.10).** Cada envío produce un único evento técnico con `evento`, `codigo`, `duracion_ms`, `correlacion` y, si hubo error, `err_name` y `pg_code` (`lib/intake/manejador.ts:116-117`); el serializador elimina mensajes, pilas y parámetros de los errores (`lib/intake/log.ts:64-73`). Es la prueba (e) de POC-3 (REG › POC-3), pendiente del gate (D07). Métricas o analítica futuras: sólo códigos y duraciones, nunca valores ni la URL completa [Propuesto].
- **IP sólo como HMAC** en `intake_limite`, nunca en claro (`lib/intake/esquema.ts:28-43`); el nonce, igual en `intake_envio` (`:17-27`). Ambas tablas se purgan: `intake_envio` a las 4 h e `intake_limite` a los 20 min (`lib/intake/purga.ts:4-5,12-13`).
- **Sin captura de valores fuera del intake [Propuesto].** El `GET` ignora los parámetros distintos de `servicio`. La variante con JS (RS-02 b) envía por `POST` y no registra valores en la consola ni en la telemetría. No hay reproducción de sesión, migas con valores ni captura del cuerpo en el APM o el gestor de errores. Los registros de acceso del proxy llevan la IP en claro: su retención la fija H0A-11.
- **Página del formulario sin terceros:** la POC lo impone con CSP `default-src 'none'` (`lib/intake/formulario.ts:7`) [Propuesto mantenerlo].
- **Retención de la Solicitud [Pendiente].** La fija H0A-11 antes de cargar datos reales; hasta entonces sólo hay datos sintéticos.

## 9. Pruebas de aceptación propuestas para H4

Tipos: **I** = integración (servidor y base de datos), **E** = E2E con navegador (320, 360 y 1280 px), **M** = revisión manual, **S** = estática. Los datos son sintéticos con valores centinela (por ejemplo, el prefijo `SNT-`).

| ID | Prueba | Tipo | MVP-06 | POC-3 |
|---|---|---|---|---|
| RS-P01 | Un envío con `estado`, `motivo_cierre`, `observaciones_internas`, `id`, `createdAt`, `updatedAt`, precio, presupuesto o `__proto__` (este, vía JSON) se rechaza y no crea registro; por la vía interna, el registro no los contiene. Un envío válido crea el registro en estado `recibida`, con marcas de tiempo del servidor (MVP-06.3; INV-06) | I | 2, 3 | (a) |
| RS-P02 | Doble envío con el mismo token, en serie y en paralelo, y reintento tras un `5xx` simulado después del commit: un solo registro y la misma respuesta (el reintento con el mismo token aplica con D-09 (a) o (c); con (b) se revisa, §5.2) | I, E | 4 | (b) |
| RS-P03 | Con JS (si RS-02 = b): red cortada en el primer envío y reintento: un registro, datos intactos | E | 4, 7 | (b) |
| RS-P04 | Superar intentos y creaciones da `429` con `Retry-After` y mensaje comprensible, sin registro. Se repuebla sólo si el origen y el CSRF de ese envío se verificaron; el `429` decidido antes responde sin repoblar y con token nuevo | I, E | 6, 1 | (c) |
| RS-P05 | Servicio desactivado entre el `GET` y el `POST`: error en «Servicio», sin registro y sin la opción enviada; desconocido o mal formado: el mismo mensaje y código. `?servicio=` desconocido, inactivo, repetido o mal formado: página idéntica a la que no lleva parámetro, salvo el valor del token y de la cookie `__Host-intake`. `?servicio=<slug activo>` preselecciona exactamente esa opción | I, E | 1 | (d) |
| RS-P06 | Envíos válidos, inválidos, `413`, cuerpo roto y fallo de base de datos inyectado: ningún log de ningún servicio contiene los centinelas de nombre, contacto ni descripción, y existe al menos una línea `evento` | I | 10 | (e) |
| RS-P07 | Confirmación de una creación y de un duplicado: mismo código, cuerpo y cabeceras (salvo correlación y fecha); URL sin parámetros; `no-store`; `noindex`; sin centinelas | E | 5 | (b) |
| RS-P08 | Por campo: vacío, sólo espacios, sólo invisibles (U+200B, U+2800, U+3164), límite + 1 en code points, límite exacto con emoji, un control C0 o C1, DEL, U+2028 y U+2029 en campos de una línea, sustitutos sueltos (vía JSON) y un carácter bidi (§3); la misma cadena en NFD y en NFC cuenta igual; `\t`, `\n` y `\r` se aceptan en `descripcion`; borde de tamaño: el máximo de §3 (≈ 53 kB) se acepta y más de 64 KiB da `413`; mensaje específico; repoblado escapado (centinelas `<script>` y `</textarea>`, y `"` y `'` en `nombre` para el contexto de atributo); descripción con 4.000 emoji sin `413` | I, E | 1, 7 | — |
| RS-P09 | Sin JavaScript: éxito, error por campo, caducado y límite, a 320 px. El estado de carga (MVP-06.7) no es verificable sin JS; se cubre sólo si RS-02 = (b) | E | 7 | — |
| RS-P10 | Teclado: orden de tabulación, trampa no enfocable, envío con Enter, foco al resumen, cada enlace del resumen lleva a su campo. El autorrelleno del navegador y del gestor de contraseñas no rellena la trampa (Chromium, Firefox, WebKit) | E | 7 | Usabilidad |
| RS-P11 | axe con las etiquetas de §7 en los estados inicial, error, caducado, límite y confirmación | E | 7, 8 | Usabilidad |
| RS-P12 | Lector de pantalla, al menos uno en escritorio y uno en móvil: etiquetas, obligatoriedad, aviso de privacidad al enfocar el botón, resumen de errores con el foco y anuncio del éxito | M | 7, 8 | Usabilidad |
| RS-P13 | 320 px y zoom al 200 % y al 400 %: sin desplazamiento horizontal; objetivos ≥ 24×24; con lector de pantalla, las comprobaciones de RS-P12 | E, M | 7 | — |
| RS-P14 | Aviso de privacidad presente antes del botón, con enlace a `/privacidad` y asociado al botón | E | 8 | — |
| RS-P15 | Ningún `input type="password"`; los campos son exactamente los de §3; SOL-01 revisado | S, M | 9 | — |
| RS-P16 | Ninguna ruta pública (API REST y GraphQL anónimas, confirmación, sitemap) lista, lee, crea, modifica ni borra solicitudes; el intake es el único canal anónimo de creación | I | 11 | — |
| RS-P17 | No existe código del dominio `notifications` | S | 12 (H0A-06) | — |
| RS-P18 | Envío antes del tiempo mínimo: mensaje recuperable y datos repoblados (según RS-05); trampa con valor: respuesta genérica, sin registro y sin falso éxito | I, E | 1 | D-08 |
| RS-P19 | Dos pestañas y token caducado: mensaje recuperable (según RS-08); origen o CSRF inválidos desde otro origen: `403` sin registro | I, E | 1 | Seguridad |
| RS-P20 | Dos `GET` consecutivos del formulario, directos y a través del proxy o CDN de staging: tokens y `Set-Cookie` distintos, con `Cache-Control: no-store, private`. Comprobación estática: la ruta no es estática ni ISR | I, E, S | 4 | Seguridad |
| RS-P21 | En todas las ramas de error, incluido el `429`: un `POST` con origen ajeno, o con un token válido en el cuerpo distinto del de la cookie, nunca devuelve ese token en el HTML ni en `Set-Cookie`. Con origen ajeno no repuebla; donde la rama repueble, sigue RS-08; el `429` decidido antes de la verificación nunca repuebla y responde con token nuevo | I | 1, 4 | Seguridad |
| RS-P22 | Tras una creación, una segunda solicitud legítima (nuevo `GET`, nuevo token, mismo origen, contenido distinto) crea un segundo registro sin `429` ni respuesta de duplicado. Con contenido idéntico, el resultado depende de D-09 (reenvío legítimo, POC-3) | I, E | 4 | (b) |

## 10. Decisiones para el responsable

La columna **Bloquea** indica el primer hito que no puede cerrarse sin la respuesta [Propuesto].

| Decisión | Opciones | Bloquea |
|---|---|---|
| **RS-01. Forma del contacto** | (a) un campo único libre («correo o teléfono»); (b) correo y teléfono separados, con al menos uno obligatorio; (c) sólo correo; (d) sólo teléfono. Cambia `autocomplete`, `inputmode`, la validación de formato y la cantidad de datos guardados | H4 |
| **RS-02. JavaScript en el envío** | (a) sólo HTML, como la POC; (b) HTML como base y una mejora con JavaScript para «Enviando…», el error de red sin pérdida de datos y el doble clic. En los dos casos el formulario funciona sin JavaScript | H4 |
| **RS-03. Aviso o consentimiento** (§4) | (a) aviso informativo, sin casilla; (b) casilla de consentimiento desmarcada y obligatoria para enviar, con registro de la versión aceptada; (c) aviso y casilla opcional sólo para finalidades adicionales, si las hubiera. Depende de la base legal que fije el responsable | H4 (estructura); H7 (texto) |
| **RS-04. Cómo se abre `/privacidad` desde el formulario** | (a) en la misma pestaña; (b) en una pestaña nueva, avisándolo en el texto del enlace y con `rel="noopener noreferrer"`; (c) en la misma pestaña, con un aviso breve que baste para decidir sin salir | H4 |
| **RS-05. Envío antes del tiempo mínimo** (§5.1) | (a) mensaje recuperable, datos repoblados y el mismo token verificado (§5.2); (b) respuesta genérica sin datos, como la trampa (la POC). Además, el valor en producción: mantener los 3 s provisionales de P3-04 o fijar otro tras la medición D30 | H4 |
| **RS-06. Mensaje de límite** | (a) sin cifra («inténtalo más tarde»); (b) con los minutos de espera derivados de `Retry-After`, redondeados hacia arriba | H4 |
| **RS-07. Plazo en la confirmación** | (a) sin plazo; (b) un plazo que el responsable compromete (como CON-03) | H4 |
| **RS-08. Repoblar tras un `csrf_invalido` con origen válido** (caducado, dos pestañas, token ausente o firma rota) | (a) repoblar, ya que el origen se valida antes que el token (`lib/intake/manejador.ts:85,91-92`), siempre con token nuevo y nunca el del cuerpo (§5.2); (b) no repoblar y pedir que se vuelva a escribir. Origen válido: `Origin` exacto igual a `<origen>`; `null` inválido; `Referer` del mismo origen sólo como respaldo si falta `Origin`; sin ninguno, inválido (`lib/intake/origen.ts:1-12`) | H4 |
| **RS-09. Contador de intentos antes o después de validar el origen** (§5.1) | (a) contar sólo tras validar el origen; (b) un cupo separado para orígenes inválidos; (c) mantener el de la POC (cuenta antes, `lib/intake/manejador.ts:75`) | H4 |
| **D-08 y D-09** (§5.3; RM › §5) | Opciones de §5.3 | H4 (EST › §4) |
| **WF-04, DC-09 (SOL-06), DC-13** | Indexación del formulario; lista cerrada o texto libre para el tipo de equipo; tratamiento de los textos | H4 (DC-13: H3) |
