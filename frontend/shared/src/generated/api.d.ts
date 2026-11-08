export interface paths {
    "/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create an account and send a verification email
         * @description Owner: P1. Access: public.
         */
        post: operations["post_auth_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirm an email address
         * @description Owner: P1. Access: public.
         */
        post: operations["post_auth_verify_email"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/resend-verification": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send a new verification email; responds the same for unknown or verified addresses (rate limited)
         * @description Owner: P1. Access: public.
         */
        post: operations["post_auth_resend_verification"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in (rate limited)
         * @description Owner: P1. Access: public. 401 invalid_credentials; 403 account_suspended or email_not_verified, only after a correct password.
         */
        post: operations["post_auth_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Exchange a refresh token; the old one is revoked
         * @description Owner: P1. Access: public. Presenting an already rotated token is treated as theft: every session of that user is revoked. Clients must not refresh twice in parallel.
         */
        post: operations["post_auth_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Revoke a refresh token
         * @description Owner: P1. Access: any signed-in user.
         */
        post: operations["post_auth_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/forgot-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send a reset email; responds the same for unknown addresses (rate limited)
         * @description Owner: P1. Access: public.
         */
        post: operations["post_auth_forgot_password"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set a new password with a reset token
         * @description Owner: P1. Access: public.
         */
        post: operations["post_auth_reset_password"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Current user
         * @description Owner: P1. Access: any signed-in user.
         */
        get: operations["get_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update the current user
         * @description Owner: P1. Access: any signed-in user.
         */
        patch: operations["patch_me"];
        trace?: never;
    };
    "/organizers/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Own organizer profile
         * @description Owner: P1. Access: organizer.
         */
        get: operations["get_organizers_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update own organizer profile
         * @description Owner: P1. Access: organizer.
         */
        patch: operations["patch_organizers_me"];
        trace?: never;
    };
    "/events/{event_id}/staff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Assign a user to an event's staff
         * @description Owner: P1. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_staff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/staff/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Remove a staff assignment
         * @description Owner: P1. Access: event owner, platform admin, or staff (manager).
         */
        delete: operations["delete_events_event_id_staff_user_id"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search public published events (q, category, city, date_from, date_to)
         * @description Owner: P2. Access: public.
         */
        get: operations["get_events"];
        put?: never;
        /**
         * Create a draft event
         * @description Owner: P2. Access: organizer.
         */
        post: operations["post_events"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizers/me/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Own events, all statuses
         * @description Owner: P2. Access: organizer.
         */
        get: operations["get_organizers_me_events"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/by-token/{share_token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Open an unlisted or private event by its share link
         * @description Owner: P2. Access: public.
         */
        get: operations["get_events_by_token_share_token"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Event details; drafts and private events need event access
         * @description Owner: P2. Access: public.
         */
        get: operations["get_events_event_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Edit an event; price/capacity changes are audited
         * @description Owner: P2. Access: event owner, platform admin, or staff (manager).
         */
        patch: operations["patch_events_event_id"];
        trace?: never;
    };
    "/events/{event_id}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Publish; needs at least one ticket type and capacity >= ticket quantities
         * @description Owner: P2. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_publish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/unpublish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Return to draft
         * @description Owner: P2. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_unpublish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel; triggers bulk refunds and notifications
         * @description Owner: P2. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/duplicate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Copy configuration only, never orders, tickets, payments, check-ins or support
         * @description Owner: P2. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_duplicate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/images": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get a presigned upload URL for an event image
         * @description Owner: P2. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_images"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/venues": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List venues
         * @description Owner: P4. Access: public.
         */
        get: operations["get_venues"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/venues/{venue_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Venue details
         * @description Owner: P4. Access: public.
         */
        get: operations["get_venues_venue_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/venues/{venue_id}/layouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Predefined layouts of a venue
         * @description Owner: P4. Access: public.
         */
        get: operations["get_venues_venue_id_layouts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/seat-map": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seats with status available, held or sold
         * @description Owner: P4. Access: public.
         */
        get: operations["get_events_event_id_seat_map"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/ticket-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * All ticket types with inventory counters
         * @description Owner: P3. Access: event owner, platform admin, or staff.
         */
        get: operations["get_events_event_id_ticket_types"];
        put?: never;
        /**
         * Add a ticket type
         * @description Owner: P3. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_ticket_types"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/ticket-types/{ticket_type_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Edit or hide a ticket type
         * @description Owner: P3. Access: event owner, platform admin, or staff (manager).
         */
        patch: operations["patch_events_event_id_ticket_types_ticket_type_id"];
        trace?: never;
    };
    "/events/{event_id}/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Public availability of visible ticket types
         * @description Owner: P3. Access: public.
         */
        get: operations["get_events_event_id_availability"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/holds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Hold seats; 409 if any seat is taken
         * @description Owner: P4. Access: any signed-in user.
         */
        post: operations["post_events_event_id_holds"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/holds/{hold_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Release own hold
         * @description Owner: P4. Access: any signed-in user.
         */
        delete: operations["delete_events_event_id_holds_hold_id"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create an order; free orders confirm at once. Send an Idempotency-Key header
         * @description Owner: P5. Access: any signed-in user.
         */
        post: operations["post_orders"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{order_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Order details
         * @description Owner: P5. Access: order buyer, or event access.
         */
        get: operations["get_orders_order_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{order_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel a pending order or a free registration
         * @description Owner: P5. Access: order buyer, or event access.
         */
        post: operations["post_orders_order_id_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Own orders
         * @description Owner: P5. Access: any signed-in user.
         */
        get: operations["get_me_orders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Orders of an event
         * @description Owner: P5. Access: event owner, platform admin, or staff (support).
         */
        get: operations["get_events_event_id_orders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/attendees": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Attendee list (q, ticket_type_id, status)
         * @description Owner: P5. Access: event owner, platform admin, or staff (support/checkin).
         */
        get: operations["get_events_event_id_attendees"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/attendees.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Attendee list as CSV
         * @description Owner: P5. Access: event owner, platform admin, or staff (support).
         */
        get: operations["get_events_event_id_attendees_csv"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{order_id}/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start a simulated payment
         * @description Owner: P6. Access: order buyer.
         */
        post: operations["post_orders_order_id_payments"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payments/{payment_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Payment status
         * @description Owner: P6. Access: order buyer, or event access.
         */
        get: operations["get_payments_payment_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payments/{payment_id}/simulate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * SANDBOX: make the simulated provider report success or failure
         * @description Owner: P6. Access: order buyer (ticket payments) or event owner, platform admin, or staff (manager) (activation fees). Runs the same signed-webhook path as a real callback; idempotent once the payment is settled. Disabled when PAYMENT_SIMULATION_ENABLED is false.
         */
        post: operations["post_payments_payment_id_simulate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payments/webhooks/{provider}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Provider callback; idempotent per provider_ref
         * @description Owner: P6. Access: provider signature.
         */
        post: operations["post_payments_webhooks_provider"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/activation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Paid-sales activation checklist
         * @description Owner: P6. Access: event owner, platform admin, or staff (manager).
         */
        get: operations["get_events_event_id_activation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Link a payout account or accept terms
         * @description Owner: P6. Access: event owner, platform admin, or staff (manager).
         */
        patch: operations["patch_events_event_id_activation"];
        trace?: never;
    };
    "/events/{event_id}/activation/verify-identity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run the simulated identity check
         * @description Owner: P6. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_activation_verify_identity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/activation/pay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start the simulated activation-fee payment
         * @description Owner: P6. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_activation_pay"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/financials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Gross sales, fees, refunds and estimated payout
         * @description Owner: P6. Access: event owner, platform admin, or staff (manager).
         */
        get: operations["get_events_event_id_financials"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizers/me/payout-accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Own payout accounts
         * @description Owner: P6. Access: organizer.
         */
        get: operations["get_organizers_me_payout_accounts"];
        put?: never;
        /**
         * Add a simulated payout account
         * @description Owner: P6. Access: organizer.
         */
        post: operations["post_organizers_me_payout_accounts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/organizers/me/payout-accounts/{account_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Remove a payout account
         * @description Owner: P6. Access: organizer.
         */
        delete: operations["delete_organizers_me_payout_accounts_account_id"];
        options?: never;
        head?: never;
        /**
         * Edit a payout account
         * @description Owner: P6. Access: organizer.
         */
        patch: operations["patch_organizers_me_payout_accounts_account_id"];
        trace?: never;
    };
    "/organizers/me/payouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Own payouts and their status
         * @description Owner: P6. Access: organizer.
         */
        get: operations["get_organizers_me_payouts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/refund-policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set the event's refund policy
         * @description Owner: P7. Access: event owner, platform admin, or staff (manager).
         */
        put: operations["put_events_event_id_refund_policy"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{order_id}/refund": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Full refund; tickets become invalid immediately
         * @description Owner: P7. Access: event owner, manager staff, or platform admin.
         */
        post: operations["post_orders_order_id_refund"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/refunds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Refunds of an event
         * @description Owner: P7. Access: event owner, platform admin, or staff (manager).
         */
        get: operations["get_events_event_id_refunds"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tickets/{ticket_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ticket details
         * @description Owner: P8. Access: ticket owner, or event access.
         */
        get: operations["get_tickets_ticket_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tickets/{ticket_id}/qr": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * QR image
         * @description Owner: P8. Access: ticket owner, or event access.
         */
        get: operations["get_tickets_ticket_id_qr"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tickets/{ticket_id}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Printable A4 ticket
         * @description Owner: P8. Access: ticket owner, or event access.
         */
        get: operations["get_tickets_ticket_id_pdf"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/tickets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Own tickets
         * @description Owner: P8. Access: any signed-in user.
         */
        get: operations["get_me_tickets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/checkin/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify a QR payload and check in atomically; rejects Campaign QR codes
         * @description Owner: P15. Access: event owner, platform admin, or staff (checkin).
         */
        post: operations["post_checkin_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/checkin/{ticket_id}/undo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Undo an accidental check-in (audited)
         * @description Owner: P15. Access: event owner, platform admin, or staff (checkin).
         */
        post: operations["post_checkin_ticket_id_undo"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/checkin/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Registered and checked-in totals
         * @description Owner: P15. Access: event owner, platform admin, or staff (checkin).
         */
        get: operations["get_events_event_id_checkin_stats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/campaigns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Campaigns of an event
         * @description Owner: P16. Access: event owner, platform admin, or staff (manager).
         */
        get: operations["get_events_event_id_campaigns"];
        put?: never;
        /**
         * Create a campaign with a generated code and QR
         * @description Owner: P16. Access: event owner, platform admin, or staff (manager).
         */
        post: operations["post_events_event_id_campaigns"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/campaigns/{campaign_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Campaign details
         * @description Owner: P16. Access: event owner, platform admin, or staff (manager).
         */
        get: operations["get_campaigns_campaign_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Edit or disable a campaign; 409 if max_redemptions < redemptions already made
         * @description Owner: P16. Access: event owner, platform admin, or staff (manager).
         */
        patch: operations["patch_campaigns_campaign_id"];
        trace?: never;
    };
    "/campaigns/{campaign_id}/qr": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Campaign QR image
         * @description Owner: P16. Access: event owner, platform admin, or staff (manager).
         */
        get: operations["get_campaigns_campaign_id_qr"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/campaigns/{campaign_id}/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Redemptions, orders, tickets and revenue
         * @description Owner: P16. Access: event owner, platform admin, or staff (manager).
         */
        get: operations["get_campaigns_campaign_id_report"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/promo/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Check a code and compute the discount on the server
         * @description Owner: P16. Access: public.
         */
        post: operations["post_promo_validate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/c/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Campaign QR link: redirects to the event page with the promo applied
         * @description Owner: P16. Access: public.
         */
        get: operations["get_c_token"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Own notifications (unread_only)
         * @description Owner: P9. Access: any signed-in user.
         */
        get: operations["get_me_notifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/notifications/{notification_id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark as read
         * @description Owner: P9. Access: any signed-in user.
         */
        post: operations["post_me_notifications_notification_id_read"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/support/cases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cases visible to the caller (status)
         * @description Owner: P10. Access: by role and relationship to the case.
         */
        get: operations["get_support_cases"];
        put?: never;
        /**
         * Open a case; user/event/order/ticket context is attached
         * @description Owner: P10. Access: any signed-in user.
         */
        post: operations["post_support_cases"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/support/cases/{case_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Case details
         * @description Owner: P10. Access: case participants.
         */
        get: operations["get_support_cases_case_id"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Change status or assignee (audited)
         * @description Owner: P10. Access: support staff of the event, or platform admin.
         */
        patch: operations["patch_support_cases_case_id"];
        trace?: never;
    };
    "/support/cases/{case_id}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Thread; poll with after=<message_id>
         * @description Owner: P10. Access: case participants.
         */
        get: operations["get_support_cases_case_id_messages"];
        put?: never;
        /**
         * Post a reply
         * @description Owner: P10. Access: case participants.
         */
        post: operations["post_support_cases_case_id_messages"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Report an event
         * @description Owner: P11. Access: any signed-in user.
         */
        post: operations["post_events_event_id_reports"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search users (q)
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_users"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{user_id}/suspend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Suspend or reinstate a user
         * @description Owner: P11. Access: platform_admin.
         */
        post: operations["post_admin_users_user_id_suspend"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search events (q, status)
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_events"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/{event_id}/suspend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Suspend or reinstate an event
         * @description Owner: P11. Access: platform_admin.
         */
        post: operations["post_admin_events_event_id_suspend"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/{event_id}/paid-sales/suspend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Suspend or restore paid sales
         * @description Owner: P11. Access: platform_admin.
         */
        post: operations["post_admin_events_event_id_paid_sales_suspend"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search orders (q, status)
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_orders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search payments, including failures (status)
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_payments"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/refunds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Monitor refunds (status)
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_refunds"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/activations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Inspect activation records (status)
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_activations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Reported events (status)
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_reports"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/reports/{report_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Resolve a report
         * @description Owner: P11. Access: platform_admin.
         */
        patch: operations["patch_admin_reports_report_id"];
        trace?: never;
    };
    "/admin/support/cases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Escalated support cases
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_support_cases"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/campaigns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Promo activity
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_campaigns"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Platform settings
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_settings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Change platform settings (audited)
         * @description Owner: P11. Access: platform_admin.
         */
        patch: operations["patch_admin_settings"];
        trace?: never;
    };
    "/admin/exports/{report}.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Operational report as CSV
         * @description Owner: P11. Access: platform_admin.
         */
        get: operations["get_admin_exports_report_csv"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Audit trail (date_from, date_to, action_type)
         * @description Owner: P12. Access: event owner, platform admin, or staff (manager).
         */
        get: operations["get_events_event_id_history"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/analytics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Analytics from DB records (date_from, date_to, ticket_type_id)
         * @description Owner: P13. Access: event owner, platform admin, or staff (manager).
         */
        get: operations["get_events_event_id_analytics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/{event_id}/calendar.ics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * iCalendar file; cancelled events have STATUS:CANCELLED
         * @description Owner: P14. Access: public.
         */
        get: operations["get_events_event_id_calendar_ics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Liveness and database check
         * @description Owner: P0. Access: public.
         */
        get: operations["get_health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** ActivationOut */
        ActivationOut: {
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "incomplete" | "active" | "suspended";
            /** Identity Verified */
            identity_verified: boolean;
            /** Payout Account Id */
            payout_account_id: string | null;
            /** Activation Fee Paid */
            activation_fee_paid: boolean;
            /** Terms Accepted At */
            terms_accepted_at: string | null;
            /** Missing Steps */
            missing_steps: string[];
            /** Is Simulated */
            is_simulated: boolean;
        };
        /** ActivationUpdate */
        ActivationUpdate: {
            /**
             * Payout Account Id
             * @default null
             */
            payout_account_id: string | null;
            /**
             * Accept Terms
             * @default null
             */
            accept_terms: boolean | null;
        };
        /** AnalyticsOut */
        AnalyticsOut: {
            /** Capacity */
            capacity: number;
            /** Sold */
            sold: number;
            /** Remaining */
            remaining: number;
            /** Percent Sold */
            percent_sold: number;
            /** Gross */
            gross: number;
            /** Discounts */
            discounts: number;
            /** Refunds */
            refunds: number;
            /** Net */
            net: number;
            /** Sales Over Time */
            sales_over_time: components["schemas"]["Point"][];
            /** By Ticket Type */
            by_ticket_type: components["schemas"]["Row"][];
            /** Campaigns */
            campaigns: components["schemas"]["CampaignStat"][];
            /** Checked In */
            checked_in: number;
            /** Absent */
            absent: number;
            /** Checkin Percent */
            checkin_percent: number;
        };
        /** AttendeeIn */
        AttendeeIn: {
            /** Full Name */
            full_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /** AttendeeOut */
        AttendeeOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Order Id
             * Format: uuid
             */
            order_id: string;
            /** Full Name */
            full_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Ticket Type */
            ticket_type: string;
            /** Ticket Status */
            ticket_status: string;
        };
        /** AuditEntryOut */
        AuditEntryOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
            /** Actor Id */
            actor_id: string | null;
            /** Actor Role */
            actor_role: string;
            /** Action Type */
            action_type: string;
            /** Entity Type */
            entity_type: string;
            /** Entity Id */
            entity_id: string;
            /** Description */
            description: string;
            /** Meta */
            meta: {
                [key: string]: unknown;
            };
        };
        /**
         * AvailabilityOut
         * @description Public view of a ticket type: no sales counters beyond what is left to buy.
         */
        AvailabilityOut: {
            /**
             * Ticket Type Id
             * Format: uuid
             */
            ticket_type_id: string;
            /** Name */
            name: string;
            /** Price Amount */
            price_amount: number;
            /** Currency */
            currency: string;
            /** Available */
            available: number;
            /** On Sale */
            on_sale: boolean;
        };
        /** CampaignIn */
        CampaignIn: {
            /** Name */
            name: string;
            /**
             * Discount Type
             * @enum {string}
             */
            discount_type: "percent" | "fixed";
            /** Discount Value */
            discount_value: number;
            /**
             * Valid From
             * Format: date-time
             */
            valid_from: string;
            /**
             * Valid To
             * Format: date-time
             */
            valid_to: string;
            /** Max Redemptions */
            max_redemptions: number;
            /** Ticket Type Ids */
            ticket_type_ids?: string[];
        };
        /** CampaignOut */
        CampaignOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /** Name */
            name: string;
            /**
             * Discount Type
             * @enum {string}
             */
            discount_type: "percent" | "fixed";
            /** Discount Value */
            discount_value: number;
            /**
             * Valid From
             * Format: date-time
             */
            valid_from: string;
            /**
             * Valid To
             * Format: date-time
             */
            valid_to: string;
            /** Max Redemptions */
            max_redemptions: number;
            /** Ticket Type Ids */
            ticket_type_ids: string[];
            /** Code */
            code: string;
            /** Redemptions Count */
            redemptions_count: number;
            /** Is Enabled */
            is_enabled: boolean;
            /** Qr Url */
            qr_url: string;
        };
        /** CampaignReportOut */
        CampaignReportOut: {
            /** Redemptions */
            redemptions: number;
            /** Orders */
            orders: number;
            /** Tickets Sold */
            tickets_sold: number;
            /** Gross Revenue */
            gross_revenue: number;
            /** Discount */
            discount: number;
            /** Net Revenue */
            net_revenue: number;
        };
        /** CampaignStat */
        CampaignStat: {
            /**
             * Campaign Id
             * Format: uuid
             */
            campaign_id: string;
            /** Name */
            name: string;
            /** Redemptions */
            redemptions: number;
            /** Revenue */
            revenue: number;
        };
        /**
         * CampaignUpdate
         * @description Partial update: only the fields sent are changed.
         */
        CampaignUpdate: {
            /** Name */
            name?: string | null;
            /** Valid From */
            valid_from?: string | null;
            /** Valid To */
            valid_to?: string | null;
            /** Max Redemptions */
            max_redemptions?: number | null;
            /** Is Enabled */
            is_enabled?: boolean | null;
        };
        /** CaseCreate */
        CaseCreate: {
            /** Category */
            category: string;
            /** Subject */
            subject: string;
            /**
             * Event Id
             * @default null
             */
            event_id: string | null;
            /**
             * Order Id
             * @default null
             */
            order_id: string | null;
            /**
             * Ticket Id
             * @default null
             */
            ticket_id: string | null;
            /** Message */
            message: string;
        };
        /** CaseOut */
        CaseOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Requester Id
             * Format: uuid
             */
            requester_id: string;
            /** Audience */
            audience: string;
            /** Category */
            category: string;
            /** Status */
            status: string;
            /** Assignee Id */
            assignee_id: string | null;
            /** Event Id */
            event_id: string | null;
            /** Order Id */
            order_id: string | null;
            /** Ticket Id */
            ticket_id: string | null;
            /** Subject */
            subject: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** CaseUpdate */
        CaseUpdate: {
            /**
             * Status
             * @default null
             */
            status: ("open" | "in_progress" | "waiting_customer" | "resolved") | null;
            /**
             * Assignee Id
             * @default null
             */
            assignee_id: string | null;
        };
        /** CheckInStatsOut */
        CheckInStatsOut: {
            /** Registered */
            registered: number;
            /** Checked In */
            checked_in: number;
        };
        /**
         * ErrorOut
         * @description Body of every non-2xx response.
         */
        ErrorOut: {
            /** Code */
            code: string;
            /** Message */
            message: string;
            /**
             * Details
             * @default null
             */
            details: unknown;
        };
        /** EventCreate */
        EventCreate: {
            /** Title */
            title: string;
            /** Description */
            description: string;
            /** Category */
            category: string;
            /**
             * Venue Id
             * Format: uuid
             */
            venue_id: string;
            /**
             * Layout Id
             * @default null
             */
            layout_id: string | null;
            /**
             * Starts At
             * Format: date-time
             */
            starts_at: string;
            /**
             * Ends At
             * Format: date-time
             */
            ends_at: string;
            /** Timezone */
            timezone: string;
            /**
             * Visibility
             * @default public
             * @enum {string}
             */
            visibility: "public" | "unlisted" | "private";
            /**
             * Seating Mode
             * @default general_admission
             * @enum {string}
             */
            seating_mode: "general_admission" | "assigned";
            /** Capacity */
            capacity: number;
            /**
             * Registration Opens At
             * @default null
             */
            registration_opens_at: string | null;
            /**
             * Registration Closes At
             * @default null
             */
            registration_closes_at: string | null;
        };
        /** EventOut */
        EventOut: {
            /** Title */
            title: string;
            /** Description */
            description: string;
            /** Category */
            category: string;
            /**
             * Venue Id
             * Format: uuid
             */
            venue_id: string;
            /**
             * Layout Id
             * @default null
             */
            layout_id: string | null;
            /**
             * Starts At
             * Format: date-time
             */
            starts_at: string;
            /**
             * Ends At
             * Format: date-time
             */
            ends_at: string;
            /** Timezone */
            timezone: string;
            /**
             * Visibility
             * @default public
             * @enum {string}
             */
            visibility: "public" | "unlisted" | "private";
            /**
             * Seating Mode
             * @default general_admission
             * @enum {string}
             */
            seating_mode: "general_admission" | "assigned";
            /** Capacity */
            capacity: number;
            /**
             * Registration Opens At
             * @default null
             */
            registration_opens_at: string | null;
            /**
             * Registration Closes At
             * @default null
             */
            registration_closes_at: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Status */
            status: string;
            /** Paid Sales Status */
            paid_sales_status: string;
            /** Share Token */
            share_token: string;
            /** Images */
            images: string[];
        };
        /** EventReportIn */
        EventReportIn: {
            /** Reason */
            reason: string;
        };
        /** EventReportOut */
        EventReportOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /**
             * Reporter Id
             * Format: uuid
             */
            reporter_id: string;
            /** Reason */
            reason: string;
            /** Status */
            status: string;
        };
        /** EventReportUpdate */
        EventReportUpdate: {
            /**
             * Status
             * @enum {string}
             */
            status: "reviewed" | "dismissed" | "actioned";
        };
        /**
         * EventUpdate
         * @description Partial update: only the fields sent are changed.
         */
        EventUpdate: {
            /**
             * Title
             * @default null
             */
            title: string | null;
            /**
             * Description
             * @default null
             */
            description: string | null;
            /**
             * Category
             * @default null
             */
            category: string | null;
            /**
             * Venue Id
             * @default null
             */
            venue_id: string | null;
            /**
             * Layout Id
             * @default null
             */
            layout_id: string | null;
            /**
             * Starts At
             * @default null
             */
            starts_at: string | null;
            /**
             * Ends At
             * @default null
             */
            ends_at: string | null;
            /**
             * Timezone
             * @default null
             */
            timezone: string | null;
            /**
             * Visibility
             * @default null
             */
            visibility: ("public" | "unlisted" | "private") | null;
            /**
             * Seating Mode
             * @default null
             */
            seating_mode: ("general_admission" | "assigned") | null;
            /**
             * Capacity
             * @default null
             */
            capacity: number | null;
            /**
             * Registration Opens At
             * @default null
             */
            registration_opens_at: string | null;
            /**
             * Registration Closes At
             * @default null
             */
            registration_closes_at: string | null;
        };
        /** FinancialSummaryOut */
        FinancialSummaryOut: {
            /** Gross */
            gross: number;
            /** Fees */
            fees: number;
            /** Refunds */
            refunds: number;
            /** Estimated Payout */
            estimated_payout: number;
            /** Currency */
            currency: string;
            /** Is Simulated */
            is_simulated: boolean;
        };
        /** ForgotPasswordIn */
        ForgotPasswordIn: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        HealthOut: {
            status: string;
            database: string;
            version: string;
        };
        /** HoldIn */
        HoldIn: {
            /** Seat Ids */
            seat_ids: string[];
        };
        /** HoldOut */
        HoldOut: {
            /** Hold Ids */
            hold_ids: string[];
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
        };
        /** ImageUploadIn */
        ImageUploadIn: {
            /** Filename */
            filename: string;
            /** Content Type */
            content_type: string;
        };
        /** ImageUploadOut */
        ImageUploadOut: {
            /** Upload Url */
            upload_url: string;
            /** Image Url */
            image_url: string;
        };
        /** LayoutOut */
        LayoutOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Venue Id
             * Format: uuid
             */
            venue_id: string;
            /** Name */
            name: string;
        };
        /** LoginIn */
        LoginIn: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
        };
        /** MessageIn */
        MessageIn: {
            /** Body */
            body: string;
        };
        /** MessageOut */
        MessageOut: {
            /** Message */
            message: string;
        };
        /** NotificationOut */
        NotificationOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Type */
            type: string;
            /** Title */
            title: string;
            /** Body */
            body: string;
            /** Payload */
            payload: {
                [key: string]: unknown;
            };
            /** Read At */
            read_at: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** OrderCreate */
        OrderCreate: {
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /** Items */
            items: components["schemas"]["OrderItemIn"][];
            /** Attendees */
            attendees: components["schemas"]["AttendeeIn"][];
            /**
             * Hold Ids
             * @default []
             */
            hold_ids: string[];
            /**
             * Promo Code
             * @default null
             */
            promo_code: string | null;
        };
        /** OrderItemIn */
        OrderItemIn: {
            /**
             * Ticket Type Id
             * Format: uuid
             */
            ticket_type_id: string;
            /** Quantity */
            quantity: number;
            /**
             * Seat Ids
             * @default []
             */
            seat_ids: string[];
        };
        /** OrderItemOut */
        OrderItemOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Ticket Type Id
             * Format: uuid
             */
            ticket_type_id: string;
            seat: components["schemas"]["SeatRef"] | null;
            /** Unit Price */
            unit_price: number;
            /** Quantity */
            quantity: number;
            /** Line Total */
            line_total: number;
        };
        /** OrderOut */
        OrderOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Order Number */
            order_number: string;
            /** Status */
            status: string;
            /** Subtotal */
            subtotal: number;
            /** Discount Amount */
            discount_amount: number;
            /** Processing Fee */
            processing_fee: number;
            /** Total */
            total: number;
            /** Currency */
            currency: string;
            /** Is Simulated */
            is_simulated: boolean;
            /** Items */
            items: components["schemas"]["OrderItemOut"][];
            /** Tickets */
            tickets: components["schemas"]["TicketOut"][];
        };
        /** OrganizerProfileOut */
        OrganizerProfileOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Organization Name */
            organization_name: string;
            /**
             * Contact Email
             * Format: email
             */
            contact_email: string;
            /** Contact Phone */
            contact_phone: string;
            /** Verification Status */
            verification_status: string;
            /** Terms Accepted At */
            terms_accepted_at: string | null;
        };
        /**
         * OrganizerProfileUpdate
         * @description Omitted fields are left unchanged.
         */
        OrganizerProfileUpdate: {
            /** Organization Name */
            organization_name?: string;
            /**
             * Contact Email
             * Format: email
             */
            contact_email?: string;
            /** Contact Phone */
            contact_phone?: string;
        };
        PageActivationOut: {
            items: components["schemas"]["ActivationOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageAttendeeOut: {
            items: components["schemas"]["AttendeeOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageAuditEntryOut: {
            items: components["schemas"]["AuditEntryOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageCampaignOut: {
            items: components["schemas"]["CampaignOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageCaseOut: {
            items: components["schemas"]["CaseOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageEventOut: {
            items: components["schemas"]["EventOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageEventReportOut: {
            items: components["schemas"]["EventReportOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageLayoutOut: {
            items: components["schemas"]["LayoutOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageNotificationOut: {
            items: components["schemas"]["NotificationOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageOrderOut: {
            items: components["schemas"]["OrderOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PagePaymentOut: {
            items: components["schemas"]["PaymentOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PagePayoutOut: {
            items: components["schemas"]["PayoutOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageRefundOut: {
            items: components["schemas"]["RefundOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageTicketOut: {
            items: components["schemas"]["TicketOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageTicketTypeOut: {
            items: components["schemas"]["TicketTypeOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageUserOut: {
            items: components["schemas"]["UserOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        PageVenueOut: {
            items: components["schemas"]["VenueOut"][];
            total: number;
            limit: number;
            offset: number;
        };
        /** PaymentOut */
        PaymentOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "ticket" | "activation_fee";
            /** Status */
            status: string;
            /** Amount */
            amount: number;
            /** Fee Amount */
            fee_amount: number;
            /** Currency */
            currency: string;
            /** Is Simulated */
            is_simulated: boolean;
            /** Checkout Url */
            checkout_url: string | null;
            /** Failure Reason */
            failure_reason: string | null;
        };
        /** PayoutAccountIn */
        PayoutAccountIn: {
            /** Bank Name */
            bank_name: string;
            /**
             * Iban
             * @description IBAN with a valid ISO 13616 checksum. Stored encrypted; only the last four characters are ever returned.
             */
            iban: string;
            /** Holder Name */
            holder_name: string;
        };
        /**
         * SimulatePaymentIn
         * @description SANDBOX control. Decides what the simulated provider reports; no card data.
         */
        SimulatePaymentIn: {
            /**
             * Outcome
             * @enum {string}
             */
            outcome: "succeeded" | "failed";
            /** Failure Reason */
            failure_reason?: string | null;
        };
        /** PayoutAccountOut */
        PayoutAccountOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Bank Name */
            bank_name: string;
            /** Iban Last4 */
            iban_last4: string;
            /** Holder Name */
            holder_name: string;
            /** Is Verified */
            is_verified: boolean;
            /** Is Simulated */
            is_simulated: boolean;
        };
        /** PayoutOut */
        PayoutOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /** Gross */
            gross: number;
            /** Fees */
            fees: number;
            /** Refunds */
            refunds: number;
            /** Net */
            net: number;
            /** Currency */
            currency: string;
            /** Status */
            status: string;
            /** Scheduled For */
            scheduled_for: string | null;
            /** Paid At */
            paid_at: string | null;
        };
        /** Point */
        Point: {
            /**
             * Date
             * Format: date
             */
            date: string;
            /** Tickets */
            tickets: number;
            /** Revenue */
            revenue: number;
        };
        /** PromoValidateIn */
        PromoValidateIn: {
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /** Code */
            code: string;
            /** Ticket Type Ids */
            ticket_type_ids: string[];
        };
        /** PromoValidateOut */
        PromoValidateOut: {
            /** Valid */
            valid: boolean;
            /** Discount Amount */
            discount_amount: number;
            /** Reason */
            reason: string | null;
        };
        /** RefreshIn */
        RefreshIn: {
            /** Refresh Token */
            refresh_token: string;
        };
        /** RefundIn */
        RefundIn: {
            /** Reason */
            reason: string;
        };
        /** RefundOut */
        RefundOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Order Id
             * Format: uuid
             */
            order_id: string;
            /** Amount */
            amount: number;
            /** Currency */
            currency: string;
            /** Reason */
            reason: string;
            /** Status */
            status: string;
            /** Completed At */
            completed_at: string | null;
        };
        /** RefundPolicyIn */
        RefundPolicyIn: {
            /** Summary */
            summary: string;
            /**
             * Refundable Until
             * @default null
             */
            refundable_until: string | null;
        };
        /** RegisterIn */
        RegisterIn: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
            /** Full Name */
            full_name: string;
            /**
             * Role
             * @enum {string}
             */
            role: "attendee" | "organizer";
        };
        /** ResendVerificationIn */
        ResendVerificationIn: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /** ResetPasswordIn */
        ResetPasswordIn: {
            /** Token */
            token: string;
            /** New Password */
            new_password: string;
        };
        /** Row */
        Row: {
            /**
             * Ticket Type Id
             * Format: uuid
             */
            ticket_type_id: string;
            /** Name */
            name: string;
            /** Sold */
            sold: number;
            /** Revenue */
            revenue: number;
        };
        /** SeatMapOut */
        SeatMapOut: {
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /**
             * Layout Id
             * Format: uuid
             */
            layout_id: string;
            /** Seats */
            seats: components["schemas"]["SeatStatusOut"][];
        };
        /** SeatRef */
        SeatRef: {
            /**
             * Seat Id
             * Format: uuid
             */
            seat_id: string;
            /** Section Name */
            section_name: string;
            /** Row Label */
            row_label: string;
            /** Seat Number */
            seat_number: number;
        };
        /** SeatStatusOut */
        SeatStatusOut: {
            /**
             * Seat Id
             * Format: uuid
             */
            seat_id: string;
            /** Section Name */
            section_name: string;
            /** Row Label */
            row_label: string;
            /** Number */
            number: number;
            /** Price Category */
            price_category: string;
            /** Is Accessible */
            is_accessible: boolean;
            /**
             * Status
             * @enum {string}
             */
            status: "available" | "held" | "sold";
        };
        /** SettingsOut */
        SettingsOut: {
            /** Settings */
            settings: {
                [key: string]: unknown;
            };
        };
        /** SettingsUpdate */
        SettingsUpdate: {
            /** Settings */
            settings: {
                [key: string]: unknown;
            };
        };
        /** StaffAssignIn */
        StaffAssignIn: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /**
             * Role
             * @enum {string}
             */
            role: "manager" | "checkin" | "support";
        };
        /** StaffAssignmentOut */
        StaffAssignmentOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /** Role */
            role: string;
        };
        /** SupportMessageOut */
        SupportMessageOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Case Id
             * Format: uuid
             */
            case_id: string;
            /**
             * Author Id
             * Format: uuid
             */
            author_id: string;
            /** Body */
            body: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** SuspendIn */
        SuspendIn: {
            /** Suspended */
            suspended: boolean;
            /** Reason */
            reason: string;
        };
        /** TicketOut */
        TicketOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Ticket Number */
            ticket_number: string;
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /** Ticket Type */
            ticket_type: string;
            /** Attendee Name */
            attendee_name: string;
            seat: components["schemas"]["SeatRef"] | null;
            /** Status */
            status: string;
            /** Qr Url */
            qr_url: string;
            /** Pdf Url */
            pdf_url: string;
        };
        /** TicketTypeIn */
        TicketTypeIn: {
            /** Name */
            name: string;
            /**
             * Description
             * @default null
             */
            description: string | null;
            /**
             * Price Amount
             * @default 0
             */
            price_amount: number;
            /** Quantity Total */
            quantity_total: number;
            /**
             * Sales Start
             * @default null
             */
            sales_start: string | null;
            /**
             * Sales End
             * @default null
             */
            sales_end: string | null;
            /**
             * Max Per Order
             * @default 10
             */
            max_per_order: number;
            /**
             * Is Hidden
             * @default false
             */
            is_hidden: boolean;
            /**
             * Price Category
             * @default null
             */
            price_category: string | null;
        };
        /** TicketTypeOut */
        TicketTypeOut: {
            /** Name */
            name: string;
            /**
             * Description
             * @default null
             */
            description: string | null;
            /**
             * Price Amount
             * @default 0
             */
            price_amount: number;
            /** Quantity Total */
            quantity_total: number;
            /**
             * Sales Start
             * @default null
             */
            sales_start: string | null;
            /**
             * Sales End
             * @default null
             */
            sales_end: string | null;
            /**
             * Max Per Order
             * @default 10
             */
            max_per_order: number;
            /**
             * Is Hidden
             * @default false
             */
            is_hidden: boolean;
            /**
             * Price Category
             * @default null
             */
            price_category: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Available */
            available: number;
            /** Reserved */
            reserved: number;
            /** Sold */
            sold: number;
            /** Refunded */
            refunded: number;
            /** Checked In */
            checked_in: number;
        };
        /**
         * TicketTypeUpdate
         * @description Partial update: only the fields sent are changed.
         */
        TicketTypeUpdate: {
            /**
             * Name
             * @default null
             */
            name: string | null;
            /**
             * Description
             * @default null
             */
            description: string | null;
            /**
             * Price Amount
             * @default null
             */
            price_amount: number | null;
            /**
             * Quantity Total
             * @default null
             */
            quantity_total: number | null;
            /**
             * Sales Start
             * @default null
             */
            sales_start: string | null;
            /**
             * Sales End
             * @default null
             */
            sales_end: string | null;
            /**
             * Max Per Order
             * @default null
             */
            max_per_order: number | null;
            /**
             * Is Hidden
             * @default null
             */
            is_hidden: boolean | null;
            /**
             * Price Category
             * @default null
             */
            price_category: string | null;
        };
        /** TokenOut */
        TokenOut: {
            /** Access Token */
            access_token: string;
            /** Refresh Token */
            refresh_token: string;
            /**
             * Token Type
             * @default bearer
             */
            token_type: string;
        };
        /** UndoCheckInIn */
        UndoCheckInIn: {
            /** Reason */
            reason: string;
        };
        /** UserOut */
        UserOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Full Name */
            full_name: string;
            /** Phone */
            phone: string | null;
            /** Role */
            role: string;
            /** Email Verified At */
            email_verified_at: string | null;
        };
        /**
         * UserUpdate
         * @description Omitted fields are left unchanged. Only phone can be cleared with null.
         */
        UserUpdate: {
            /** Full Name */
            full_name?: string;
            /** Phone */
            phone?: string | null;
        };
        /** VenueOut */
        VenueOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Address */
            address: string;
            /** City */
            city: string;
            /** Lat */
            lat: number | string | null;
            /** Lng */
            lng: number | string | null;
        };
        /** VerifyEmailIn */
        VerifyEmailIn: {
            /** Token */
            token: string;
        };
        /** VerifyIn */
        VerifyIn: {
            /**
             * Event Id
             * Format: uuid
             */
            event_id: string;
            /** Qr Payload */
            qr_payload: string;
        };
        /** VerifyOut */
        VerifyOut: {
            /**
             * Result
             * @enum {string}
             */
            result: "accepted" | "already_used" | "invalid" | "refunded" | "wrong_event" | "not_a_ticket";
            ticket: components["schemas"]["TicketOut"] | null;
            /** Message */
            message: string;
        };
    };
    responses: {
        /** @description Error */
        Error: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorOut"];
            };
        };
    };
    parameters: {
        Limit: number;
        Offset: number;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    post_auth_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_auth_verify_email: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyEmailIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageOut"];
                };
            };
            422: components["responses"]["Error"];
        };
    };
    post_auth_resend_verification: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResendVerificationIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageOut"];
                };
            };
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_auth_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokenOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_auth_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokenOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_auth_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshIn"];
            };
        };
        responses: {
            /** @description Done */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_auth_forgot_password: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ForgotPasswordIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageOut"];
                };
            };
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    post_auth_reset_password: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetPasswordIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageOut"];
                };
            };
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    get_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    patch_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserUpdate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_organizers_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrganizerProfileOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    patch_organizers_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrganizerProfileUpdate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrganizerProfileOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_staff: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StaffAssignIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffAssignmentOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    delete_events_event_id_staff_user_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
                q?: string;
                category?: string;
                city?: string;
                date_from?: string;
                date_to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageEventOut"];
                };
            };
            422: components["responses"]["Error"];
        };
    };
    post_events: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EventCreate"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_organizers_me_events: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageEventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_by_token_share_token: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                share_token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    patch_events_event_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EventUpdate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_publish: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_unpublish: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_duplicate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_images: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ImageUploadIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImageUploadOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_venues: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageVenueOut"];
                };
            };
            422: components["responses"]["Error"];
        };
    };
    get_venues_venue_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                venue_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VenueOut"];
                };
            };
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_venues_venue_id_layouts: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path: {
                venue_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageLayoutOut"];
                };
            };
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_seat_map: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatMapOut"];
                };
            };
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_ticket_types: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageTicketTypeOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_ticket_types: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TicketTypeIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TicketTypeOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    patch_events_event_id_ticket_types_ticket_type_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
                ticket_type_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TicketTypeUpdate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TicketTypeOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_availability: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AvailabilityOut"][];
                };
            };
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_holds: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HoldIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HoldOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    delete_events_event_id_holds_hold_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
                hold_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_orders: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderCreate"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_orders_order_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_orders_order_id_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_me_orders: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOrderOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_orders: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOrderOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_attendees: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
                q?: string;
                ticket_type_id?: string;
                status?: string;
            };
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageAttendeeOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_attendees_csv: {
        parameters: {
            query?: {
                q?: string;
                ticket_type_id?: string;
                status?: string;
            };
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/csv": string;
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_orders_order_id_payments: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_payments_payment_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                payment_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_payments_payment_id_simulate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                payment_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SimulatePaymentIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_payments_webhooks_provider: {
        parameters: {
            query?: never;
            header?: {
                /** @description HMAC-SHA256 of the raw body (sandbox provider). */
                "X-Sandbox-Signature"?: string;
            };
            path: {
                provider: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_activation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivationOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    patch_events_event_id_activation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivationUpdate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivationOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_activation_verify_identity: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivationOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_activation_pay: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_financials: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinancialSummaryOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_organizers_me_payout_accounts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayoutAccountOut"][];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    post_organizers_me_payout_accounts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PayoutAccountIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayoutAccountOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    delete_organizers_me_payout_accounts_account_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                account_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    patch_organizers_me_payout_accounts_account_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                account_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PayoutAccountIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayoutAccountOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_organizers_me_payouts: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PagePayoutOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    put_events_event_id_refund_policy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefundPolicyIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_orders_order_id_refund: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefundIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RefundOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_refunds: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageRefundOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_tickets_ticket_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ticket_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TicketOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_tickets_ticket_id_qr: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ticket_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "image/png": string;
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_tickets_ticket_id_pdf: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ticket_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/pdf": string;
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_me_tickets: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageTicketOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_checkin_verify: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerifyOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_checkin_ticket_id_undo: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                ticket_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UndoCheckInIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TicketOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_checkin_stats: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CheckInStatsOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_campaigns: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageCampaignOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_campaigns: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CampaignIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CampaignOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_campaigns_campaign_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaign_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CampaignOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    patch_campaigns_campaign_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaign_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CampaignUpdate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CampaignOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_campaigns_campaign_id_qr: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaign_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "image/png": string;
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_campaigns_campaign_id_report: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaign_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CampaignReportOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_promo_validate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PromoValidateIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PromoValidateOut"];
                };
            };
            422: components["responses"]["Error"];
        };
    };
    get_c_token: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect to the event page */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_me_notifications: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageNotificationOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_me_notifications_notification_id_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                notification_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_support_cases: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageCaseOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_support_cases: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CaseCreate"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CaseOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_support_cases_case_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                case_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CaseOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    patch_support_cases_case_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                case_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CaseUpdate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CaseOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_support_cases_case_id_messages: {
        parameters: {
            query?: {
                after?: string;
            };
            header?: never;
            path: {
                case_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SupportMessageOut"][];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_support_cases_case_id_messages: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                case_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MessageIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SupportMessageOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_events_event_id_reports: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EventReportIn"];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventReportOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_users: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageUserOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_admin_users_user_id_suspend: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SuspendIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_events: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageEventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_admin_events_event_id_suspend: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SuspendIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    post_admin_events_event_id_paid_sales_suspend: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SuspendIn"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivationOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_orders: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOrderOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_payments: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PagePaymentOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_refunds: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageRefundOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_activations: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageActivationOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_reports: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageEventReportOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    patch_admin_reports_report_id: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                report_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EventReportUpdate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventReportOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_support_cases: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageCaseOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_campaigns: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageCampaignOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_settings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettingsOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
        };
    };
    patch_admin_settings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SettingsUpdate"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettingsOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_admin_exports_report_csv: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                report: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/csv": string;
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_history: {
        parameters: {
            query?: {
                limit?: components["parameters"]["Limit"];
                offset?: components["parameters"]["Offset"];
            };
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Page of results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageAuditEntryOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_analytics: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsOut"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_events_event_id_calendar_ics: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/calendar": string;
                };
            };
            404: components["responses"]["Error"];
            422: components["responses"]["Error"];
        };
    };
    get_health: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthOut"];
                };
            };
        };
    };
}
