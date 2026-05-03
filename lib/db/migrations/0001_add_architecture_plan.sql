-- Migration: add architecture_plan column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architecture_plan TEXT;
