import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mlxaljozizaarvdcssew.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1seGFsam96aXphYXJ2ZGNzc2V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTc0MjQsImV4cCI6MjA5MjYzMzQyNH0.P1neFr85TyCtuJOmc83bG_bApWnuE2oyNKtnNT_OZ2A'

export const supabase = createClient(supabaseUrl, supabaseKey)