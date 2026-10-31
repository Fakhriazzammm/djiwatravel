/**
 * How long a guest purchase keeps its browser access token.
 *
 * It used to be one hour, which silently locked every customer who bought without signing in out
 * of their own (paid) eSIM, QR and status as soon as the hour passed: the server stopped answering
 * for the token, so each browser kept showing a frozen, wrong copy of the order. The token is a
 * random bearer secret that only the purchasing browser holds, so it now lives as long as an eSIM
 * can stay valid. Claiming the order into an account still moves it to the account.
 */
export const GUEST_ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
