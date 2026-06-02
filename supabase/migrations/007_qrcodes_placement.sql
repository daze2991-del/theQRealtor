-- Add optional placement label to qr codes (yard sign, open house, etc.)
ALTER TABLE public.qrcodes ADD COLUMN IF NOT EXISTS placement text;
