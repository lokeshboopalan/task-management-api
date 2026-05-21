# 🚀 Task Management API

A production-ready, enterprise-grade REST API built with **NestJS** and **TypeScript**, featuring JWT authentication, RBAC, Redis caching, event-driven architecture, and comprehensive security.

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 + TypeScript |
| Database | PostgreSQL 16 via TypeORM |
| Caching | Redis 7 (in-memory fallback) |
| Authentication | JWT (access + refresh tokens) |
| Password Hashing | bcrypt |
| Events | EventEmitter2 |
| Validation | class-validator + class-transformer |
| Docs | Swagger / OpenAPI |
| Security | Helmet, Throttler, CORS |
| Containerization | Docker + Docker Compose |

---

## 🗂 Project Structure

```
src/
├── main.ts                        # App bootstrap, Swagger, global middleware
├── app.module.ts                  # Root module
│
├── config/
│   ├── app.config.ts              # App/port/CORS config
│   ├── database.config.ts         # TypeORM/PostgreSQL config
│   ├── jwt.config.ts              # JWT secrets + expiry
│   ├── redis.config.ts            # Redis connection config
│   └── throttle.config.ts         # Rate limiter config
│
├── database/
│   ├── data-source.ts             # TypeORM CLI DataSource
│   ├── migrations/
│   │   └── 1700000000000-InitialMigration.ts
│   └── seeds/
│       └── seed.ts                # Admin + demo user seeder
│
└── modules/
    ├── auth/
    │   ├── auth.controller.ts     # Register, login, refresh, logout, me
    │   ├── auth.service.ts        # JWT logic, transactions, bcrypt
    │   ├── auth.module.ts
    │   ├── dto/auth.dto.ts        # RegisterDto, LoginDto, AuthResponseDto
    │   └── strategies/
    │       ├── jwt.strategy.ts        # Access token validation
    │       └── jwt-refresh.strategy.ts # Refresh token validation
    │
    ├── user/
    │   ├── user.controller.ts     # CRUD + admin-only routes
    │   ├── user.service.ts        # Business logic
    │   ├── user.module.ts
    │   ├── entities/user.entity.ts
    │   ├── dto/user.dto.ts
    │   └── repositories/
    │       └── user.repository.ts # Data access layer
    │
    ├── task/
    │   ├── task.controller.ts     # CRUD with filtering
    │   ├── task.service.ts        # Business logic + caching
    │   ├── task.module.ts
    │   ├── entities/task.entity.ts
    │   ├── dto/task.dto.ts
    │   ├── repositories/
    │   │   └── task.repository.ts # QueryBuilder-based data access
    │   └── listeners/
    │       └── task-event.listener.ts # Event handlers
    │
    └── common/
        ├── interfaces/index.ts    # Shared TypeScript interfaces
        ├── decorators/
        │   ├── current-user.decorator.ts
        │   ├── public.decorator.ts
        │   └── roles.decorator.ts
        ├── filters/
        │   └── global-exception.filter.ts
        ├── guards/
        │   ├── jwt-auth.guard.ts
        │   └── roles.guard.ts
        └── interceptors/
            ├── transform.interceptor.ts
            └── logging.interceptor.ts
```

---

## ⚡ Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL + Redis)

### 1. Clone and Install

```bash
git clone <repo-url>
cd task-management-api
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values (defaults work with Docker Compose)
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL + Redis
docker-compose up -d

# Verify containers are running
docker-compose ps
```

### 4. Run Database Migration

```bash
npm run migration:run
```

### 5. Seed Initial Data

```bash
npm run seed
```

This creates:
- **Admin:** `admin@taskmanager.com` / `Admin@123456`
- **Demo User:** `demo@taskmanager.com` / `Demo@123456` (+ 5 sample tasks)

### 6. Start the Application

```bash
# Development (with hot-reload)
npm run start:dev

# Production
npm run build && npm run start:prod
```

### 7. Explore

| URL | Description |
|---|---|
| `http://localhost:3000/api/v1` | API base URL |
| `http://localhost:3000/docs` | Swagger UI |

---

## 🔐 Authentication Flow

```
1. POST /api/v1/auth/register  →  { accessToken, refreshToken }
2. POST /api/v1/auth/login     →  { accessToken, refreshToken }
3. Add header: Authorization: Bearer <accessToken>
4. When accessToken expires (15m):
   POST /api/v1/auth/refresh   →  { new accessToken, new refreshToken }
5. POST /api/v1/auth/logout    →  invalidates refreshToken in DB
```

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ❌ Public | Create account |
| POST | `/auth/login` | ❌ Public | Login |
| POST | `/auth/refresh` | Refresh Token | Rotate tokens |
| POST | `/auth/logout` | ✅ Bearer | Invalidate session |
| GET | `/auth/me` | ✅ Bearer | Current user info |

### Users

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/users` | Admin | List all users (paginated) |
| GET | `/users/profile` | Any | Own profile |
| GET | `/users/:id` | Admin | Get user by ID |
| POST | `/users` | Admin | Create user |
| PATCH | `/users/:id` | Admin / Own | Update user |
| PATCH | `/users/:id/deactivate` | Admin | Soft-delete user |
| DELETE | `/users/:id` | Admin | Hard-delete user |

### Tasks

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/tasks` | Any | List tasks (filtered/paginated) |
| GET | `/tasks/:id` | Any | Get task by ID |
| POST | `/tasks` | Any | Create task |
| PATCH | `/tasks/:id` | Any / Admin | Update task |
| DELETE | `/tasks/:id` | Any / Admin | Delete task |

#### Task Filters (Query Params)

| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `status` | enum | `todo` | Filter by status |
| `priority` | enum | `high` | Filter by priority |
| `search` | string | `auth` | Search title + description |
| `page` | number | `1` | Page number |
| `limit` | number | `10` | Items per page (max 100) |
| `sortBy` | string | `createdAt` | Sort field |
| `sortOrder` | enum | `DESC` | ASC or DESC |

---

## 🏗 Architecture Highlights

### Transaction Example — Register

When a new user registers, `AuthService.register()` wraps the entire operation in a **QueryRunner transaction**:

```
BEGIN TRANSACTION
  1. Check email/username uniqueness
  2. Hash password
  3. INSERT user
  4. INSERT 2 default onboarding tasks
COMMIT  ←  or ROLLBACK on any failure
```

### QueryBuilder — Task Filtering

`TaskRepository.findWithFilters()` uses TypeORM's QueryBuilder:

```typescript
qb.createQueryBuilder('task')
  .where('task.userId = :userId')        // scope to user
  .andWhere('task.status = :status')     // filter
  .andWhere('LOWER(task.title) LIKE :s') // search
  .orderBy('task.createdAt', 'DESC')     // sort
  .skip(offset).take(limit)             // paginate
  .getManyAndCount()                     // total count in one query
```

### Caching Strategy

```
GET /tasks?status=todo&page=1
   ↓
Cache key: tasks:userId:{"status":"todo","page":1}
   ↓ HIT → return cached result (Redis TTL: 5 min)
   ↓ MISS → query DB → store in cache → return

POST/PATCH/DELETE /tasks/:id
   → invalidate all cache keys for affected user
```

### Event Flow

```
AuthService.register()
   → eventEmitter.emit('user.created', { userId, email })
       → TaskEventListener.handleUserCreated()   [async, non-blocking]
           → log / send welcome email / analytics

TaskService.create()
   → eventEmitter.emit('task.created', { taskId, title, userId })
       → TaskEventListener.handleTaskCreated()   [async, non-blocking]
```

### Security Layers

```
Request
  → Helmet (security headers)
  → CORS whitelist
  → ThrottlerGuard (rate limit: 100 req/min)
  → JwtAuthGuard (validates Bearer token, checks @Public())
  → RolesGuard (checks @Roles() decorator)
  → ValidationPipe (whitelist + transform DTO)
  → Controller
  → Service (business logic + ownership checks)
```

---

## 🗄 Database Schema

```sql
users
  id          UUID PK
  email       VARCHAR(255) UNIQUE
  username    VARCHAR(100) UNIQUE
  password    VARCHAR(255)          -- bcrypt hashed
  firstName   VARCHAR(100)
  lastName    VARCHAR(100)
  role        ENUM(admin, user)
  isActive    BOOLEAN
  refreshToken VARCHAR                -- bcrypt hashed
  createdAt   TIMESTAMP
  updatedAt   TIMESTAMP

tasks
  id          UUID PK
  title       VARCHAR(255)
  description TEXT
  status      ENUM(todo, in_progress, done, cancelled)
  priority    ENUM(low, medium, high, urgent)
  dueDate     TIMESTAMP
  userId      UUID FK → users.id (CASCADE DELETE)
  createdAt   TIMESTAMP
  updatedAt   TIMESTAMP
```

---

## 🧪 Running Migrations

```bash
# Run all pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Generate new migration from entity changes
npm run migration:generate -- src/database/migrations/YourMigrationName
```

---

## 🔧 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Environment |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `postgres` | DB username |
| `DB_PASSWORD` | `postgres` | DB password |
| `DB_NAME` | `task_management` | Database name |
| `JWT_ACCESS_SECRET` | — | **Change in production!** |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_SECRET` | — | **Change in production!** |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `THROTTLE_TTL` | `60000` | Rate limit window (ms) |
| `THROTTLE_LIMIT` | `100` | Max requests per window |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed origins |

---

## 📬 Postman

Import `Task-Management-API.postman_collection.json` into Postman.

The collection includes pre-configured test scripts that **automatically extract and store** the `accessToken`, `refreshToken`, and `taskId` as collection variables — no manual copy-paste needed.

---

## 🚀 Production Checklist

- [ ] Change `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to long random strings
- [ ] Set `NODE_ENV=production`
- [ ] Set `BCRYPT_ROUNDS=12` (or higher)
- [ ] Configure a real Redis instance
- [ ] Set up proper database SSL (`DB_SSL=true`)
- [ ] Configure `CORS_ORIGIN` to your frontend domain(s)
- [ ] Set up process manager (PM2) or containerize with Docker
- [ ] Enable database backups
- [ ] Add application monitoring (Sentry, DataDog, etc.)
- [ ] Review and tighten rate limits for your traffic patterns
