-- Extra product photos for the full-size viewer. NULL means "not read yet": the catalog sweep
-- refreshes until every row has been read once with the new format.
alter table shopping_catalog_items add column if not exists gallery jsonb;
