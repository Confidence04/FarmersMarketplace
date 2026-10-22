'use strict';

const crypto = require('crypto');
const logger = require('../logger');
const SUPPORTED_EVENTS = ['order.paid', 'order.shipped', 'order.delivered'];
const TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

function signPayload(secret, payload) {
  return `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

function signWebhookPayload(secret, timestamp, payload) {
  return `v1=${crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
}

function buildPayload(event, order) {
  return JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: {
      order_id: order.id,
      status: order.status,
      buyer_id: order.buyer_id,
      farmer_id: order.farmer_id,
      total_amount: order.total_amount,
      currency: order.currency || 'USD',
      updated_at: order.updated_at,
    },
  });
}

function shouldRetry(result) {
  return result.status == null || result.status === 429 || result.status >= 500;
}

async function deliverWebhook(
  url,
  secret,
  payload,
  { webhookId = crypto.randomUUID(), timestamp = Date.now(), attempt = 1 } = {}
) {
  const signature = signWebhookPayload(secret, timestamp, payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Id': webhookId,
        'X-Webhook-Timestamp': String(timestamp),
        'X-Webhook-Signature': signature,
        // Keep legacy headers during the receiver migration window.
        'X-Farmers-Signature': signPayload(secret, payload),
        'X-Farmers-Event-Attempt': String(attempt),
        'User-Agent': 'FarmersMarketplace-Webhook/1.0',
      },
      body: payload,
      signal: controller.signal,
    });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: null, body: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function fireOrderWebhook(db, event, order) {
  if (!SUPPORTED_EVENTS.includes(event)) return;
  const farmer = await db('farmers').where({ id: order.farmer_id }).first();
  if (!farmer?.webhook_url || !farmer?.webhook_secret) return;
  const payload = buildPayload(event, order);
  const webhookId = crypto.randomUUID();
  const timestamp = Date.now();
  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt += 1) {
    const result = await deliverWebhook(farmer.webhook_url, farmer.webhook_secret, payload, {
      webhookId,
      timestamp,
      attempt,
    });
    await db('webhook_deliveries').insert({
      order_id: order.id,
      event,
      url: farmer.webhook_url,
      webhook_id: webhookId,
      webhook_timestamp: timestamp,
      status_code: result.status,
      success: result.ok,
      response_body: result.body?.slice(0, 1000),
      attempt,
    });
    if (result.ok || !shouldRetry(result) || attempt > RETRY_DELAYS_MS.length) return;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
  }
  logger.error(`[webhook] All attempts failed for order ${order.id} event ${event}`);
}

module.exports = {
  fireOrderWebhook,
  deliverWebhook,
  signPayload,
  signWebhookPayload,
  shouldRetry,
  SUPPORTED_EVENTS,
  RETRY_DELAYS_MS,
};
