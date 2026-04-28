import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const configResponse = await fetch("/api/config");

if (!configResponse.ok) {
  throw new Error("Supabase-Konfiguration konnte nicht geladen werden.");
}

const config = await configResponse.json();

export const supabaseUrl = config.supabaseUrl;
export const supabaseAnonKey = config.supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
window.supabase = supabase;
