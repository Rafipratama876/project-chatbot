import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProofsModule } from '#/modules/proofs/proofs.module.js';
import { DesignsModule } from '#/modules/designs/designs.module.js';
import { PROOF_QUEUE } from './proof.queue.js';
import { ProofProcessor } from './proof.processor.js';

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
      useFactory: (config: ConfigService) => ({
        defaultJobOptions: {
          attempts: config.get<number>('queue.attempts') ?? 2,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: false,
        },
      }),
    }),
    ProofsModule,
    DesignsModule,
  ],
  providers: [ProofProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
