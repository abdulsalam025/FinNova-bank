-- Allow admin cash top-up reservations in the idempotency ledger.
ALTER TABLE idempotency_keys DROP CHECK ck_idempotency_operation;
ALTER TABLE idempotency_keys
  ADD CONSTRAINT ck_idempotency_operation
  CHECK (operation IN ('TRANSFER','REPAYMENT','ADMIN_CREDIT'));