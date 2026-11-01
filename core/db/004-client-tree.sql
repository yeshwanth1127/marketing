-- Products and brands: a client can sit under a company (brand or product) or under a brand (product).
-- Shapes allowed: company -> product, company -> brand -> product. No deeper, no loops (see docs/products-and-brands.md).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES clients(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS node_type text;
CREATE INDEX IF NOT EXISTS clients_parent ON clients(parent_id);
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_node_shape;
ALTER TABLE clients ADD CONSTRAINT clients_node_shape CHECK (
 (parent_id IS NULL AND node_type IS NULL) OR
 (parent_id IS NOT NULL AND node_type IN ('brand','product') AND parent_id<>id));
CREATE OR REPLACE FUNCTION check_client_tree() RETURNS trigger AS $$
DECLARE p clients%ROWTYPE;
BEGIN
 IF NEW.parent_id IS NOT NULL THEN
  SELECT * INTO p FROM clients WHERE id=NEW.parent_id;
  IF p.node_type='product' THEN RAISE EXCEPTION 'A product cannot have brands or products under it'; END IF;
  IF p.node_type='brand' AND NEW.node_type<>'product' THEN RAISE EXCEPTION 'Only products can sit under a brand'; END IF;
  IF NEW.node_type='brand' AND EXISTS(SELECT 1 FROM clients WHERE parent_id=NEW.id AND node_type='brand') THEN RAISE EXCEPTION 'This client has brands under it, so it cannot become a brand'; END IF;
 END IF;
 IF NEW.node_type='product' AND EXISTS(SELECT 1 FROM clients WHERE parent_id=NEW.id) THEN RAISE EXCEPTION 'This client has brands or products under it, so it cannot become a product'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS client_tree_shape ON clients;
CREATE TRIGGER client_tree_shape BEFORE INSERT OR UPDATE OF parent_id,node_type ON clients FOR EACH ROW EXECUTE FUNCTION check_client_tree();
