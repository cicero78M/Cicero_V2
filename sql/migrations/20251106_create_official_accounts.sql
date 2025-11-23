-- Create table to store official social media accounts linked to clients
CREATE TABLE IF NOT EXISTS official_accounts (
    official_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id VARCHAR NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    handle TEXT NOT NULL,
    display_name TEXT,
    links JSONB,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT official_accounts_client_platform_handle_unique UNIQUE (client_id, platform, handle)
);

-- Enforce a single primary account per platform for each client
CREATE UNIQUE INDEX IF NOT EXISTS official_accounts_primary_platform_idx
    ON official_accounts (client_id, platform)
    WHERE is_primary;

CREATE OR REPLACE FUNCTION set_official_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS official_accounts_set_updated_at ON official_accounts;
CREATE TRIGGER official_accounts_set_updated_at
BEFORE UPDATE ON official_accounts
FOR EACH ROW
EXECUTE PROCEDURE set_official_accounts_updated_at();

-- Seed Ditbinmas demo accounts for UI and cron testing
INSERT INTO official_accounts (
    client_id,
    platform,
    handle,
    display_name,
    links,
    is_primary,
    is_active,
    is_verified
)
SELECT c.client_id, demo.platform, demo.handle, demo.display_name, demo.links, demo.is_primary, demo.is_active, demo.is_verified
FROM (
    VALUES
        ('ditbinmas', 'instagram', 'ditbinmasjatim', 'Ditbinmas Polda Jatim', jsonb_build_object('profile', 'https://www.instagram.com/ditbinmasjatim/'), TRUE, TRUE, TRUE),
        ('ditbinmas', 'tiktok', 'ditbinmasjatim', 'Ditbinmas Polda Jatim', jsonb_build_object('profile', 'https://www.tiktok.com/@ditbinmasjatim'), TRUE, TRUE, FALSE)
) AS demo(client_id, platform, handle, display_name, links, is_primary, is_active, is_verified)
JOIN clients c ON c.client_id = demo.client_id
ON CONFLICT ON CONSTRAINT official_accounts_client_platform_handle_unique DO NOTHING;
