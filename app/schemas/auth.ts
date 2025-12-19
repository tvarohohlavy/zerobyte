import { type } from "arktype";

export const USER_ROLES = {
	admin: "admin",
	operator: "operator",
	viewer: "viewer",
} as const;

export type UserRole = keyof typeof USER_ROLES;

// Useful for embedding into other ArkType object schemas.
export const USER_ROLE_UNION = "'admin' | 'operator' | 'viewer'" as const;

export const userRoleSchema = type(USER_ROLE_UNION);
