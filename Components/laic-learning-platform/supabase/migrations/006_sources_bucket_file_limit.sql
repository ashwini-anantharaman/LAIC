-- Allow large textbook PDFs in the sources bucket (matches LAIC 100 MB upload cap).
-- You must also raise the project global limit in Dashboard → Storage → Settings.
update storage.buckets
set file_size_limit = 104857600  -- 100 MB
where id = 'sources';
