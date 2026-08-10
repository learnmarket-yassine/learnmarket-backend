-- Refresh tokens are no longer persisted in Postgres. They now live in
-- Redis (see RefreshTokenService), keyed per user/session-family with a
-- TTL equal to their lifetime, which removes the unbounded row growth
-- this table suffered from (a new row was inserted on every refresh and
-- never cleaned up).
DROP TABLE "RefreshToken";
