import { Router, type IRouter } from "express";
import { db, usersTable, eq } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { checkoutSchema } from "../lib/request-schemas";
import { auditLog } from "../lib/audit-log";
import crypto from "node:crypto";

const router: IRouter = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const STRIPE_API = "https://api.stripe.com/v1";

const PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID ?? "",
  studio: process.env.STRIPE_STUDIO_PRICE_ID ?? "",
};

const PLAN_PRICES: Record<string, { name: string; price: string; features: string[] }> = {
  free: {
    name: "Free",
    price: "$0/mo",
    features: ["5 generations/month", "iOS app generation", "Community support"],
  },
  pro: {
    name: "Pro",
    price: "$29/mo",
    features: ["50 generations/month", "iOS + Web generation", "Refinement chat", "Priority support"],
  },
  studio: {
    name: "Studio",
    price: "$99/mo",
    features: ["Unlimited generations", "iOS + Web generation", "Refinement chat", "6-dimension quality scoring", "Dedicated support"],
  },
};

async function stripeRequest(
  path: string,
  method: string,
  body?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body) : undefined,
  });
  return (await res.json()) as Record<string, unknown>;
}

router.get("/billing/plans", (_req, res) => {
  res.json({ plans: PLAN_PRICES });
});

router.post("/billing/checkout", requireAuth, validateBody(checkoutSchema), async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) {
      res.status(503).json({ error: "Stripe is not configured" });
      return;
    }

    const { plan } = req.body as { plan: string };

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripeRequest("/customers", "POST", {
        email: user.email,
        "metadata[user_id]": String(user.id),
      });
      customerId = customer.id as string;
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(usersTable.id, user.id));
    }

    const origin = req.headers.origin ?? req.headers.referer ?? "http://localhost:5173";

    const session = await stripeRequest("/checkout/sessions", "POST", {
      customer: customerId,
      "line_items[0][price]": PRICE_IDS[plan]!,
      "line_items[0][quantity]": "1",
      mode: "subscription",
      success_url: `${origin}/dashboard?upgraded=1`,
      cancel_url: `${origin}/pricing`,
      "metadata[user_id]": String(user.id),
      "metadata[plan]": plan,
      "subscription_data[metadata][user_id]": String(user.id),
      "subscription_data[metadata][plan]": plan,
      allow_promotion_codes: "true",
    });

    if ((session as { error?: unknown }).error) {
      throw new Error(String(((session as { error: { message: string } }).error).message));
    }

    res.json({ url: session.url as string });
  } catch (err) {
    req.log.error({ err }, "Checkout session creation failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.get("/billing/subscription", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select({
        plan: usersTable.plan,
        subscriptionStatus: usersTable.subscriptionStatus,
        currentPeriodEnd: usersTable.currentPeriodEnd,
        monthlyGenerations: usersTable.monthlyGenerations,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      plan: user.plan,
      status: user.subscriptionStatus ?? "active",
      currentPeriodEnd: user.currentPeriodEnd,
      usage: user.monthlyGenerations,
      planDetails: PLAN_PRICES[user.plan] ?? PLAN_PRICES.free,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get subscription");
    res.status(500).json({ error: "Failed to get subscription info" });
  }
});

router.post("/billing/portal", requireAuth, async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) {
      res.status(503).json({ error: "Stripe is not configured" });
      return;
    }

    const [user] = await db
      .select({ stripeCustomerId: usersTable.stripeCustomerId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: "No billing account found. Subscribe to a plan first." });
      return;
    }

    const origin = req.headers.origin ?? req.headers.referer ?? "http://localhost:5173";

    const portalSession = await stripeRequest("/billing_portal/sessions", "POST", {
      customer: user.stripeCustomerId,
      return_url: `${origin}/dashboard`,
    });

    res.json({ url: portalSession.url as string });
  } catch (err) {
    req.log.error({ err }, "Portal session creation failed");
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

// ── Stripe Webhook ──────────────────────────────────────────────────────────

async function verifyStripeSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const parts: Record<string, string> = {};
  for (const part of signature.split(",")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) {
      parts[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
    }
  }

  const timestamp = parts["t"];
  const sig = parts["v1"];
  if (!timestamp || !sig) return false;

  // Reject replayed events older than 5 minutes
  const tolerance = 300; // seconds
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > tolerance) return false;

  const payload = `${timestamp}.${body}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expected = hmac.digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(sig, "hex"),
  );
}

function planFromMetadata(metadata: Record<string, string>): "pro" | "studio" | "free" {
  return (metadata?.plan as "pro" | "studio") ?? "free";
}

router.post("/billing/webhook", async (req, res) => {
  try {
    if (!STRIPE_WEBHOOK_SECRET) {
      res.status(503).json({ error: "Webhook secret not configured" });
      return;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const signature = (req.headers["stripe-signature"] as string) ?? "";

    const valid = await verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type as string;
    const data = event.data?.object as Record<string, unknown>;

    switch (eventType) {
      case "checkout.session.completed": {
        const userId = Number((data.metadata as Record<string, string>)?.user_id);
        const plan = planFromMetadata((data.metadata as Record<string, string>) ?? {});
        const subscriptionId = data.subscription as string;

        if (!userId || !subscriptionId) break;

        const sub = await stripeRequest(`/subscriptions/${subscriptionId}`, "GET");

        await db
          .update(usersTable)
          .set({
            plan,
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: sub.status as string,
            currentPeriodEnd: new Date((sub.current_period_end as number) * 1000),
          })
          .where(eq(usersTable.id, userId));

        auditLog({ userId, action: "billing_subscription_change", metadata: { event: "checkout.session.completed", plan, subscriptionId } });
        break;
      }

      case "customer.subscription.updated": {
        const userId = Number((data.metadata as Record<string, string>)?.user_id);
        const plan = planFromMetadata((data.metadata as Record<string, string>) ?? {});

        if (!userId) break;

        await db
          .update(usersTable)
          .set({
            plan: data.status === "canceled" ? "free" : plan,
            subscriptionStatus: data.status as string,
            currentPeriodEnd: new Date((data.current_period_end as number) * 1000),
          })
          .where(eq(usersTable.id, userId));

        auditLog({ userId, action: "billing_subscription_change", metadata: { event: "customer.subscription.updated", plan, status: data.status } });
        break;
      }

      case "customer.subscription.deleted": {
        const userId = Number((data.metadata as Record<string, string>)?.user_id);
        if (!userId) break;

        await db
          .update(usersTable)
          .set({
            plan: "free",
            subscriptionStatus: "canceled",
          })
          .where(eq(usersTable.id, userId));

        auditLog({ userId, action: "billing_subscription_change", metadata: { event: "customer.subscription.deleted" } });
        break;
      }

      default:
        req.log.info({ eventType }, "Unhandled Stripe event");
    }

    res.json({ received: true });
  } catch (err) {
    req.log.error({ err }, "Webhook processing failed");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
