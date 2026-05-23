const cron = require('node-cron');
const db = require("../config/db"); // adjust path to your db config
cron.schedule('*/5 * * * * *', async () => {
  try {
    console.log('[CRON] Running geo auto-checkout...');

    const [rows] = await db.execute(`
      SELECT 
        a.id, a.employee_id, a.check_in, a.working_hours,
        a.last_active_time, a.last_lat, a.last_lng,
        o.latitude AS office_lat, 
        o.longitude AS office_lng, 
        o.radius
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN office_locations o ON e.office_id = o.id
      WHERE a.check_out IS NULL
    `);

    for (const row of rows) {

      // ❌ Skip if location not available
      if (!row.last_lat || !row.last_lng) {
        console.log(`[CRON] Skipping ${row.id}, no location`);
        continue;
      }

      // 📍 Calculate distance
      const distance = getDistance(
        row.last_lat,
        row.last_lng,
        row.office_lat,
        row.office_lng
      );

      console.log(`[CRON] Employee ${row.id} distance: ${distance}m`);

      // ❌ If OUTSIDE office radius → checkout
      if (distance > row.radius) {

        const lastActive = row.last_active_time 
          ? new Date(row.last_active_time) 
          : new Date(row.check_in);

        const now = new Date();
        const previous = row.working_hours || 0;

        // ✅ Only calculate time till last active (NOT after leaving)
        const diff = (lastActive - new Date(row.check_in)) / 1000;

        const totalTime = previous + diff;

        await db.execute(
          `UPDATE attendance 
           SET check_out = NOW(), 
               working_hours = ?,
               status = 'auto-completed (out of range)'
           WHERE id = ?`,
          [totalTime, row.id]
        );

        console.log(`[CRON] Auto checkout (OUTSIDE) ${row.id}`);
      } 
      else {
        console.log(`[CRON] ${row.id} inside office, continue`);
      }
    }

  } catch (err) {
    console.error("[CRON] Error:", err);
  }
});