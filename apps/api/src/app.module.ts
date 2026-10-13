import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResumeModule } from './modules/resume/resume.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { PipelineModule } from './modules/pipeline/pipeline.module.js';
import { ApplyModule } from './modules/apply/apply.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ResumeModule,
    JobsModule,
    AgentsModule,
    PipelineModule,
    ApplyModule,
    SessionsModule,
    AnalyticsModule,
    NotificationsModule,
    BillingModule,
    TenantsModule,
  ],
})
export class AppModule {}
