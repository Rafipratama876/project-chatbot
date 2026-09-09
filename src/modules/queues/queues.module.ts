import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProofsModule } from '#/modules/proofs/proofs.module.js';
import { DesignsModule } from '#/modules/designs/designs.module.js';
import { DLProofsModule } from '#/modules/dl-proofs/dl-proofs.module.js';
import { SCProofsModule } from '#/modules/sc-proofs/sc-proofs.module.js';
import { PROOF_QUEUE } from './proof.queue.js';
import { ProofProcessor } from './proof.processor.js';
import { DL_PROOF_QUEUE } from './dl-proof.queue.js';
import { DLProofProcessor } from './dl-proof.processor.js';
import { SC_PROOF_QUEUE } from './sc-proof.queue.js';
import { SCProofProcessor } from './sc-proof.processor.js';

/** Same `defaultJobOptions` for every proof queue — one retry policy, not three to keep in sync. */
const jobOptionsFactory = (config: ConfigService) => ({
  defaultJobOptions: {
    attempts: config.get<number>('queue.attempts') ?? 2,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: false,
  },
});

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: config.getOrThrow('queue.redis'),
      }),
    }),
    BullModule.registerQueueAsync({
      name: PROOF_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: jobOptionsFactory,
    }),
    // Dimensional Letters and Sign Cabinets — their own queues, their own
    // workers, own retry policy shape but the SAME numbers (`queue.attempts`,
    // the same backoff) as Channel Letters'. Cross-queue throttling that
    // actually matters (all three share one `RenderService`/`Browser`) is
    // `RenderService`'s own semaphore, not anything BullMQ-level here.
    BullModule.registerQueueAsync({
      name: DL_PROOF_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: jobOptionsFactory,
    }),
    BullModule.registerQueueAsync({
      name: SC_PROOF_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: jobOptionsFactory,
    }),
    ProofsModule,
    DesignsModule,
    DLProofsModule,
    SCProofsModule,
  ],
  providers: [ProofProcessor, DLProofProcessor, SCProofProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
