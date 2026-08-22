-- Webhook ordering guard.
--
-- Stripe delivers events at least once and in no guaranteed order: a retry of
-- "subscription.updated" can land after "subscription.deleted" and, without a
-- guard, would resurrect a plan the customer already cancelled.
--
-- One column answers it. Every write records the `created` time of the event it
-- came from, and an event older than the last one applied is skipped. Duplicate
-- delivery of the SAME event is safe without any guard (the write is derived
-- entirely from the event, so applying it twice produces the same row), which
-- is why equal timestamps are still applied.
ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "lastStripeEventAt" TIMESTAMP(3);
