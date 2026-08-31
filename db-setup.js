import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://postgres:MamadoresCasados@db.zckgjlhxwsxqyvkotytx.supabase.co:5432/postgres';

async function setup() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log("Connected to the database");

    const query = `
      CREATE TABLE IF NOT EXISTS match_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
        room_id text NOT NULL,
        winner_name text NOT NULL,
        players_summary jsonb NOT NULL
      );

      ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;
      
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access for match history') THEN
              CREATE POLICY "Public read access for match history" ON match_history FOR SELECT USING (true);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public insert access for match history') THEN
              CREATE POLICY "Public insert access for match history" ON match_history FOR INSERT WITH CHECK (true);
          END IF;
      END
      $$;
    `;

    await client.query(query);
    console.log("Table match_history and policies created successfully!");

  } catch (err) {
    console.error("Error setting up DB:", err);
  } finally {
    await client.end();
  }
}

setup();
