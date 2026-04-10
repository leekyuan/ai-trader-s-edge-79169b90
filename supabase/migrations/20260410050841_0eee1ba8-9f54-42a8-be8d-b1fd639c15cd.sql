
-- Create user_api_keys table for exchange API credentials
CREATE TABLE public.user_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  exchange TEXT NOT NULL,
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, exchange)
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api keys" ON public.user_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own api keys" ON public.user_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own api keys" ON public.user_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own api keys" ON public.user_api_keys FOR DELETE USING (auth.uid() = user_id);

-- Create user_telegram_settings table
CREATE TABLE public.user_telegram_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  bot_token TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  notify_strong_signal BOOLEAN NOT NULL DEFAULT true,
  notify_tp_reached BOOLEAN NOT NULL DEFAULT true,
  notify_pattern_complete BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_telegram_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telegram settings" ON public.user_telegram_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own telegram settings" ON public.user_telegram_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own telegram settings" ON public.user_telegram_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own telegram settings" ON public.user_telegram_settings FOR DELETE USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_user_api_keys_updated_at BEFORE UPDATE ON public.user_api_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_telegram_settings_updated_at BEFORE UPDATE ON public.user_telegram_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
