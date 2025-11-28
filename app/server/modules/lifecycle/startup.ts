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
		// --- Read config file and interpolate env vars ---
		let configFileVolumes = [];
		let configFileRepositories = [];
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
			}
		} catch (e) {
			logger.warn(`No config file loaded or error parsing config: ${e.message}`);
		}

	await Scheduler.start();
	await Scheduler.clear();

	await restic.ensurePassfile().catch((err) => {
		logger.error(`Error ensuring restic passfile exists: ${err.message}`);
	});

	// --- Initialize volumes and repositories from config file ---
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
	} catch (e) {
		const err = e instanceof Error ? e : new Error(String(e));
		logger.error(`Failed to initialize volumes/repositories from config: ${err.message}`);
	}
	// --- End new ---

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
