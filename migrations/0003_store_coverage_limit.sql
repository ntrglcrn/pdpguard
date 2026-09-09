ALTER TABLE store_audit_runs DROP CONSTRAINT store_audit_runs_selected_pdp_count_check;
ALTER TABLE store_audit_runs ADD CONSTRAINT store_audit_runs_selected_pdp_count_check CHECK (selected_pdp_count BETWEEN 1 AND 25);
ALTER TABLE store_audit_run_items DROP CONSTRAINT store_audit_run_items_position_check;
ALTER TABLE store_audit_run_items ADD CONSTRAINT store_audit_run_items_position_check CHECK (position >= 0 AND position < 25);
