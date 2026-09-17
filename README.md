# Postular App

Aplicación web para descubrir ofertas laborales, medir su compatibilidad con el perfil del candidato y organizar postulaciones con apoyo de inteligencia artificial.

La aplicación centraliza oportunidades, genera material personalizado —correo, mensaje de LinkedIn y CV adaptado— y prepara una cola de postulaciones para LinkedIn, Computrabajo y otros portales.

![Dashboard principal](docs/images/dashboard.png)

## Características

- Dashboard con indicadores de oportunidades y postulaciones.
- Descubrimiento de ofertas mediante IA y búsqueda web.
- Importación y almacenamiento local de trabajos.
- Ordenamiento por porcentaje de compatibilidad.
- Filtros por texto, tecnología, ubicación y score mínimo.
- Perfil profesional reutilizable para generar postulaciones.
- Generación de correo, mensaje de LinkedIn y CV ATS adaptado.
- Selección de LinkedIn, Computrabajo y otros portales.
- Preparación por lote según plataforma y match mínimo.
- Cola con estados `Lista para revisar` y `Enviada`.
- Estadísticas de postulaciones por fecha.
- Modo de demostración sin consumo de la API de OpenAI.

## Flujo de uso

1. Completa tu información en **Perfil**.
2. Configura las plataformas y el match mínimo en **Configuración**.
3. Descubre o importa ofertas desde **Trabajos**.
4. Presiona **Preparar seleccionadas** para crear la cola.
5. En **Postulaciones**, revisa cada oportunidad preparada.
6. Genera y edita el correo, mensaje y CV.
7. Abre el portal, completa las preguntas particulares y confirma el envío.
8. Marca la postulación como enviada.

> La app utiliza postulación asistida. No guarda contraseñas de portales, no resuelve CAPTCHA y no declara una postulación como enviada sin confirmación del usuario.

## Capturas

### Trabajos

![Lista de trabajos](docs/images/jobs.png)

### Perfil

![Perfil del candidato](docs/images/profile.png)

### Estadísticas

![Estadísticas](docs/images/stats.png)

## Tecnologías

| Capa | Tecnología |
| --- | --- |
| Frontend | Angular 21, Angular Material y SCSS |
| Gráficos | Chart.js y ng2-charts |
| Backend | Node.js y Express |
| Inteligencia artificial | OpenAI API con búsqueda web |
| Persistencia | Archivo JSON local |

## Requisitos

- Node.js 20 o superior.
- npm.
- Una `OPENAI_API_KEY` con crédito disponible para utilizar las funciones reales de IA.

También puedes ejecutar el proyecto sin una API key válida utilizando el modo de demostración.

## Instalación

Clona el repositorio y entra en la carpeta del proyecto:

```powershell
git clone <URL_DEL_REPOSITORIO>
cd Postular_app
```

### Backend

```powershell
cd job-backend
npm.cmd install
Copy-Item .env.example .env
```

Configura `job-backend/.env`:

```env
OPENAI_API_KEY=tu_api_key
PORT=8000
MOCK_ON_QUOTA=1
```

Inicia el servidor:

```powershell
npm.cmd run dev
```

Comprueba el estado del backend:

```powershell
curl.exe http://localhost:8000/health
```

### Frontend

Abre otra terminal:

```powershell
cd job-dashboard
npm.cmd install
npm.cmd start
```

La aplicación estará disponible en [http://localhost:4200](http://localhost:4200).

El frontend consume por defecto `http://localhost:8000`. Si modificas el puerto del backend, actualiza `job-dashboard/src/app/core/config/api-base-url.ts`.

## Configuración de postulaciones

En la pantalla **Configuración** puedes definir:

- Plataformas permitidas: LinkedIn, Computrabajo y otros portales.
- Match mínimo requerido para entrar en la cola.
- Tecnología y ubicación preferidas.
- Visibilidad predeterminada de ofertas ya postuladas.

El botón **Preparar seleccionadas** procesa hasta 10 ofertas no postuladas que cumplan las preferencias. El backend detecta la plataforma a partir del dominio y guarda el estado `ready_for_review`.

## Modo de demostración

Configura la siguiente variable cuando no tengas crédito disponible en OpenAI:

```env
MOCK_ON_QUOTA=1
```

En este modo:

- `/discover` entrega oportunidades simuladas con enlaces de búsqueda.
- `/generate` crea un correo, mensaje y CV de ejemplo usando el perfil local.
- La configuración, cola y seguimiento continúan funcionando normalmente.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/health` | Comprueba el estado del backend |
| `GET` | `/jobs` | Obtiene las ofertas guardadas |
| `POST` | `/jobs` | Importa una oferta |
| `PUT` | `/jobs/:id/apply` | Marca una postulación como enviada |
| `GET` | `/application-platforms` | Obtiene las plataformas disponibles |
| `POST` | `/applications/prepare-batch` | Prepara ofertas según plataforma y score |
| `POST` | `/generate` | Genera correo, mensaje y CV con IA |
| `POST` | `/discover` | Descubre ofertas mediante IA y búsqueda web |

Ejemplo para preparar una cola:

```json
{
  "platforms": ["linkedin", "computrabajo"],
  "min_score": 70,
  "limit": 10,
  "profile": {
    "fullName": "Nombre Apellido",
    "email": "correo@ejemplo.com"
  }
}
```

## Estructura del proyecto

```text
Postular_app/
|-- job-backend/
|   |-- data/
|   |   `-- jobs.json
|   |-- src/
|   |   |-- application-platforms.mjs
|   |   |-- openai.mjs
|   |   |-- server.mjs
|   |   `-- store.mjs
|   `-- package.json
|-- job-dashboard/
|   |-- src/
|   |   `-- app/
|   |       |-- core/
|   |       `-- features/
|   `-- package.json
|-- docs/
|   `-- images/
`-- README.md
```

## Comandos útiles

```powershell
# Backend
cd job-backend
npm.cmd run dev

# Backend con recarga automática
npm.cmd run dev:watch

# Frontend
cd job-dashboard
npm.cmd start

# Build de producción
npm.cmd run build

# Pruebas del frontend
npm.cmd test
```

## Seguridad y limitaciones

- La `OPENAI_API_KEY` solo debe existir en `job-backend/.env`.
- No publiques archivos `.env` ni claves privadas.
- El perfil se guarda localmente en el navegador.
- Las ofertas y estados se almacenan en `job-backend/data/jobs.json`.
- LinkedIn y Computrabajo requieren revisión y envío final desde la sesión del usuario.
- Una automatización completa solo debe implementarse mediante APIs oficiales o integraciones expresamente autorizadas por cada plataforma.

## Problemas comunes

### `net::ERR_CONNECTION_REFUSED :8000`

El backend no está ejecutándose o utiliza otro puerto:

```powershell
cd job-backend
npm.cmd run dev
```

### `429 insufficient_quota`

La cuenta de OpenAI no tiene crédito disponible. Habilita billing o configura `MOCK_ON_QUOTA=1`.

### La cola queda vacía

Comprueba que:

- El perfil tenga nombre y correo.
- Existan ofertas sin postular.
- La plataforma esté seleccionada.
- El score de la oferta sea igual o superior al mínimo configurado.

### Error `chrome-extension://`

Generalmente proviene de una extensión instalada en el navegador. Prueba en modo incógnito o desactiva temporalmente las extensiones.
