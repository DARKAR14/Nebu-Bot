# Nebu Bot

Bot de Discord escrito en TypeScript con comandos separados por nivel de acceso:

- `src/commands/public`: comandos visibles y ejecutables por todos.
- `src/commands/admin`: comandos para miembros con `Manage Server` o `Administrator`.
- `src/commands/dev`: comandos exclusivos del dueño del servidor.

La cuenta indicada en `DEVELOPER_USER_ID` puede ejecutar las tres categorías, un administrador puede ejecutar `public` y `admin`, y el resto solo `public`. La autorización se vuelve a comprobar dentro del bot aunque alguien intente enviar una interacción manualmente.

## Requisitos

- Node.js 22.12 o posterior.
- Una aplicación/bot creada en el [Discord Developer Portal](https://discord.com/developers/applications).
- Una base de datos MongoDB o un clúster de MongoDB Atlas.
- Una cuenta de Cloudinary para almacenar las muestras de los diseñadores.
- Una API key de Google AI Studio para las conversaciones opcionales de Gemini Live.
- El bot debe tener `Manage Server` para restringir invitaciones a cuentas concretas y `Create Instant Invite` en el canal usado para crearlas.

## Configuración

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` como `.env` y completa:

   - `DISCORD_TOKEN`: token del bot.
   - `DEVELOPER_USER_ID`: ID numérico de la única cuenta autorizada para comandos `dev`.
   - `GEMINI_API_KEY`: clave de Google AI Studio; si se omite, solo `/hablar` queda deshabilitado.
   - `GEMINI_LIVE_MODEL`: modelo de voz; por defecto `gemini-3.1-flash-live-preview`.
   - `MONGODB_URI`: cadena de conexión de MongoDB.
   - `MONGODB_DB_NAME`: nombre de la base; por defecto `nebu_bot`.
   - `CLOUDINARY_URL`: credencial con formato `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`.
   - `INVITE_MAX_AGE_SECONDS`: vigencia del enlace; por defecto son 15 minutos.
   - `PORT`: puerto HTTP local; Render lo proporciona automáticamente.
   - `URL_PING`: URL pública completa del endpoint, por ejemplo `https://nebu-bot.onrender.com/health`.

3. Invita el bot con los scopes `bot` y `applications.commands`.

4. Inicia el bot:

   ```bash
   npm run dev
   ```

   Para producción usa `npm run build` y luego `npm start`.

Al conectarse, el bot detecta automáticamente su Application ID y todos los servidores donde está instalado. Registra o actualiza los slash commands en cada servidor y muestra tres tablas ASCII —admin, public y dev— con el estado de cada comando. También sincroniza los comandos cuando se agrega a un servidor nuevo.

## Despliegue en Render

El proyecto incluye `render.yaml` para crear un **Web Service** de Node.js. Render ejecuta `npm ci && npm run build`, inicia con `npm start` y comprueba `GET /health`. El servidor escucha en `0.0.0.0` usando el `PORT` asignado por la plataforma.

1. Publica el repositorio en GitHub y, en Render, elige **New > Blueprint**.
2. Conecta el repositorio y completa las variables marcadas como secretas: `DISCORD_TOKEN`, `DEVELOPER_USER_ID`, `GEMINI_API_KEY`, `MONGODB_URI`, `CLOUDINARY_URL` y `URL_PING`.
3. En el primer despliegue todavía no conocerás la URL final. Puedes dejar `URL_PING` vacío, crear el servicio y luego configurarla como `https://TU-SERVICIO.onrender.com/health` desde **Environment**.
4. Reinicia el servicio y verifica que `/health` responda con `status: "ok"` y que los logs muestren las conexiones de MongoDB, Cloudinary y Discord.

`URL_PING` genera una petición cada 10 minutos. El endpoint no expone credenciales ni datos del servidor. Render también usa `/health` como comprobación oficial de disponibilidad. El archivo `.env` está ignorado y nunca debe publicarse en GitHub.

## Activar o desactivar comandos

Cada comando implementa `BotCommand` y declara `active: true` o `active: false`. Los activos se cargan, registran y pueden ejecutarse; los inactivos permanecen fuera de Discord y aparecen como `INACTIVO` en la tabla de consola.

## Visibilidad de los comandos

Los comandos públicos no exigen permisos nativos. Los comandos de administración exigen `Manage Server`: Discord calcula ese permiso a partir de todos los roles y su jerarquía. Los comandos de desarrollador se registran deshabilitados por defecto y el bot solo acepta internamente a la cuenta configurada en `DEVELOPER_USER_ID`.

Discord permite que los miembros con el permiso nativo `Administrator` vean todos los comandos, incluso los deshabilitados. El bot seguirá rechazando internamente cualquier comando `dev` si su ID no coincide con `DEVELOPER_USER_ID`. Si se necesita que los administradores no los vean, sus roles no pueden tener el permiso nativo `Administrator`; usa permisos administrativos específicos como `Manage Server`.

## `/invitar`

Uso: `/invitar userid:<ID>`

El bot usa el canal donde se ejecuta `/invitar` y la API de **targeted invites** de Discord para incluir únicamente el `userID` indicado entre las cuentas autorizadas a aceptar el enlace. La invitación también tiene un solo uso y caducidad corta, y se envía directamente por DM. Si Discord bloquea el DM, el enlace se muestra de forma privada al administrador para que pueda enviarlo manualmente.

Aunque otra persona reciba el enlace, su cuenta no podrá aceptarlo. Esta función requiere que el bot tenga `Manage Server`, además de `Create Instant Invite` en el canal.

El parámetro `userid` acepta un ID numérico o una mención (`<@usuario>`). Si Discord devuelve `Unknown User`, revisa que hayas copiado el ID de la cuenta y no el de un rol, canal o servidor. El error exacto también se imprime en la consola del bot.

Discord puede localizar una cuenta por su ID sin que pertenezca al servidor, pero normalmente no permite que un bot inicie un DM si no comparte servidor con ella. En ese caso `/invitar` conserva la invitación dirigida y muestra el enlace únicamente al administrador que ejecutó el comando, para que pueda enviarlo manualmente. El enlace sigue restringido al `userID` original.

## Comandos de moderación

Cada comando vive en su propio archivo dentro de `src/commands/admin` y usa el permiso nativo correspondiente:

- `/mute-text usuario minutos [motivo]`: aplica un timeout de Discord, hasta 28 días. Requiere `Moderate Members`.
- `/mute-voice usuario [motivo]`: aplica silencio de servidor mientras el miembro está conectado a voz. Requiere `Mute Members`.
- `/unmute-text usuario [motivo]`: retira un timeout activo. Requiere `Moderate Members`.
- `/unmute-voice usuario [motivo]`: retira el silencio de servidor. Requiere `Mute Members`.
- `/ban usuario motivo [eliminar_dias]`: banea al miembro, publica el motivo en el servidor e intenta notificárselo por DM. Requiere `Ban Members`.
- `/unban userid [motivo]`: retira un baneo mediante el ID de la cuenta. Requiere `Ban Members`.
- `/kick usuario motivo`: expulsa a un miembro sin banearlo. Requiere `Kick Members`.
- `/warn usuario motivo`: envía una advertencia formal por DM y deja registro en consola. Requiere `Moderate Members`.
- `/clear cantidad`: elimina hasta 100 mensajes recientes del canal. Requiere `Manage Messages`; Discord no permite el borrado masivo de mensajes con más de 14 días.

Antes de aplicar una sanción, el bot impide actuar contra el dueño, contra otro moderador o administrador, y contra miembros cuyo rol más alto sea igual o superior al del ejecutor. El rol más alto del bot también debe estar por encima del objetivo.

## `/test`

Comando exclusivo de la cuenta configurada como developer. Usa `/test tipo:Invitación` para recibir la misma tarjeta utilizada por `/invitar`, o `/test tipo:Baneo motivo:...` para probar la notificación de una sanción. Las pruebas no crean invitaciones ni aplican sanciones; el botón de la invitación de prueba aparece deshabilitado.

## `/presence`

Los administradores con `Manage Server` y el dueño pueden cambiar globalmente la presencia del bot:

```text
/presence texto:Con la comunidad actividad:Jugando estado:En línea
```

Permite mostrar que el bot está jugando, viendo, escuchando o compitiendo, y establecerlo en línea, ausente, no molestar o invisible. La última presencia se guarda en la colección `bot_settings` de MongoDB y se restaura automáticamente al reiniciar.

## Sistema de Designers y comisiones

El sistema no utiliza archivos JSON. La configuración, solicitudes y disponibilidad se guardan en MongoDB; las imágenes se almacenan permanentemente en Cloudinary y MongoDB conserva su URL segura y `public_id`.

MongoDB utiliza estas colecciones:

- `designer_guilds`: rol y canal de revisión de cada servidor.
- `designer_applications`: perfil, estilo, estado y referencia de Cloudinary de cada solicitud.
- `designer_availability`: disponibilidad actual de cada Designer.
- `bot_settings`: presencia persistente del bot.

Las muestras se guardan en Cloudinary bajo `nebu-bot/designers/<guildId>/<userId>`. Cuando una solicitud reemplaza una muestra anterior, el bot elimina el recurso viejo después de guardar correctamente el nuevo registro en MongoDB.

1. Un administrador ejecuta `/designer canal:#solicitudes`. El bot crea o reutiliza el rol `Designer` y guarda el canal donde el equipo revisará solicitudes. Si se omite `canal`, utiliza el canal actual.
2. Un miembro ejecuta `/create designer`. Se abre un modal para indicar quién es, describir su estilo de dibujo y subir una imagen de muestra.
3. La solicitud llega al canal configurado con los botones **Aprobar** y **Rechazar**. Pueden revisarla administradores, miembros con `Manage Roles` o moderadores con `Moderate Members`.
4. Al aprobarla, el bot asigna el rol `Designer`, marca al miembro como disponible y le envía un DM de bienvenida.
5. Un Designer usa `/status estado:Disponible` o `/status estado:No disponible`. El bot comprueba el rol internamente antes de cambiar el estado.
6. Un cliente ejecuta `/comision trabajo:<descripción>`, elige un Designer disponible y confirma la contratación con un botón. El Designer recibe por DM los datos del cliente y el trabajo solicitado; después queda como no disponible hasta que vuelva a usar `/status`.

El bot necesita `Manage Roles` y su rol debe estar por encima de `Designer`. También necesita `View Channel`, `Send Messages` y `Embed Links` en el canal de revisión. Los DMs pueden ser bloqueados por la configuración de privacidad de cada usuario; el bot informa cuando Discord no permite entregarlos.

## Configuración de canales internos

Los canales adicionales se configuran con un único comando administrativo:

```text
/configurar moderacion canal:#mod-logs
/configurar errores canal:#errores-bot
/configurar backups canal:#backups
/configurar tickets categoria:Comisiones
```

La configuración se guarda por servidor en la colección `guild_settings`. El canal de Designer continúa configurándose exclusivamente con `/designer`.

## Casos de moderación

Los comandos de baneo, expulsión, advertencia, mute, unmute, desbaneo y limpieza generan un número de caso consecutivo. Cada registro conserva responsable, usuario afectado, acción, motivo, detalles y fecha en `moderation_cases`, y publica un embed en el canal configurado. Un moderador puede consultar cualquier registro con `/caso numero:<número>`.

## Flujo de comisiones y tickets

Después de confirmar un Designer en `/comision`, el bot crea un canal privado visible para cliente, Designer y roles de moderación. La comisión queda guardada en MongoDB y avanza mediante botones:

```text
Pendiente → Aceptada → Trabajando → Entregada → Completada
                    ↘ Cancelada ↙
```

El Designer acepta, inicia y entrega; el cliente confirma que está completada. Cliente, Designer o moderación pueden cancelarla antes de completarse. Al cerrar, el Designer vuelve a estar disponible y el ticket queda bloqueado. Después de completar, el cliente puede dar de una a cinco estrellas; cada comisión admite una sola valoración.

## Portfolios

- `/portfolio [designer]`: muestra presentación, estilo, especialidades, precios, muestras y promedio de calificaciones.
- `/portfolio-edit especialidades:<texto> precios:<texto> [muestra:<imagen>]`: permite a un Designer aprobado mantener su perfil. Se guardan hasta cinco muestras adicionales en Cloudinary y se eliminan automáticamente las más antiguas.

## AutoMod

`/automod configurar` crea reglas nativas de Discord para spam general, exceso de menciones y una lista opcional de palabras o frases. Los mensajes se bloquean antes de publicarse y las alertas llegan al canal elegido. `/automod estado` consulta las reglas de Nebu y `/automod desactivar` las deshabilita sin alterar reglas creadas manualmente por el servidor.

El bot necesita `Manage Server` para administrar reglas AutoMod. Los límites de palabras, menciones y reglas dependen de la API nativa de Discord.

## Utilidades públicas

- `/userinfo [usuario]`: cuenta, ingreso y roles.
- `/serverinfo`: miembros, canales, roles, boosts y creación del servidor.
- `/avatar [usuario]`: avatar en máxima resolución disponible.
- `/help`: muestra únicamente las categorías que el usuario puede ejecutar.

## Conversación de voz con Gemini Live

`/hablar conectar` une a Nebu al canal de voz normal donde se encuentra el usuario. El bot recibe el audio Opus de Discord, lo convierte a PCM de 16 bits/16 kHz para Gemini Live y reproduce en Discord la respuesta nativa de voz. El modelo predeterminado es `gemini-3.1-flash-live-preview` y la voz configurada es `Puck`, guiada para sonar masculina, juvenil y enérgica.

Nebu interpreta a un ser cósmico que aparenta unos 12 años: curioso, amable y con amplios conocimientos de ciencia, astronomía, historia, tecnología, videojuegos, arte y cultura. Explica ideas complejas de manera sencilla, reconoce cuando no sabe algo y evita inventar respuestas. Como Gemini utiliza voces predefinidas, la edad de la voz es una aproximación de estilo y no una reproducción exacta.

`Nebu` es la palabra de activación. La petición debe comenzar llamándolo por su nombre, por ejemplo: “Hey Nebu”, “Hola Nebu” u “Oye Nebu”. Cada pregunta nueva debe volver a incluir el nombre. La respuesta no se interrumpe si otra persona comienza a hablar, de modo que Nebu pueda terminar su idea. La detección es semántica y la realiza Gemini, por lo que el audio continúa enviándose temporalmente mientras la sesión está conectada y pueden ocurrir falsos positivos o negativos ocasionales.

```text
/hablar conectar
/hablar estado
/hablar desconectar
```

La conversación desactiva las interrupciones automáticas: cuando una persona empieza a hablar mientras Nebu responde, el audio pendiente no se descarta. Una sola sesión puede estar activa por servidor y termina automáticamente a los 14 minutos para permanecer por debajo del límite de una sesión de audio Live. El audio se transmite temporalmente a Google y no se guarda en MongoDB, Cloudinary ni archivos locales; al conectarse, el bot publica este aviso en el canal de texto.

El bot necesita `Connect` y `Speak` en el canal de voz. `GEMINI_API_KEY` permanece únicamente en el servidor de Render y nunca se envía a Discord. El uso está sujeto a la cuota y facturación configuradas en la cuenta de Gemini API.

## Estado, backups y errores

El dueño puede usar `/botstatus` para consultar latencia de Discord, MongoDB y Cloudinary, memoria, tiempo activo, servidores, miembros y versión de Node. `/backup` crea manualmente un JSON con la configuración y datos persistentes del servidor.

Con un canal de backups configurado, el bot genera automáticamente una copia cada 24 horas. Las imágenes no se duplican: el backup conserva sus referencias de Cloudinary. Los errores de interacciones y fallos globales se envían al canal configurado con su contexto y stack limitado; los secretos de `.env` no se incluyen.
