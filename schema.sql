-- Drop existing tables if any
DROP TABLE IF EXISTS progress_logs;
DROP TABLE IF EXISTS sessions;

-- Table to store power leveling sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_name TEXT NOT NULL,
    start_level INTEGER NOT NULL,
    target_level INTEGER NOT NULL,
    current_day INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    timer_status TEXT DEFAULT 'stopped', -- running, paused, stopped
    timer_started_at TIMESTAMP WITH TIME ZONE,
    total_active_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to store progress updates
CREATE TABLE progress_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    exp_percent NUMERIC(6,4) NOT NULL DEFAULT 0,
    image_url TEXT,
    notes TEXT,
    log_type TEXT DEFAULT 'update', -- 'start', 'update', 'end'
    billed_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration: add billed_seconds column to progress_logs
ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS billed_seconds INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read Sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Public Read Logs" ON progress_logs FOR SELECT USING (true);
CREATE POLICY "Pilot Insert Sessions" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Pilot Insert Logs" ON progress_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Pilot Update Sessions" ON sessions FOR UPDATE USING (true);
CREATE POLICY "Pilot Update Logs" ON progress_logs FOR UPDATE USING (true);
CREATE POLICY "Pilot Delete Sessions" ON sessions FOR DELETE USING (true);
CREATE POLICY "Pilot Delete Logs" ON progress_logs FOR DELETE USING (true);

-- Storage bucket for screenshots
-- Run these in the Supabase SQL editor:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('screenshots', 'screenshots', true)
-- ON CONFLICT (id) DO NOTHING;
-- CREATE POLICY "Public Read" ON storage.objects FOR SELECT USING (bucket_id = 'screenshots');
-- CREATE POLICY "Pilot Access" ON storage.objects FOR ALL USING (bucket_id = 'screenshots') WITH CHECK (bucket_id = 'screenshots');
