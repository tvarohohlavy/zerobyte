import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from "@dnd-kit/sortable";
import { CalendarClock, Database, HardDrive, Plus } from "lucide-react";
import { Link } from "react-router";
import { useState, useEffect } from "react";
import { SortableBackupCard } from "../components/sortable-backup-card";
import { BackupStatusDot } from "../components/backup-status-dot";
import { EmptyState } from "~/client/components/empty-state";
import { Button } from "~/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/client/components/ui/card";
import type { Route } from "./+types/backups";
import { listBackupSchedules } from "~/client/api-client";
import { listBackupSchedulesOptions, listBackupSchedulesQueryKey } from "~/client/api-client/@tanstack/react-query.gen";

// Temporary helper until API client is regenerated
async function reorderBackupSchedules(scheduleIds: number[]) {
	const response = await fetch("/api/v1/backups/reorder", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ scheduleIds }),
	});
	if (!response.ok) {
		throw new Error("Failed to reorder backup schedules");
	}
	return response.json();
}

export const handle = {
	breadcrumb: () => [{ label: "Backups" }],
};

export function meta(_: Route.MetaArgs) {
	return [
		{ title: "Zerobyte - Backup Jobs" },
		{
			name: "description",
			content: "Automate volume backups with scheduled jobs and retention policies.",
		},
	];
}

export const clientLoader = async () => {
	const jobs = await listBackupSchedules();
	if (jobs.data) return jobs.data;
	return [];
};

export default function Backups({ loaderData }: Route.ComponentProps) {
	const queryClient = useQueryClient();
	const { data: schedules, isLoading } = useQuery({
		...listBackupSchedulesOptions(),
		initialData: loaderData,
	});

	const [items, setItems] = useState(schedules?.map((s) => s.id) ?? []);

	// Keep items in sync with schedules
	useEffect(() => {
		if (schedules) {
			setItems(schedules.map((s) => s.id));
		}
	}, [schedules]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const reorderMutation = useMutation({
		mutationFn: async (scheduleIds: number[]) => {
			await reorderBackupSchedules(scheduleIds);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: listBackupSchedulesQueryKey() });
		},
		onError: () => {
			// Revert the order or display error to user
			queryClient.invalidateQueries({ queryKey: listBackupSchedulesQueryKey() });
		},
	});

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			setItems((items) => {
				const oldIndex = items.indexOf(active.id as number);
				const newIndex = items.indexOf(over.id as number);
				const newItems = arrayMove(items, oldIndex, newIndex);

				// Save the new order
				reorderMutation.mutate(newItems);

				return newItems;
			});
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<p className="text-muted-foreground">Loading backup schedules...</p>
			</div>
		);
	}

	if (!schedules || schedules.length === 0) {
		return (
			<EmptyState
				icon={CalendarClock}
				title="No backup job"
				description="Backup jobs help you automate the process of backing up your volumes on a regular schedule to ensure your data is safe and secure."
				button={
					<Button>
						<Link to="/backups/create" className="flex items-center">
							<Plus className="h-4 w-4 mr-2" />
							Create a backup job
						</Link>
					</Button>
				}
			/>
		);
	}

	// Create a map for quick lookup
	const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

	return (
		<div className="container mx-auto space-y-6">
			<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
				<SortableContext items={items} strategy={rectSortingStrategy}>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
						{items.map((id) => {
							const schedule = scheduleMap.get(id);
							if (!schedule) return null;
							return <SortableBackupCard key={schedule.id} schedule={schedule} />;
						})}
						<Link to="/backups/create">
							<Card className="flex flex-col items-center justify-center h-full hover:bg-muted/50 transition-colors cursor-pointer">
								<CardContent className="flex flex-col items-center justify-center gap-2">
									<Plus className="h-8 w-8 text-muted-foreground" />
									<span className="text-sm font-medium text-muted-foreground">Create a backup job</span>
								</CardContent>
							</Card>
						</Link>
					</div>
				</SortableContext>
			</DndContext>
		</div>
	);
}
