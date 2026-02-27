# Extension Library Backend

Shared Backend-Library for mittwald Marketplace Extensions. Stellt Express-Middlewares, Lifecycle-Handling, SSH-Verbindungen, Logging und MongoDB-Repository-Logik bereit.

## Installation

```bash
pnpm add @wiesinghilker/extension-lib-backend
```

### Peer Dependencies

```json
{
  "@mittwald/api-client": "^4",
  "express": "^5",
  "mongodb": "^6",
  "zod": "^4"
}
```

## API-Referenz

### Middlewares

#### `createAuthMiddleware(repository, extensionSecret)`

Express-Middleware zur Authentifizierung von Requests. Verifiziert den Session-Token, lädt die Extension-Instance aus der Datenbank und erstellt einen mittwald API-Client.

Nach erfolgreicher Authentifizierung ist `req.auth` verfügbar:

```typescript
req.auth.token               // Public API Token
req.auth.extensionInstance    // ExtensionInstance aus der DB
req.auth.mittwaldClient       // Authentifizierter MittwaldAPIV2Client
```

```typescript
import { createAuthMiddleware } from "@wiesinghilker/extension-lib-backend";

const authMiddleware = createAuthMiddleware(
  extensionInstanceRepository,
  process.env.EXTENSION_SECRET,
);

app.use("/api", authMiddleware, apiRouter);
```

#### `mittwaldWebhookValidationMiddleware`

Validiert eingehende mittwald-Webhooks anhand der Signatur-Header (`X-Marketplace-Signature`, `X-Marketplace-Signature-Serial`, `X-Marketplace-Signature-Algorithm`).

```typescript
import { mittwaldWebhookValidationMiddleware } from "@wiesinghilker/extension-lib-backend";

app.use("/lifecycle", mittwaldWebhookValidationMiddleware, lifecycleRouter);
```

#### `requestLoggingMiddleware`

HTTP-Request/Response-Logging via pino-http. Loggt automatisch alle Requests mit strukturierten Daten (Method, Path, Response Time, Status Code). Integriert sich mit dem async Logger-Kontext.

```typescript
import { requestLoggingMiddleware } from "@wiesinghilker/extension-lib-backend";

app.use(requestLoggingMiddleware);
```

---

### Router

#### `lifecycleRoutes(repository)`

Express-Router mit allen Lifecycle-Endpoints der mittwald Extension API:

| Endpoint | Event | Beschreibung |
|---|---|---|
| `POST /lifecycle/added` | `ExtensionAddedToContext` | Extension wurde installiert |
| `POST /lifecycle/updated` | `InstanceUpdated` | Scopes oder State geändert |
| `POST /lifecycle/secret-rotated` | `SecretRotated` | Secret wurde rotiert |
| `POST /lifecycle/removed` | `InstanceRemovedFromContext` | Extension wurde deinstalliert |

```typescript
import { lifecycleRoutes } from "@wiesinghilker/extension-lib-backend";

app.use(lifecycleRoutes(extensionInstanceRepository));
```

#### `commonRoutes()`

Express-Router mit gemeinsamen Endpoints:

| Endpoint | Beschreibung |
|---|---|
| `GET /common/employee` | Prüft ob der authentifizierte User ein mittwald-Mitarbeiter ist |

```typescript
import { commonRoutes } from "@wiesinghilker/extension-lib-backend";

app.use(authMiddleware, commonRoutes());
```

#### `adminRoutes()`

Express-Router für Admin-Operationen:

| Endpoint | Beschreibung |
|---|---|
| `POST /admin/log-level` | Log-Level zur Laufzeit ändern (mit auto-reset) |

```typescript
import { adminRoutes } from "@wiesinghilker/extension-lib-backend";

app.use(adminRoutes());
```

Request-Body:
```json
{
  "level": "debug",
  "timeoutMinutes": 30
}
```

Erlaubte Levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`. Das Level wird nach `timeoutMinutes` (Standard: 60) automatisch auf den Standardwert zurückgesetzt.

---

### Repository

#### `ExtensionInstanceRepository` (Interface)

```typescript
interface ExtensionInstanceRepository {
  add(instance: Omit<ExtensionInstance, "addedAt" | "updatedAt">): Promise<void>;
  remove(extensionInstanceId: string): Promise<void>;
  rotateSecret(extensionInstanceId: string, secret: string): Promise<void>;
  update(extensionInstanceId: string, update: Omit<ExtensionInstance, "addedAt" | "contextId" | "id" | "secret" | "updatedAt">): Promise<void>;
  get(extensionInstanceId: string): Promise<ExtensionInstance | null>;
  require(extensionInstanceId: string): Promise<ExtensionInstance>;
}
```

#### `ExtensionInstanceMongoRepository`

MongoDB-Implementierung von `ExtensionInstanceRepository`. Erstellt automatisch Indizes auf `id` (unique) und `contextId` (unique).

```typescript
import { ExtensionInstanceMongoRepository } from "@wiesinghilker/extension-lib-backend";
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db("extensions");
const collection = db.collection("extension-instances");

const repository = new ExtensionInstanceMongoRepository(collection);
await repository.initCollection(); // Erstellt Indizes
```

#### `ExtensionInstance` (Interface)

```typescript
interface ExtensionInstance {
  id: string;
  contextId: string;
  consentedScopes: string[];
  secret: string;
  enabled: boolean;
  addedAt: Date;
  updatedAt?: Date;
  variantKey?: string;
}
```

---

### SSH

#### `TempSSHConnectionV2`

Verwaltet temporäre SSH-Verbindungen zu mittwald-Projekten. Erstellt automatisch einen SSH-User über die API, baut die Verbindung auf und räumt beim Dispose auf.

```typescript
import { TempSSHConnectionV2 } from "@wiesinghilker/extension-lib-backend";

const ssh = new TempSSHConnectionV2({
  apiToken: req.auth.token,
  project: project,
  extensionName: "meine-extension",
  appInstallationShortId: "abc123",
  // Optional:
  connectionTimeout: 30000,     // Standard: 30s
  retryAttempts: 3,             // Standard: 3
  retryDelay: 1000,             // Standard: 1s
  keepAliveInterval: 60000,     // Standard: 60s
  userExpirationHours: 12,      // Standard: 12h
  onConnected: (conn) => { },
  onDisconnected: (conn) => { },
  onReconnected: (conn) => { },
});

await ssh.connect();

// Befehle ausführen
const result = await ssh.executeCommand("ls -la /html");
// Oder mit Fehlerbehandlung:
const safe = await ssh.executeCommandSafe("cat /html/.htaccess", {
  acceptedExitCodes: [0, 1],
});

// SSH-Session direkt verwenden
const session = await ssh.getSSHSession();

// Aufräumen (löscht den SSH-User über die API)
await ssh.dispose();
```

Alternativ mit `containerShortId` statt `appInstallationShortId` für Container-Verbindungen.

#### `FileHandler`

Datei-Operationen über eine SSH-Verbindung:

```typescript
import { FileHandler } from "@wiesinghilker/extension-lib-backend";

const fileHandler = new FileHandler(sshConnection);

await fileHandler.writeFile("/html/config.json", '{"key": "value"}');
await fileHandler.appendFile("/html/log.txt", "neue Zeile\n");
const content = await fileHandler.readFile("/html/config.json");
const exists = await fileHandler.fileExists("/html/.htaccess");
await fileHandler.deleteFile("/html/tmp/cache.json");

await fileHandler.createDirectory("/html/uploads/images");
const files = await fileHandler.listDirectory("/html/uploads");

await fileHandler.touchFile("/html/.flag");
await fileHandler.changePermissions("/html/config.json", "644");
await fileHandler.lockFile("/html/.htaccess");
await fileHandler.unlockFile("/html/.htaccess");
```

---

### Logger

#### `logger`

Pino-basierter Logger mit AsyncLocalStorage-Kontext. Unterstuetzt strukturiertes Logging mit automatischer Request-Korrelation.

```typescript
import { logger } from "@wiesinghilker/extension-lib-backend";

// Einfaches Logging
logger.info("Server gestartet");
logger.error({ port: 3000 }, "Port bereits belegt");

// Logger mit zusätzlichem Kontext
const dbLogger = logger.withContext({ component: "database" });
dbLogger.info("Verbindung hergestellt");

// Error-Logging
logger.logError(error, "Datenbankfehler", { query: "SELECT ..." });
```

#### `setLogContext(context)`

Setzt zusätzlichen Kontext für alle Logs im aktuellen Async-Scope (z.B. innerhalb eines Requests):

```typescript
import { setLogContext } from "@wiesinghilker/extension-lib-backend";

setLogContext({
  extensionInstanceId: "ext-123",
  userId: "user-456",
});
```

#### `setLogLevel(level)`

Ändert das Log-Level aller Logger-Instanzen zur Laufzeit:

```typescript
import { setLogLevel } from "@wiesinghilker/extension-lib-backend";

const previousLevel = setLogLevel("debug");
```

---

### Lifecycle-Schemas

#### `lifecyclePayloadSchemas`

Zod-Validierungsschemas für die Lifecycle-Webhook-Payloads:

```typescript
import { lifecyclePayloadSchemas } from "@wiesinghilker/extension-lib-backend";

const result = await lifecyclePayloadSchemas.added.safeParseAsync(req.body);
if (!result.success) {
  // Validierungsfehler
}
```

Verfügbare Schemas: `added`, `updated`, `removed`, `secretRotated`

---

### Utilities

#### `stringGenerators`

Hilfsfunktionen zur Generierung von SSH-Zugangsdaten und Pfaden:

```typescript
import { stringGenerators } from "@wiesinghilker/extension-lib-backend";

const hostname = stringGenerators.sshHostname(project);
const username = stringGenerators.sshUsername(app, sshUser);
const password = stringGenerators.sshPassword();
const installPath = stringGenerators.appFullInstallationPath(app);
const iniPath = stringGenerators.pathToUserIni(app);
```

#### `mStudioAPIHealthCheck()`

Prüft die Erreichbarkeit der mittwald API:

```typescript
import { mStudioAPIHealthCheck } from "@wiesinghilker/extension-lib-backend";

const isHealthy = await mStudioAPIHealthCheck(); // boolean
```

---

## Entwicklung

```bash
pnpm install    # Abhängigkeiten installieren
pnpm build      # Library bauen (CJS + ESM + Typings)
pnpm dev        # Watch-Mode
pnpm lint       # ESLint
pnpm format     # Prettier
```

## Architektur

```
src/
  aggregate/
    extensionInstance.ts          # ExtensionInstance Interface
  middlewares/
    authenticationMiddleware.ts   # Session-Token-Authentifizierung
    mittwaldWebhookValidationMiddleware.ts  # Webhook-Signaturprüfung
    requestLoggingMiddleware.ts   # HTTP-Logging
  mittwaldAPI/
    TempSSHConnection.ts          # SSH-Verbindungsmanagement
    FileHandler.ts                # Datei-Operationen via SSH
    securityUtils.ts              # Shell-Escaping, Pfadvalidierung
  repository/
    ExtensionInstanceRepository.ts      # Repository-Interface
    ExtensionInstanceMongoRepository.ts # MongoDB-Implementierung
  routers/
    lifecycleRouter.ts            # Lifecycle-Webhook-Endpoints
    commonRouter.ts               # Gemeinsame Endpoints
    adminRouter.ts                # Admin-Endpoints
  generators.ts                   # String-Generatoren (SSH, Pfade)
  lifecyclePayloadSchemas.ts      # Zod-Schemas für Webhooks
  logger.ts                       # Pino-Logger mit Kontext
  mStudioAPIHealthCheck.ts        # API-Health-Check
  index.ts                        # Public API
```
