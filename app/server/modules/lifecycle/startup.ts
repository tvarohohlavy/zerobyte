import { Scheduler } from "../../core/scheduler";
import { and, eq, or } from "drizzle-orm";
import { db } from "../../db/db";
import { volumesTable } from "../../db/schema";
import { logger } from "../../utils/logger";
import { restic } from "../../utils/restic";
import { volumeService } from "../volumes/volume.service";
import { CleanupDanglingMountsJob } from "../../jobs/cleanup-dangling";
import { VolumeHealthCheckJob } from "../../jobs/healthchecks";
import { RepositoryHealthCheckJob } from "../../jobs/repository-healthchecks";
import { BackupExecutionJob } from "../../jobs/backup-execution";
import { CleanupSessionsJob } from "../../jobs/cleanup-sessions";

export const startup = async () => {
		let configFileVolumes = [];
		let configFileRepositories = [];
		let configFileBackupSchedules = [];
		let configFileNotificationDestinations = [];
	    let configFileAdmin = null;
		try {
			const configPath = process.env.ZEROBYTE_CONFIG_PATH || "zerobyte.config.json";
			const fs = await import("node:fs/promises");
			const path = await import("node:path");
			const configFullPath = path.resolve(process.cwd(), configPath);
			if (await fs.stat(configFullPath).then(() => true, () => false)) {
				const raw = await fs.readFile(configFullPath, "utf-8");
				const config = JSON.parse(raw);
				// Interpolate env vars in config
				function interpolate(obj) {
					if (typeof obj === "string") {
						return obj.replace(/\$\{([^}]+)\}/g, (_, v) => process.env[v] || "");
					} else if (Array.isArray(obj)) {
						return obj.map(interpolate);
					} else if (obj && typeof obj === "object") {
						return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, interpolate(v)]));
					}
					return obj;
				}
				configFileVolumes = interpolate(config.volumes || []);
				configFileRepositories = interpolate(config.repositories || []);
				configFileBackupSchedules = interpolate(config.backupSchedules || []);
				configFileNotificationDestinations = interpolate(config.notificationDestinations || []);
	            configFileAdmin = interpolate(config.admin || null);
			}
		} catch (e) {
			logger.warn(`No config file loaded or error parsing config: ${e.message}`);
		}

	await Scheduler.start();
	await Scheduler.clear();

	await restic.ensurePassfile().catch((err) => {
		logger.error(`Error ensuring restic passfile exists: ${err.message}`);
	});

	try {
		for (const v of configFileVolumes) {
			try {
				await volumeService.createVolume(v.name, v.config);
				logger.info(`Initialized volume from config: ${v.name}`);
			} catch (e) {
				const err = e instanceof Error ? e : new Error(String(e));
				logger.warn(`Volume ${v.name} not created: ${err.message}`);
			}
		}
		const repoServiceModule = await import("../repositories/repositories.service");
		for (const r of configFileRepositories) {
			try {
				await repoServiceModule.repositoriesService.createRepository(r.name, r.config, r.compressionMode);
				logger.info(`Initialized repository from config: ${r.name}`);
			} catch (e) {
				const err = e instanceof Error ? e : new Error(String(e));
				logger.warn(`Repository ${r.name} not created: ${err.message}`);
			}
		}
		const notificationsServiceModule = await import("../notifications/notifications.service");
		for (const n of configFileNotificationDestinations) {
			try {
				await notificationsServiceModule.notificationsService.createDestination(n.name, n.config);
				logger.info(`Initialized notification destination from config: ${n.name}`);
			} catch (e) {
				const err = e instanceof Error ? e : new Error(String(e));
				logger.warn(`Notification destination ${n.name} not created: ${err.message}`);
			}
		}

		// Wait for all referenced volumes to be ready before creating backup schedules
		const backupServiceModule = await import("../backups/backups.service");
		for (const s of configFileBackupSchedules) {
			const volume = await db.query.volumesTable.findFirst({
				where: eq(volumesTable.name, s.volumeName),
			});
			if (volume && volume.status !== "mounted") {
				try {
					await volumeService.mountVolume(volume.name);
					logger.info(`Mounted volume ${volume.name} for backup schedule ${s.cronExpression || s.name}`);
				} catch (e) {
					const err = e instanceof Error ? e : new Error(String(e));
					logger.warn(`Could not mount volume ${volume.name} for backup schedule ${s.cronExpression || s.name}: ${err.message}`);
					continue;
				}
			}
			try {
				await backupServiceModule.backupsService.createSchedule(s);
				logger.info(`Initialized backup schedule from config: ${s.cronExpression || s.name}`);
			} catch (e) {
				const err = e instanceof Error ? e : new Error(String(e));
				logger.warn(`Backup schedule not created: ${err.message}`);
			}

		}
		
		try {
			const { authService } = await import("../auth/auth.service");
			const fs = await import("node:fs/promises");
			// Static import for RESTIC_PASS_FILE
			const { RESTIC_PASS_FILE } = await import("../../core/constants.js");
			if (configFileAdmin && configFileAdmin.username && configFileAdmin.password) {
				const hasUsers = await authService.hasUsers();
				if (!hasUsers) {
					// Register admin user
					const { user } = await authService.register(configFileAdmin.username, configFileAdmin.password);
					logger.info(`Admin user '${configFileAdmin.username}' created from config.`);
					// Write recovery key
					try {
						let recoveryKey: string;
						if (configFileAdmin.recoveryKey) {
							recoveryKey = configFileAdmin.recoveryKey;
							// Mark as downloaded so UI does not prompt
							await db.update(usersTable).set({ hasDownloadedResticPassword: true }).where(eq(usersTable.id, user.id));
						} else {
							recoveryKey = await fs.readFile(RESTIC_PASS_FILE, "utf-8");
						}
						await fs.writeFile(RESTIC_PASS_FILE, recoveryKey, { mode: 0o600 });
						logger.info(`Recovery key written to ${RESTIC_PASS_FILE}`);
					} catch (err) {
						logger.error(`Failed to write recovery key: ${err.message}`);
					}
				}
			} else {
				logger.warn("Admin config missing required fields (username, password). Skipping automated admin setup.");
			}
		} catch (err) {
			logger.error(`Automated admin setup failed: ${err.message}`);
		}
	} catch (e) {
		const err = e instanceof Error ? e : new Error(String(e));
		logger.error(`Failed to initialize from config: ${err.message}`);
	}

	const volumes = await db.query.volumesTable.findMany({
		where: or(
			eq(volumesTable.status, "mounted"),
			and(eq(volumesTable.autoRemount, true), eq(volumesTable.status, "error")),
		),
	});

	for (const volume of volumes) {
		await volumeService.mountVolume(volume.name).catch((err) => {
			logger.error(`Error auto-remounting volume ${volume.name} on startup: ${err.message}`);
		});
	}

	Scheduler.build(CleanupDanglingMountsJob).schedule("0 * * * *");
	Scheduler.build(VolumeHealthCheckJob).schedule("*/30 * * * *");
	Scheduler.build(RepositoryHealthCheckJob).schedule("0 * * * *");
	Scheduler.build(BackupExecutionJob).schedule("* * * * *");
	Scheduler.build(CleanupSessionsJob).schedule("0 0 * * *");
};
