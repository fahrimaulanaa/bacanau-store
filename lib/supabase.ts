import { createClient } from '@supabase/supabase-js';

// Ganti dengan URL dan Anon Key yang ada di Project Settings > API di Supabase Console kamu
const supabaseUrl = 'https://slsjhreflabvfdcaghqs.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsc2pocmVmbGFidmZkY2FnaHFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MDQ1MDEsImV4cCI6MjA5NTE4MDUwMX0.flb-RYrJ5TXSAB02Qoi0dt9mZEWJDRJ5KDdzkFMRg4Y';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);