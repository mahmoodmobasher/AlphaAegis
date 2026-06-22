import sqlite3
import os

def migrate_db(db_path):
    if not os.path.exists(db_path):
        print(f"Database file not found at: {db_path}. Skipping.")
        return
        
    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        # Check if is_active already exists
        cursor.execute("PRAGMA table_info(llm_provider_configs);")
        columns = [col[1] for col in cursor.fetchall()]
        if "is_active" not in columns:
            cursor.execute("ALTER TABLE llm_provider_configs ADD COLUMN is_active BOOLEAN DEFAULT 0 NOT NULL;")
            conn.commit()
            print("Successfully added 'is_active' column to llm_provider_configs table.")
        else:
            print("'is_active' column already exists in llm_provider_configs table.")
    except Exception as e:
        print(f"Migration error for {db_path}: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    # Get the project root path
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    migrate_db(os.path.join(base_dir, "dev.db"))
    migrate_db(os.path.join(base_dir, "test.db"))
