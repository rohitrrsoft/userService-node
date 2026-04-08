const { json } = require('../../lib/middleware');
const { query } = require('../../lib/db');
const { sendNotification } = require('../../lib/fcm');

const TIMEZONE_ABBREVIATION_MAP = {
  EST: 'America/New_York', EDT: 'America/New_York',
  CST: 'America/Chicago', CDT: 'America/Chicago',
  MST: 'America/Denver', MDT: 'America/Denver',
  PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  GMT: 'GMT', UTC: 'UTC',
  IST: 'Asia/Kolkata',
  CET: 'Europe/Paris', CEST: 'Europe/Paris',
  JST: 'Asia/Tokyo',
  AEST: 'Australia/Sydney', AEDT: 'Australia/Sydney',
};

module.exports = async (req, res) => {
  // Vercel cron sends GET requests
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  // Verify request is from cron-job.org or authorized caller
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const querySecret = url.searchParams.get('secret');
    const authHeader = req.headers['authorization'];
    if (querySecret !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return json(res, 401, { error: 'Unauthorized' });
    }
  }

  try {
    // Get all users with active tokens and enabled preferences
    const usersResult = await query(`
      SELECT DISTINCT u.id AS user_id, u.first_name, u.timezone AS user_timezone,
             p.frequency_per_day, p.quiet_hours_start, p.quiet_hours_end,
             p.timezone AS pref_timezone, p.message_types
      FROM users u
      JOIN user_notification_tokens t ON t.user_id = u.id AND t.active = true
      JOIN user_notification_preferences p ON p.user_id = u.id AND p.enabled = true
      WHERE u.active = true AND u.deleted_at IS NULL
    `);

    let sentCount = 0;
    let skippedCount = 0;

    for (const userData of usersResult.rows) {
      try {
        const tz = resolveTimezone(userData.user_timezone || userData.pref_timezone || 'UTC');

        // Get current time in user's timezone using Postgres
        const timeResult = await query(
          `SELECT (NOW() AT TIME ZONE $1)::time AS current_time_local`,
          [tz]
        );
        const currentTimeStr = timeResult.rows[0].current_time_local;

        // Check quiet hours
        const quietStart = userData.quiet_hours_start;
        const quietEnd = userData.quiet_hours_end;
        if (isQuietHours(currentTimeStr, quietStart, quietEnd)) {
          skippedCount++;
          continue;
        }

        // Check interval since last notification
        const activeHours = calculateActiveHours(quietStart, quietEnd);
        const intervalMinutes = (activeHours * 60) / userData.frequency_per_day;

        const lastNotif = await query(
          `SELECT sent_at FROM notification_history
           WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 1`,
          [userData.user_id]
        );

        if (lastNotif.rows.length > 0) {
          const minutesSince = (Date.now() - new Date(lastNotif.rows[0].sent_at).getTime()) / 60000;
          if (minutesSince < intervalMinutes) {
            skippedCount++;
            continue;
          }
        }

        // Pick random message type
        const messageTypes = (userData.message_types || 'hydration').split(',');
        const messageType = messageTypes[Math.floor(Math.random() * messageTypes.length)].trim();

        // Get message from motivation_messages table
        const msgResult = await query(
          `SELECT message, title FROM motivation_messages
           WHERE type = $1 AND active = true AND deleted_at IS NULL
           ORDER BY RANDOM() LIMIT 1`,
          [messageType.toUpperCase()]
        );

        const title = 'WaterNation 💧';
        const body = msgResult.rows.length > 0
          ? msgResult.rows[0].message
          : getDefaultMessage(messageType);

        // Get active tokens for user
        const tokens = await query(
          'SELECT * FROM user_notification_tokens WHERE user_id = $1 AND active = true',
          [userData.user_id]
        );

        for (const token of tokens.rows) {
          const result = await sendNotification(
            token.fcm_token, title, body,
            { type: messageType },
            token.platform
          );

          // Log to history
          await query(
            `INSERT INTO notification_history (user_id, message, message_type, status, ai_generated, fcm_message_id, error_message, sent_at)
             VALUES ($1, $2, $3, $4, false, $5, $6, NOW())`,
            [userData.user_id, body, messageType, result.success ? 'sent' : 'failed', result.messageId, result.error]
          );

          if (result.invalidToken) {
            await query(
              'UPDATE user_notification_tokens SET active = false, updated_at = NOW() WHERE id = $1',
              [token.id]
            );
          }
        }

        sentCount++;
      } catch (e) {
        console.error(`Error processing user ${userData.user_id}:`, e.message);
      }
    }

    return json(res, 200, {
      message: `Processed ${usersResult.rows.length} users. Sent: ${sentCount}, Skipped: ${skippedCount}`,
    });
  } catch (e) {
    console.error('Cron error:', e);
    return json(res, 500, { error: e.message });
  }
};

function resolveTimezone(tz) {
  if (!tz) return 'UTC';
  return TIMEZONE_ABBREVIATION_MAP[tz.toUpperCase()] || tz;
}

function timeToMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  return h * 60 + (m || 0);
}

function isQuietHours(currentTime, quietStart, quietEnd) {
  const now = timeToMinutes(currentTime);
  const start = timeToMinutes(quietStart);
  const end = timeToMinutes(quietEnd);

  if (start < end) {
    // Same day (e.g., 08:00 to 20:00)
    return now >= start && now < end;
  } else {
    // Crosses midnight (e.g., 22:00 to 08:00)
    return now >= start || now < end;
  }
}

function calculateActiveHours(quietStart, quietEnd) {
  const start = timeToMinutes(quietStart);
  const end = timeToMinutes(quietEnd);

  let quietMinutes;
  if (start < end) {
    quietMinutes = end - start;
  } else {
    quietMinutes = (1440 - start) + end;
  }
  return Math.max(1, (1440 - quietMinutes) / 60);
}

function getDefaultMessage(messageType) {
  const defaults = {
    hydration: '💧 Time to hydrate! Your body will thank you 💙',
    motivation: '🌟 You\'re doing amazing! Keep pushing forward 💪',
  };
  return defaults[messageType.toLowerCase()] || '💧 Stay hydrated! Drink some water 💙';
}
