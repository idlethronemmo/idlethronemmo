-- Add task_queue column to players table for task queue system
ALTER TABLE players ADD COLUMN IF NOT EXISTS task_queue jsonb DEFAULT '[]'::jsonb;
