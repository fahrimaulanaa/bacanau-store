import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slsjhreflabvfdcaghqs.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsc2pocmVmbGFidmZkY2FnaHFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MDQ1MDEsImV4cCI6MjA5NTE4MDUwMX0.flb-RYrJ5TXSAB02Qoi0dt9mZEWJDRJ5KDdzkFMRg4Y';

export function supabaseAdmin() {
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
