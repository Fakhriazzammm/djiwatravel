import { relations } from "drizzle-orm/relations";
import { esimProvisioningOrders, esimProfiles, customerOrders, customerOrderItems, esimProviderPackages, paymentWebhookEvents, esimReconciliationRuns, guestOrderAccess } from "./schema";

export const esimProfilesRelations = relations(esimProfiles, ({one}) => ({
	esimProvisioningOrder: one(esimProvisioningOrders, {
		fields: [esimProfiles.provisioningOrderId],
		references: [esimProvisioningOrders.id]
	}),
}));

export const esimProvisioningOrdersRelations = relations(esimProvisioningOrders, ({one, many}) => ({
	esimProfiles: many(esimProfiles),
	customerOrder: one(customerOrders, {
		fields: [esimProvisioningOrders.orderId],
		references: [customerOrders.id]
	}),
}));

export const customerOrderItemsRelations = relations(customerOrderItems, ({one}) => ({
	customerOrder: one(customerOrders, {
		fields: [customerOrderItems.orderId],
		references: [customerOrders.id]
	}),
	esimProviderPackage: one(esimProviderPackages, {
		fields: [customerOrderItems.providerPackageId],
		references: [esimProviderPackages.id]
	}),
}));

export const customerOrdersRelations = relations(customerOrders, ({many}) => ({
	customerOrderItems: many(customerOrderItems),
	esimProvisioningOrders: many(esimProvisioningOrders),
	paymentWebhookEvents: many(paymentWebhookEvents),
	esimReconciliationRuns: many(esimReconciliationRuns),
	guestOrderAccesses: many(guestOrderAccess),
}));

export const esimProviderPackagesRelations = relations(esimProviderPackages, ({many}) => ({
	customerOrderItems: many(customerOrderItems),
}));

export const paymentWebhookEventsRelations = relations(paymentWebhookEvents, ({one}) => ({
	customerOrder: one(customerOrders, {
		fields: [paymentWebhookEvents.orderId],
		references: [customerOrders.id]
	}),
}));

export const esimReconciliationRunsRelations = relations(esimReconciliationRuns, ({one}) => ({
	customerOrder: one(customerOrders, {
		fields: [esimReconciliationRuns.orderId],
		references: [customerOrders.id]
	}),
}));

export const guestOrderAccessRelations = relations(guestOrderAccess, ({one}) => ({
	customerOrder: one(customerOrders, {
		fields: [guestOrderAccess.orderId],
		references: [customerOrders.id]
	}),
}));