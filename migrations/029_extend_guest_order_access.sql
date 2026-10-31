-- Guest access tokens used to expire after one hour, locking guests out of paid eSIMs.
-- Align existing rows with the new 30-day window (never shorten an existing expiry).
UPDATE public.guest_order_access
   SET expires_at = GREATEST(expires_at, created_at + interval '30 days')
 WHERE created_at > now() - interval '30 days'
   AND expires_at < created_at + interval '30 days';
