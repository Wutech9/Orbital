-- Orbital database schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(32) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    stripe_customer_id VARCHAR(255),
    is_vip          BOOLEAN NOT NULL DEFAULT FALSE,
    vip_expires_at  TIMESTAMPTZ,
    selected_skin   VARCHAR(64) DEFAULT 'default',
    selected_trail  VARCHAR(64) DEFAULT 'none',
    selected_badge  VARCHAR(64) DEFAULT 'none',
    high_score      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cosmetics_owned (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cosmetic_id     VARCHAR(64) NOT NULL,
    purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, cosmetic_id)
);

CREATE TABLE IF NOT EXISTS purchases (
    id                      SERIAL PRIMARY KEY,
    user_id                 INT REFERENCES users(id) ON DELETE SET NULL,
    stripe_session_id       VARCHAR(255) UNIQUE,
    stripe_payment_intent   VARCHAR(255),
    cosmetic_id             VARCHAR(64),
    amount_cents            INT,
    currency                VARCHAR(8),
    status                  VARCHAR(32),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                      SERIAL PRIMARY KEY,
    user_id                 INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id  VARCHAR(255) UNIQUE,
    status                  VARCHAR(32),
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cosmetics_user ON cosmetics_owned(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
