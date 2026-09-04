-- Native (APNs/FCM) device tokens live alongside Web Push subscriptions.
-- Additive and nullable so the existing web flow keeps working unchanged.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS device_token text;

CREATE INDEX IF NOT EXISTS push_subscriptions_platform_idx
  ON public.push_subscriptions (user_id, platform);