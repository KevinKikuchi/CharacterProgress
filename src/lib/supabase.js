import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zdxskzmcwbpeozbxfqba.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeHNrem1jd2JwZW96YnhmcWJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMjQzNDIsImV4cCI6MjA5MzkwMDM0Mn0.BrjNRT2rbGUaQHVoNeTfvJ930YOXnvjef0RmUcEz3W4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
