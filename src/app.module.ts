import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

// Config files
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import throttleConfig from './config/throttle.config';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { TaskModule } from './modules/task/task.module';

// Global guards, filters, interceptors
import { JwtAuthGuard } from './modules/common/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from './modules/common/filters/global-exception.filter';
import { TransformInterceptor } from './modules/common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './modules/common/interceptors/logging.interceptor';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    // ─── Configuration ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, throttleConfig],
      envFilePath: '.env',
      cache: true,
    }),

    // ─── Database ───────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
      }),
      inject: [ConfigService],
    }),

    // ─── Cache (Redis with in-memory fallback) ──────────────────────────────
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get<string>('redis.host');
        const redisPort = configService.get<number>('redis.port');

        // Try to use Redis; fall back to in-memory for local dev
        try {
          const { createClient } = await import('redis');
          const { redisStore } = await import('cache-manager-redis-yet');
          const client = createClient({
            socket: { host: redisHost, port: redisPort },
            password: configService.get<string>('redis.password') || undefined,
          });
          await client.connect();
          return {
            store: await redisStore({ client }),
            ttl: configService.get<number>('redis.ttl') * 1000,
          };
        } catch {
          console.warn('⚠️  Redis unavailable — using in-memory cache');
          return { ttl: configService.get<number>('redis.ttl') * 1000 };
        }
      },
      inject: [ConfigService],
    }),

    // ─── Rate Limiting ──────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('throttle.ttl'),
            limit: configService.get<number>('throttle.limit'),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // ─── Event Emitter ──────────────────────────────────────────────────────
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),

    // ─── Feature Modules ────────────────────────────────────────────────────
    AuthModule,
    UserModule,
    TaskModule,
  ],

  providers: [
    // Global JWT guard — all routes protected by default unless marked @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global rate limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global exception handler
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global response transform
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Global request/response logging
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
