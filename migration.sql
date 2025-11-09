-- ChittyReception Database Schema Migration
-- Add to shared chittyos-core Neon PostgreSQL database
-- Run with: psql "$NEON_DATABASE_URL" < migration.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CHITTYRECEPTION TABLES
-- ============================================================================

-- Reception calls table
-- Tracks all inbound and outbound calls through OpenPhone
CREATE TABLE IF NOT EXISTS reception_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  call_id VARCHAR(255) NOT NULL UNIQUE, -- OpenPhone call ID
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number VARCHAR(50) NOT NULL,
  to_number VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'initiated', -- initiated, ringing, answered, completed, failed, no-answer
  duration_seconds INTEGER, -- call duration in seconds
  recording_url TEXT, -- URL to call recording if available
  transcription TEXT, -- AI transcription of the call
  metadata JSONB DEFAULT '{}', -- Additional OpenPhone metadata
  started_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reception messages table
-- Tracks all SMS messages through OpenPhone
CREATE TABLE IF NOT EXISTS reception_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL UNIQUE, -- OpenPhone message ID
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number VARCHAR(50) NOT NULL,
  to_number VARCHAR(50) NOT NULL,
  body TEXT NOT NULL, -- Message content
  status VARCHAR(50) DEFAULT 'sent', -- sent, delivered, read, failed
  metadata JSONB DEFAULT '{}', -- Additional OpenPhone metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Identity phone numbers table
-- Maps phone numbers to ChittyID identities for caller resolution
CREATE TABLE IF NOT EXISTS identity_phones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  primary_phone BOOLEAN DEFAULT false, -- Is this the primary phone for this identity
  metadata JSONB DEFAULT '{}', -- Carrier info, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identity_id, phone_number)
);

-- Reception sessions table
-- Tracks conversation sessions across multiple calls/messages
CREATE TABLE IF NOT EXISTS reception_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'active', -- active, closed, escalated
  context JSONB DEFAULT '{}', -- AI context and conversation state
  ai_summary TEXT, -- AI-generated summary of the session
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Reception calls indexes
CREATE INDEX IF NOT EXISTS idx_reception_calls_identity_id ON reception_calls(identity_id);
CREATE INDEX IF NOT EXISTS idx_reception_calls_call_id ON reception_calls(call_id);
CREATE INDEX IF NOT EXISTS idx_reception_calls_from_number ON reception_calls(from_number);
CREATE INDEX IF NOT EXISTS idx_reception_calls_to_number ON reception_calls(to_number);
CREATE INDEX IF NOT EXISTS idx_reception_calls_status ON reception_calls(status);
CREATE INDEX IF NOT EXISTS idx_reception_calls_started_at ON reception_calls(started_at DESC);

-- Reception messages indexes
CREATE INDEX IF NOT EXISTS idx_reception_messages_identity_id ON reception_messages(identity_id);
CREATE INDEX IF NOT EXISTS idx_reception_messages_message_id ON reception_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_reception_messages_from_number ON reception_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_reception_messages_to_number ON reception_messages(to_number);
CREATE INDEX IF NOT EXISTS idx_reception_messages_created_at ON reception_messages(created_at DESC);

-- Identity phones indexes
CREATE INDEX IF NOT EXISTS idx_identity_phones_identity_id ON identity_phones(identity_id);
CREATE INDEX IF NOT EXISTS idx_identity_phones_phone_number ON identity_phones(phone_number);
CREATE INDEX IF NOT EXISTS idx_identity_phones_verified ON identity_phones(verified);

-- Reception sessions indexes
CREATE INDEX IF NOT EXISTS idx_reception_sessions_identity_id ON reception_sessions(identity_id);
CREATE INDEX IF NOT EXISTS idx_reception_sessions_phone_number ON reception_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_reception_sessions_status ON reception_sessions(status);
CREATE INDEX IF NOT EXISTS idx_reception_sessions_last_interaction ON reception_sessions(last_interaction_at DESC);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all ChittyReception tables
CREATE TRIGGER update_reception_calls_updated_at
  BEFORE UPDATE ON reception_calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reception_messages_updated_at
  BEFORE UPDATE ON reception_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_identity_phones_updated_at
  BEFORE UPDATE ON identity_phones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reception_sessions_updated_at
  BEFORE UPDATE ON reception_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for call history with identity details
CREATE OR REPLACE VIEW reception_call_history AS
SELECT
  c.id,
  c.call_id,
  c.direction,
  c.from_number,
  c.to_number,
  c.status,
  c.duration_seconds,
  c.started_at,
  c.ended_at,
  i.did as identity_did,
  i.metadata as identity_metadata
FROM reception_calls c
JOIN identities i ON c.identity_id = i.id
ORDER BY c.started_at DESC;

-- View for message history with identity details
CREATE OR REPLACE VIEW reception_message_history AS
SELECT
  m.id,
  m.message_id,
  m.direction,
  m.from_number,
  m.to_number,
  m.body,
  m.status,
  m.created_at,
  i.did as identity_did,
  i.metadata as identity_metadata
FROM reception_messages m
JOIN identities i ON m.identity_id = i.id
ORDER BY m.created_at DESC;

-- ============================================================================
-- GRANT PERMISSIONS (if using specific roles)
-- ============================================================================

-- Grant permissions to application role (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chittyos_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chittyos_app;

-- ============================================================================
-- MIGRATION VERIFICATION
-- ============================================================================

-- Verify tables were created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reception_calls') THEN
    RAISE NOTICE 'ChittyReception tables created successfully';
  ELSE
    RAISE EXCEPTION 'ChittyReception table creation failed';
  END IF;
END $$;
