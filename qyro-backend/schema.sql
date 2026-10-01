-- Deprecated. The live schema is prisma/schema.prisma.
-- Apply changes with prisma migrate, not this file.

-- QYRO Assurance Engine - PostgreSQL Schema

CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    discovery_source VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS frameworks (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS controls (
    id VARCHAR(255) PRIMARY KEY,
    framework_id VARCHAR(255) REFERENCES frameworks(id),
    name VARCHAR(255) NOT NULL,
    intent_description TEXT,
    requirement_type VARCHAR(100) -- e.g., 'DENY', 'ALLOW'
);

CREATE TABLE IF NOT EXISTS control_results (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(255) REFERENCES agents(id),
    control_id VARCHAR(255) REFERENCES controls(id),
    state VARCHAR(50) NOT NULL, -- 'EFFECTIVE', 'INEFFECTIVE', 'VIOLATED', 'BLOCKED_VIOLATION', 'UNKNOWN', 'NOT_TESTED'
    evidence_payload JSONB,
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runtime_events (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(255) REFERENCES agents(id),
    event_type VARCHAR(100) NOT NULL,
    operation VARCHAR(255),
    resource VARCHAR(255),
    timestamp TIMESTAMP NOT NULL,
    raw_payload JSONB
);
