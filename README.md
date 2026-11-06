# Monitor de insignias de Twitch (Stream Database)

Este programa revisa automáticamente **Stream Database** cada 20 minutos.
Cuando aparece una **insignia nueva**, te avisa en:

- **Discord** (recomendado, es lo más fácil)
- **X (Twitter)** (opcional)

No necesitas saber programar. Solo sigues los pasos de abajo.

Repositorio: https://github.com/maikeGalindo/streamdb-badge-monitor

---

## Guía paso a paso (sin código)

### 1. Activa el “robot” de GitHub (Actions)

1. Entra a este enlace:  
   https://github.com/maikeGalindo/streamdb-badge-monitor/actions
2. Si te sale un botón que dice **“I understand my workflows, go ahead and enable them”**, haz clic.
3. Listo. Ya está permitido que el robot corra solo.

---

### 2. Conectar Discord (lo más fácil y recomendado)

Discord usa algo que se llama **Webhook**. Es como un buzón secreto donde el programa deja el aviso.

**Cómo crear el Webhook (2 minutos):**

1. Abre Discord en la computadora o web.
2. Ve al **servidor** y al **canal** donde quieres que lleguen los avisos.
3. Clic derecho en el canal → **Editar canal**.
4. En el menú izquierdo: **Integraciones** → **Webhooks**.
5. Clic en **Nuevo webhook** (o “Crear webhook”).
6. Ponle un nombre, por ejemplo: `Badge Alert`.
7. Clic en **Copiar URL del webhook**.
8. Guarda esa URL (empieza con `https://discord.com/api/webhooks/...`).

**Ahora pégala en GitHub:**

1. Entra a:  
   https://github.com/maikeGalindo/streamdb-badge-monitor/settings/secrets/actions
2. Clic en **New repository secret**.
3. En **Name** escribe exactamente:  
   `DISCORD_WEBHOOK_URL`
4. En **Secret** pega la URL que copiaste de Discord.
5. Clic en **Add secret**.

¡Listo para Discord!

---

### 3. Conectar Google Sheets

El monitor puede actualizar la hoja automáticamente en cada ejecución, sin quitar los avisos de Discord.

1. En tu Google Sheet abre **Extensiones → Apps Script**.
2. Copia el archivo `integrations/google-sheets-apps-script.js` de este repositorio.
3. En **Configuración del proyecto → Propiedades de secuencia de comandos**, agrega `SHEETS_WEBHOOK_SECRET` con un valor largo y privado.
4. Despliega como **Aplicación web**, ejecutando como tú y con acceso **Cualquiera**.
5. Agrega estos secrets en GitHub Actions:
   - `GOOGLE_SHEETS_WEBHOOK_URL`: la URL `/exec` del despliegue.
   - `GOOGLE_SHEETS_WEBHOOK_SECRET`: el mismo valor configurado en Apps Script.

La sincronización conserva las columnas actuales (`badge_name`, `badge_image`, `slug`, `status`, `type`, `startsAt`, `endsAt`, `claimMethod`, `category`, `isNew`, `notes`) y agrega identificadores técnicos para evitar duplicados. Las insignias caducadas se actualizan como `inactive` y no generan avisos nuevos en Discord.

### 4. (Opcional) Conectar X / Twitter

Solo si también quieres que publique en X. Es un poco más largo porque X pide una cuenta de desarrollador.

Necesitas 4 valores de tu App en [developer.x.com](https://developer.x.com):
- API Key
- API Secret
- Access Token
- Access Token Secret

Créalos como **secrets** en el mismo lugar de GitHub con estos nombres exactos:

| Name (nombre del secret) | Qué es |
|--------------------------|--------|
| `X_API_KEY` | API Key |
| `X_API_SECRET` | API Key Secret |
| `X_ACCESS_TOKEN` | Access Token |
| `X_ACCESS_SECRET` | Access Token Secret |

Si no pones estos 4, el programa **solo usará Discord** y no fallará.

---

### 4. Primera ejecución (muy importante)

La primera vez hay que “enseñarle” al programa cuáles insignias **ya existen**, para que no publique las 40 que hay ahora de golpe.

1. Ve a:  
   https://github.com/maikeGalindo/streamdb-badge-monitor/actions/workflows/monitor.yml
2. Clic en el botón **Run workflow** (a la derecha).
3. Marca la casilla **“Solo guardar estado actual (NO publica nada)”** (`seed`).
4. Clic en el botón verde **Run workflow**.
5. Espera 1–2 minutos. Cuando termine en verde, ya guardó el estado actual.

A partir de aquí, solo avisará cuando aparezca una **insignia realmente nueva**.

---

### 5. Cómo funciona de ahí en adelante

- Cada **20 minutos** el robot revisa Stream Database solo.
- Si hay insignia nueva → manda mensaje a Discord (y a X si lo configuraste).
- No tienes que hacer nada más.

También puedes forzar una revisión manual en cualquier momento:
- Mismo enlace del paso 4 → **Run workflow** (sin marcar `seed`).

---

## Resumen rápido

| Qué quieres | Qué hacer |
|-------------|-----------|
| Solo Discord | Crear webhook + secret `DISCORD_WEBHOOK_URL` + Run workflow con `seed` |
| Discord + X | Lo de arriba + los 4 secrets de X |
| Probar sin publicar | Run workflow marcando `dry_run` |

---

## ¿Problemas?

- **No llega nada a Discord** → Revisa que el secret se llame exactamente `DISCORD_WEBHOOK_URL` y que la URL esté completa.
- **Publicó muchas insignias viejas** → Significa que no corriste el paso 4 con `seed`. Puedes volver a correrlo con `seed` para “resetear”.
- **Actions no aparece o está en gris** → Activa los workflows en la pestaña Actions del repo.

Si te atoras en algún paso, dime en qué punto estás y te guío.
