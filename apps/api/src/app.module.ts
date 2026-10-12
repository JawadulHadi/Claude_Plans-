import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResumeModule } from './modules/resume/resume.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { PipelineModule } from './modules/pipeline/pipeline.module.js';
import { ApplyModule } from './modules/apply/apply.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ResumeModule,
    JobsModule,
    AgentsModule,
    PipelineModule,
    ApplyModule,
  ],
})
export class AppModule {}
