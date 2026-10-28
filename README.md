# streamdb-badge-monitor

Monitor de **Stream Database** que detecta insignias globales nuevas de Twitch y las publica automáticamente en **X (Twitter)**.

Usa la API pública de Stream Database (`https://api.streamdatabase.com/events`) para obtener eventos e insignias de forma limpia (sin scrapear HTML).

## Características

- Consulta periódica de eventos activos / próximos
- Detecta insignias nuevas por `set_id:version`
- Guarda el estado conocido en `data/known-badges.json`
- Publica en X con texto + imagen de la insignia
- Modo `--dry-run` (solo muestra qué publicaría)
- Modo `--seed` (guarda el estado actual sin publicar)
- Listo para GitHub Actions (cron)

## Requisitos

- Node.js 18+
- (Opcional) Cuenta de desarrollador de X con App y tokens de usuario (OAuth 1.0a)

## Instalación

```bash
git clone https://github.com/maikeGalindo/streamdb-badge-monitor.git
cd streamdb-badge-monitor
npm install
cp .env.example .env
# Edita .env con tus credenciales de X (si quieres publicar)
```

## Uso local

```bash
# Solo detectar (no publica ni guarda)
npm run check

# Primera vez: guardar el estado actual sin publicar nada
npm run seed

# Ejecución normal (detecta nuevas + publica + actualiza estado)
npm start
```

## Variables de entorno (`.env`)

```env
# --- X / Twitter (OAuth 1.0a User Context) ---
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=

# Opcional
DRY_RUN=false
POST_LANGUAGE=es
```

Si no pones las claves de X, el monitor solo imprime en consola lo que habría publicado.

## Formato del post (español por defecto)

```
🆕 Nueva insignia de Twitch disponible

📛 Ultramarine
🎮 Warhammer 40,000: Space Marine II

📌 Objetivo: Sub o gift sub Tier 1 en la categoría
⏳ Hasta: 2026-10-29 06:59 UTC

🔗 https://www.streamdatabase.com/events
```

(Se adjunta la imagen 4x de la insignia cuando está disponible.)

## GitHub Actions (recomendado)

El workflow `.github/workflows/monitor.yml` corre cada 20 minutos.

1. Ve a **Settings → Secrets and variables → Actions**
2. Agrega los secrets:
   - `X_API_KEY`
   - `X_API_SECRET`
   - `X_ACCESS_TOKEN`
   - `X_ACCESS_SECRET`
3. (Opcional) Activa el workflow manualmente la primera vez con `workflow_dispatch` y usa `--seed` editando temporalmente el job.

El estado (`data/known-badges.json`) se commitea de vuelta al repo para que persista entre runs.

## Estructura

```
src/
  monitor.js      # Lógica principal
  x-client.js     # Cliente de X (twitter-api-v2)
  format.js       # Plantillas de texto del post
data/
  known-badges.json   # Estado (se genera solo)
.github/workflows/
  monitor.yml
```

## Notas

- La API de Stream Database no requiere autenticación para `/events`.
- Respeta un intervalo razonable (15–30 min). No hagas polling cada segundo.
- Si Stream Database cambia la estructura de la API, habrá que ajustar el parser en `src/monitor.js`.

Hecho para el proyecto **AlertaDropsMX** / opsMX.
