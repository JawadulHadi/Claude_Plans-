import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { PLAN_LIMITS } from '@pitchfire/shared';
import type { Plan } from '@pitchfire/shared';

const PRICE_IDS: Record<string, Plan> = {
  [process.env.STRIPE_PRICE_PRO    ?? 'price_pro']:    'pro',
  [process.env.STRIPE_PRICE_AGENCY ?? 'price_agency']: 'agency',
};

@Injectable()
export class BillingService {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2025-06-30.basil',
  });

  private readonly db = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  );

  async getPortalUrl(userId: string): Promise<{ url: string }> {
    const { data: user } = await this.db
      .from('users')
      .select('stripe_customer_id, plan, applications_this_month, plan_period_end')
      .eq('id', userId)
      .single();

    if (!user?.stripe_customer_id) {
      throw new BadRequestException('No billing account found — upgrade first.');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.WEB_URL}/billing`,
    });

    return { url: session.url };
  }

  async createCheckoutSession(userId: string, plan: 'pro' | 'agency'): Promise<{ url: string }> {
    const priceId = plan === 'pro'
      ? (process.env.STRIPE_PRICE_PRO ?? '')
      : (process.env.STRIPE_PRICE_AGENCY ?? '');

    if (!priceId) {
      throw new BadRequestException(`Stripe price ID for "${plan}" plan not configured.`);
    }

    const { data: user } = await this.db
      .from('users')
      .select('email, stripe_customer_id')
      .eq('id', userId)
      .single();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.WEB_URL}/billing?upgraded=1`,
      cancel_url:  `${process.env.WEB_URL}/billing?cancelled=1`,
      metadata: { user_id: userId },
      subscription_data: { metadata: { user_id: userId } },
    };

    if (user?.stripe_customer_id) {
      sessionParams.customer = user.stripe_customer_id;
    } else if (user?.email) {
      sessionParams.customer_email = user.email;
    }

    const session = await this.stripe.checkout.sessions.create(sessionParams);
    return { url: session.url! };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET ?? '',
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature.');
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.user_id;
    if (!userId || !session.subscription) return;

    const sub = await this.stripe.subscriptions.retrieve(session.subscription as string);
    const priceId = sub.items.data[0]?.price.id ?? '';
    const plan: Plan = PRICE_IDS[priceId] ?? 'free';

    await this.db.from('users').update({
      plan,
      stripe_customer_id:      session.customer as string,
      stripe_subscription_id:  sub.id,
      plan_period_start:       new Date(sub.current_period_start * 1000).toISOString(),
      plan_period_end:         new Date(sub.current_period_end   * 1000).toISOString(),
      applications_this_month: 0,
    }).eq('id', userId);
  }

  private async handleSubscriptionChange(sub: Stripe.Subscription): Promise<void> {
    const userId = sub.metadata?.user_id;
    if (!userId) return;

    const priceId = sub.items.data[0]?.price.id ?? '';
    const plan: Plan = sub.status === 'active' ? (PRICE_IDS[priceId] ?? 'free') : 'free';

    await this.db.from('users').update({
      plan,
      stripe_subscription_id:  sub.id,
      plan_period_start:       new Date(sub.current_period_start * 1000).toISOString(),
      plan_period_end:         new Date(sub.current_period_end   * 1000).toISOString(),
      applications_this_month: 0,
    }).eq('id', userId);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // Downgrade to free on failed payment — Stripe will retry, but we enforce limits
    const customerId = invoice.customer as string;
    if (!customerId) return;

    await this.db.from('users').update({ plan: 'free' })
      .eq('stripe_customer_id', customerId);
  }

  async enforceLimit(userId: string): Promise<void> {
    const { data: user } = await this.db
      .from('users')
      .select('plan, applications_this_month')
      .eq('id', userId)
      .single();

    if (!user) return;
    const limit = PLAN_LIMITS[user.plan as Plan].applications_per_month;
    if (user.applications_this_month >= limit) {
      throw new ForbiddenException(
        `Monthly application limit reached (${limit}). Upgrade to Pro for unlimited applications.`,
      );
    }
  }

  async incrementUsage(userId: string): Promise<void> {
    await this.db.rpc('increment_applications_count', { uid: userId });
  }

  async getUserBilling(userId: string) {
    const { data: user } = await this.db
      .from('users')
      .select('plan, applications_this_month, plan_period_end, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (!user) return null;

    const plan = user.plan as Plan;
    const limit = PLAN_LIMITS[plan].applications_per_month;

    return {
      plan,
      applications_used:  user.applications_this_month,
      applications_limit: limit === 9999 ? null : limit,
      period_end:         user.plan_period_end,
      has_billing:        !!user.stripe_customer_id,
    };
  }
}
