-- Migration: add live_preview_html to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS live_preview_html TEXT;
