-- Better Auth 1.7 only accepts a credential account whose accountId is the user id.
-- The demo seed stored the email there, so the seed user can no longer sign in.
UPDATE "account" a
SET "accountId" = a."userId"
FROM "user" u
WHERE u."id" = a."userId"
  AND u."email" = 'user@example.com'
  AND a."providerId" = 'credential'
  AND a."accountId" = u."email";
