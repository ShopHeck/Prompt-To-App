-- Migration: add clarification + accuracy validation columns to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS clarifying_questions TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS clarify_answers TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS enriched_prompt TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS accuracy_report TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repair_history TEXT;
