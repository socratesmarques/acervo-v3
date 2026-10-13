-- Additive upgrade: existing providers, videos and their URLs are untouched.
ALTER TABLE providers DROP CONSTRAINT providers_kind_check;
ALTER TABLE providers ADD CONSTRAINT providers_kind_check
 CHECK (kind IN ('youtube','vimeo','redecanais','blogger'));
INSERT INTO providers(id,name,kind,base_url)
 VALUES ('blogger','Blogger Video','blogger','https://www.blogger.com');
INSERT INTO provider_origins(origin,provider_id)
 VALUES ('https://www.blogger.com','blogger');
