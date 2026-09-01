import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';

/**
 * Deep links into the wizard.
 *
 * The wizard has client-side routes now — /new, /designs/:id — so a refresh or
 * a pasted link asks the server for a path no controller owns. Serving the app
 * shell lets the router take it from there.
 *
 * Only for navigation requests. An unmatched /api path stays a JSON 404,
 * because a mistyped endpoint answering "200 OK, here is some HTML" is how a
 * client ends up parsing a page as a payload and reporting a nonsense error.
 * A missing asset stays a 404 for the same reason.
 */
@Catch(NotFoundException)
export class SpaFallbackFilter implements ExceptionFilter {
  constructor(private readonly indexFile: string) {}

  catch(exception: NotFoundException, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();

    const url = request.url ?? '';
    const isApi = url.startsWith('/api') || url.startsWith('/static') || url.startsWith('/docs');
    const wantsHtml = (request.headers.accept ?? '').includes('text/html');

    if (isApi || !wantsHtml || request.method !== 'GET') {
      void reply.status(404).send(exception.getResponse());
      return;
    }

    void reply.status(200).type('text/html').send(createReadStream(this.indexFile));
  }
}
