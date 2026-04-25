import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cglkvfsnfeqsrqeldxxj.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnbGt2ZnNuZmVxc3JxZWxkeHhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzQ5MjAsImV4cCI6MjA5MDgxMDkyMH0.mVXZ_1tNHmaw9JLnCdiD-O82pqFlDlTpEv975oOSfTo'

export const supabase = createClient(supabaseUrl, supabaseKey)