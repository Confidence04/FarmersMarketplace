'use strict';

const crypto = require('crypto');
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

function verifyWebhookSignature(secret, rawBody, signatureHeader) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

function verifyVersionedWebhookSignature(secret, rawBody, timestamp, signatureHeader) {
  if (!signatureHeader?.startsWith('v1=') || !/^\d+$/.test(String(timestamp))) return false;
  const expected =
    'v1=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

function webhookMiddleware(getSecret) {
  return async (req, res, next) => {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    if (!signature)
      return res.status(401).json({ error: 'Missing signature', code: 'invalid_signature' });
    const ts = Number(timestamp);
    if (
      (signature.startsWith('v1=') && !timestamp) ||
      (timestamp && (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS))
    ) {
      return res
        .status(400)
        .json({ error: 'Request timestamp too old or invalid', code: 'replay_detected' });
    }
    let secret;
    try {
      secret = await getSecret(req);
    } catch (_error) {
      return res.status(500).json({ error: 'Could not retrieve webhook secret' });
    }
    if (!secret)
      return res
        .status(401)
        .json({ error: 'No webhook secret configured', code: 'invalid_signature' });
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const valid = signature.startsWith('v1=')
      ? verifyVersionedWebhookSignature(secret, rawBody, timestamp, signature)
      : verifyWebhookSignature(secret, rawBody, signature);
    if (!valid)
      return res.status(401).json({ error: 'Invalid signature', code: 'invalid_signature' });
    next();
  };
}

module.exports = { verifyWebhookSignature, verifyVersionedWebhookSignature, webhookMiddleware };
