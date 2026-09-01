import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AppModule } from '#/modules/app.module.js';
import { preflight } from '#/modules/database/preflight.js';
import { KB_VERSION } from '#/kb/domain/boilerplate.js';
import { SpaFallbackFilter } from '#/modules/spa.filter.js';

async function bootstrap(): Promise<void> {
  // Before Nest wires anything: a service that is simply not running should
  // say so once, with the fix, rather than ten times with a stack trace.
  await preflight([
    {
      label: 'Postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5433),
      hint: 'holds the proofs, the thresholds and the pgvector stores.',
    },
    {
      label: 'Redis',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6380),
      hint: 'backs the render queue.',
    },
  ]);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Artwork payloads carry flattened outlines — a few hundred KB of points is
    // normal for a full lockup.
    new FastifyAdapter({ bodyLimit: 25 * 1024 * 1024 }),
  );

  await app.register(compression);
  // Logos and wall photographs arrive as multipart rather than base64 in JSON:
  // a 12 MP photograph inlined as base64 is a third larger and has to be held
  // in memory twice before anything can look at it.
  await app.register(fastifyMultipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
  app.enableShutdownHooks();
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // The built wizard, when there is one. The API keeps its /api prefix, so
  // static serving at / cannot shadow it. No SPA fallback: the wizard is one
  // page with no client-side routing, and a catch-all would turn every
  // mistyped API path into an HTML 200 instead of a 404.
  // Uploaded logos, wall photographs, seeded presets and exported PDFs. Served
  // read-only, and before the SPA so /static never falls through to index.html.
  const storage = path.resolve(process.env.STORAGE_DIR ?? './storage');
  await mkdir(storage, { recursive: true });
  await app.register(fastifyStatic, { root: storage, prefix: '/static/', decorateReply: false });

  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
  if (existsSync(path.join(web, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: web,
      prefix: '/',
      decorateReply: false,
      // Wildcard left on. With it off, @fastify/static globs the directory
      // once at boot and serves 404 for anything added later — so every
      // frontend rebuild would need an API restart to be reachable, with a
      // blank page and a 404 on a hashed asset as the only symptom.
    });
    // Registered as a filter rather than a Fastify not-found handler: Nest
    // installs its own during init(), and two handlers on the same prefix is a
    // hard error at boot.
    app.useGlobalFilters(new SpaFallbackFilter(path.join(web, 'index.html')));
  }

  const swagger = new DocumentBuilder()
    .setTitle('Channel Letter Proof Engine')
    .setDescription(
      `Stage-1 pre-sales proofs against ${KB_VERSION}. ` +
      'A deterministic rule engine over all 56 KB rules, a three.js renderer, ' +
      'and four bounded LLM nodes — none of them in the renderer.',
    )
    .setVersion('1')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('bootstrap').log(`listening on :${port} — KB ${KB_VERSION}`);
}

await bootstrap();
