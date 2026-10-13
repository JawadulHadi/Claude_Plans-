import {
  Controller, Get, Post, Param, Body, RawBodyRequest, Req, Headers,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BillingService } from './billing.service.js';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Get current plan + usage for user' })
  getUserBilling(@Param('userId') userId: string) {
    return this.billing.getUserBilling(userId);
  }

  @Post(':userId/checkout/:plan')
  @ApiOperation({ summary: 'Create Stripe Checkout session (pro | agency)' })
  checkout(
    @Param('userId') userId: string,
    @Param('plan') plan: 'pro' | 'agency',
  ) {
    return this.billing.createCheckoutSession(userId, plan);
  }

  @Post(':userId/portal')
  @ApiOperation({ summary: 'Create Stripe Customer Portal session' })
  portal(@Param('userId') userId: string) {
    return this.billing.getPortalUrl(userId);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook receiver (raw body required)' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
  ) {
    return this.billing.handleWebhook(req.rawBody!, sig);
  }
}
