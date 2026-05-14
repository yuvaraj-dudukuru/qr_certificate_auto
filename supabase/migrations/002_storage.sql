-- Storage bucket for issued certificate PDFs.
-- Path scheme:  certificates/<cert_number>.pdf
-- Access model: private. Service role uploads + creates signed URLs.
--               No public RLS policies — anonymous clients cannot list,
--               read, or write objects here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificates',
  'certificates',
  false,
  10485760,                                  -- 10 MB per object (cert PDFs are ~200KB; cap leaves headroom)
  array['application/pdf']
)
on conflict (id) do nothing;

-- No "create policy ... for select using (...)" — the bucket is private and
-- the service role bypasses RLS, which is the only writer/reader.
