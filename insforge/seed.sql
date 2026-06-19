-- Agent Space — seed data (Track C)
-- Apply after schema: npx @insforge/cli db import insforge/seed.sql

INSERT INTO agents (id, name, role, state, station_id, x, y, backend) VALUES
  ('agent-researcher', 'Researcher', 'researcher', 'idle', 'research', -3.0,  2.5, 'nebius'),
  ('agent-coder',      'Coder',      'coder',      'idle', 'code',      3.0,  2.5, 'nebius'),
  ('agent-planner',    'Planner',    'planner',    'idle', 'meet',      0.0, -2.0, 'nebius'),
  ('agent-social',     'Social',     'social',     'idle', 'lounge',   -3.0, -2.5, 'nebius')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  state = EXCLUDED.state,
  station_id = EXCLUDED.station_id,
  x = EXCLUDED.x,
  y = EXCLUDED.y,
  backend = EXCLUDED.backend,
  updated_at = now();
