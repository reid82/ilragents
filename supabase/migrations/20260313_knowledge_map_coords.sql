-- Add 2D map coordinates for knowledge map visualization
-- These are pre-computed via UMAP dimensionality reduction from the 1536-dim embeddings
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS map_x float;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS map_y float;
