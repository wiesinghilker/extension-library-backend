# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build
```bash
yarn build       # Build the project using tsup
yarn dev         # Watch mode for development
```

### Code Quality
```bash
yarn lint        # Run ESLint with auto-fix
yarn format      # Format code with Prettier
```

## Architecture Overview

This is a TypeScript library for building mittwald marketplace extension backends. It provides utilities and abstractions for:

### Core Components

1. **Lifecycle Management** (`/lifecycle/*` routes)
   - Handles extension instance lifecycle events: `added`, `updated`, `removed`, `secret-rotated`
   - Routes in `src/routers/lifecycleRouter.ts` process these events with Zod validation
   - Updates are persisted via `ExtensionInstanceRepository`

2. **Authentication Middleware** (`src/middlewares/authenticationMiddleware.ts`)
   - Validates session tokens from request headers
   - Creates authenticated mittwald API client instances
   - Attaches auth data to Express requests

3. **Extension Instance Management**
   - `ExtensionInstance` aggregate: Core data model with id, contextId, consentedScopes, secret, enabled state
   - Repository pattern with MongoDB implementation (`ExtensionInstanceMongoRepository`)
   - Abstract interface allows different storage backends

4. **mittwald API Integration**
   - `TempSSHConnectionV2`: Manages temporary SSH connections to mittwald infrastructure (direct constructor usage)
   - `FileHandler`: Utilities for file operations via SSH
   - Health check utilities for mStudio API

5. **Common Routes** (`src/routers/commonRouter.ts`)
   - `/common/employee` endpoint to check if user is mittwald employee

### Key Dependencies
- `@mittwald/api-client`: Official mittwald API client
- `@mittwald/ext-bridge`: Extension bridge for authentication
- `express`: Web framework
- `mongodb`: Database driver
- `node-ssh`: SSH operations
- `zod`: Schema validation

### Build Configuration
- Uses `tsup` for bundling (outputs both CJS and ESM)
- TypeScript with strict mode enabled
- ES2016 target with ES2015 modules
- Source maps enabled for debugging

## Testing
Currently no test setup. Test script exits with error.
