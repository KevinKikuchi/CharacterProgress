
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zdxskzmcwbpeozbxfqba.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeHNrem1jd2JwZW96YnhmcWJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMjQzNDIsImV4cCI6MjA5MzkwMDM0Mn0.BrjNRT2rbGUaQHVoNeTfvJ930YOXnvjef0RmUcEz3W4';
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .ilike('character_name', '%Bong%');

  if (!sessions || sessions.length === 0) {
    console.log('Session "Bong" not found.');
    return;
  }

  const bong = sessions[0];
  console.log(`Found session: ${bong.character_name} (${bong.id})`);

  const { data: logs } = await supabase
    .from('progress_logs')
    .select('*')
    .eq('session_id', bong.id)
    .eq('log_type', 'start')
    .order('created_at', { ascending: true });

  if (!logs || logs.length < 4) {
    console.log(`Only found ${logs?.length || 0} start logs. Day 4 might not exist.`);
    return;
  }

  const day4Log = logs[3];
  console.log(`Found Day 4 start log: ${day4Log.id} created at ${day4Log.created_at}`);
  
  const { error } = await supabase
    .from('progress_logs')
    .delete()
    .eq('id', day4Log.id);

  if (error) {
    console.error('Error deleting log:', error);
  } else {
    console.log('Successfully deleted Day 4 start log.');
  }
}

cleanup();
