import { createClient } from '@supabase/supabase-js'

// Exported for the Apps Script snippet in Account. ReiPosting.jsx deliberately
// keeps its own copy of this URL: importing from here would pull the supabase
// client into the public posting's bundle.
export const SUPABASE_URL = 'https://mlxaljozizaarvdcssew.supabase.co'

const supabaseUrl = SUPABASE_URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1seGFsam96aXphYXJ2ZGNzc2V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTc0MjQsImV4cCI6MjA5MjYzMzQyNH0.P1neFr85TyCtuJOmc83bG_bApWnuE2oyNKtnNT_OZ2A'

export const supabase = createClient(supabaseUrl, supabaseKey)