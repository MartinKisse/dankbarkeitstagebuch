import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabaseUrl = "https://jcdddhwbdirdvmxtakii.supabase.co";
export const supabaseAnonKey = "sb_publishable_2QmZaaPoOp-Raxd_HcIOrg_t8galB1Y";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
window.supabase = supabase;
