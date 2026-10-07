-- Bearer-capability access for guest orders; store only the SHA-256 digest.
CREATE TABLE guest_order_access (
  order_id uuid PRIMARY KEY REFERENCES customer_orders(id) ON DELETE CASCADE,
  access_token_hash text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ($$qris$$, $$va$$)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_order_access_token_hash_key UNIQUE (access_token_hash)
);
