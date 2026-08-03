import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
export const META_TOKEN   = import.meta.env.VITE_META_TOKEN;
export const META_ACCOUNT = import.meta.env.VITE_META_ACCOUNT;
export const CLAUDE_KEY   = import.meta.env.VITE_CLAUDE_KEY;
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const BOT_SB_URL = import.meta.env.VITE_BOT_SUPABASE_URL;
export const BOT_SB_KEY = import.meta.env.VITE_BOT_SUPABASE_KEY;
export const BOT_API_URL = "https://whatsapp-lead-bot-three.vercel.app";
export const botSB = BOT_SB_URL && BOT_SB_KEY
  ? createClient(BOT_SB_URL, BOT_SB_KEY, { auth: { persistSession: false } })
  : null;
