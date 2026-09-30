-- Run ONLY through a verified UAT SQL executor with this transaction-local target marker.
BEGIN;
DO $$ BEGIN
 IF current_setting('app.orders_seed_project_ref',true) IS DISTINCT FROM 'meuzkduxttjcuiynsnaa' THEN RAISE EXCEPTION 'UAT target must be verified by executor'; END IF;
END $$;
INSERT INTO public."Order_products"(seed_key,name,category,work_rate_minor,is_test) VALUES
('uat-01','Philadelphia Salmon','Roll',200,true),('uat-02','Philadelphia Ebi','Roll',200,true),
('uat-03','California Salmon','Roll',200,true),('uat-04','California Ebi','Roll',200,true),
('uat-05','Futomaki Salmon','Roll',200,true),('uat-06','Futomaki Tuna','Roll',200,true),
('uat-07','Hosomaki Salmon','Maki',100,true),('uat-08','Hosomaki Cucumber','Maki',100,true),
('uat-09','Nigiri Salmon','Nigiri',100,true),('uat-10','Nigiri Ebi','Nigiri',100,true),
('uat-11','Gunkan Salmon','Gunkan',200,true),('uat-12','Gunkan Tuna','Gunkan',200,true),
('uat-13','Tempura Roll','Hot',300,true),('uat-14','Baked Salmon Roll','Hot',300,true),('uat-15','Premium Set','Set',300,true)
ON CONFLICT(seed_key) DO NOTHING;
COMMIT;
