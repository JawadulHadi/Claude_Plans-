import { Injectable, Logger } from '@nestjs/common';

export type NotificationEvent =
  | 'application_submitted'
  | 'reply_received'
  | 'interview_scheduled'
  | 'offer_received'
  | 'dlq_alert'
  | 'low_confidence_flag';

export interface NotificationPayload {
  event: NotificationEvent;
  userId: string;
  title: string;
  body: string;
  url?: string;
}

/**
 * NotificationsService: Sends Slack webhook notifications for key pipeline events.
 * Uses incoming webhooks (no OAuth required) — set SLACK_WEBHOOK_URL in .env.
 *
 * Phase 4 deliverable. Phase 5 will add per-user webhook routing for agency mode.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async send(payload: NotificationPayload): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      this.logger.debug(`Slack webhook not configured — skipping notification: ${payload.event}`);
      return;
    }

    const block = this.buildSlackBlock(payload);
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block),
      });
      if (!res.ok) {
        this.logger.warn(`Slack webhook returned ${res.status} for event ${payload.event}`);
      }
    } catch (err) {
      this.logger.error(`Slack notification failed: ${(err as Error).message}`);
    }
  }

  private buildSlackBlock(payload: NotificationPayload) {
    const icon = {
      application_submitted: '📤',
      reply_received: '📬',
      interview_scheduled: '📅',
      offer_received: '🎉',
      dlq_alert: '⚠️',
      low_confidence_flag: '🔍',
    }[payload.event] ?? '🔔';

    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${icon} *${payload.title}*\n${payload.body}`,
          },
          ...(payload.url
            ? {
                accessory: {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View in PitchFire' },
                  url: payload.url,
                },
              }
            : {}),
        },
        { type: 'divider' },
      ],
    };
  }
}
