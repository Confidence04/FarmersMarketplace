'use strict';
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const db = require('../db/schema');
const { err } = require('./error');

/** Require a fresh TOTP or one-time recovery code for a sensitive action. */
module.exports = async function requireStepUp2FA(req, res, next) {
  try {
    const { rows } = await db.query('SELECT * FROM user_2fa_settings WHERE user_id = $1', [req.user.id]);
    const settings = rows[0];
    // Accounts without 2FA remain usable; enabling 2FA turns on step-up checks.
    if (!settings || !(settings.enabled === 1 || settings.enabled === true)) return next();
    const code = String(req.get('X-2FA-Code') || req.body?.totp_code || req.body?.two_factor_code || '').trim();
    if (!code) return err(res, 401, 'Two-factor authentication is required', 'step_up_required');
    let verified = false;
    if (/^\d{6}$/.test(code)) {
      verified = speakeasy.totp.verify({
        secret: settings.totp_secret || settings.secret,
        encoding: 'base32',
        token: code,
        window: 1,
      });
    } else {
      const hash = crypto.createHash('sha256').update(code).digest('hex');
      const consumed = await db.query(
        'UPDATE two_factor_recovery_codes SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL',
        [req.user.id, hash]
      );
      if (consumed.rowCount > 0) verified = true;
      else {
        const legacyCodes = JSON.parse(settings.backup_codes || '[]');
        const position = legacyCodes.indexOf(hash);
        if (position >= 0) {
          legacyCodes.splice(position, 1);
          await db.query('UPDATE user_2fa_settings SET backup_codes = $1 WHERE user_id = $2', [JSON.stringify(legacyCodes), req.user.id]);
          verified = true;
        }
      }
    }
    if (!verified) return err(res, 401, 'Invalid or already-used two-factor code', 'invalid_step_up');
    req.stepUpVerified = true;
    next();
  } catch (e) {
    return err(res, 500, 'Unable to verify two-factor authentication', 'step_up_error');
  }
};
