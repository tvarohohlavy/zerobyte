import { Hono } from "hono";
import { volumesTable, repositoriesTable, backupSchedulesTable, notificationDestinationsTable, usersTable } from "../../db/schema";
import { db } from "../../db/db";
import { logger } from "../../utils/logger";

export const configExportController = new Hono()
  .get("/export", async (c) => {
    try {
      const volumes = await db.select().from(volumesTable);
      const repositories = await db.select().from(repositoriesTable);
      const backupSchedules = await db.select().from(backupSchedulesTable);
      const notifications = await db.select().from(notificationDestinationsTable);
      const [admin] = await db.select().from(usersTable).limit(1);

      const config = {
        volumes,
        repositories,
        backupSchedules,
        notificationDestinations: notifications,
        admin: admin ? { username: admin.username } : null,
      };
      return c.json(config, 200);
    } catch (err) {
      logger.error(`Config export failed: ${err instanceof Error ? err.message : String(err)}`);
      return c.json({ error: "Failed to export config" }, 500);
    }
  });
